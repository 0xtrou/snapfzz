use snapfzz_kernel::components::{
    ComponentInfo, ComponentRegistry, DownloadProgress, DownloadStatus,
};
use std::sync::Arc;

#[tauri::command]
pub async fn component_list(
    registry: tauri::State<'_, Arc<ComponentRegistry>>,
) -> Result<Vec<ComponentInfo>, String> {
    let mut infos = Vec::new();
    for component in registry.list() {
        match component.resolve().await {
            Ok(info) => infos.push(info),
            Err(e) => {
                infos.push(ComponentInfo {
                    id: component.id().into(),
                    name: component.name().into(),
                    version: String::new(),
                    platform: String::new(),
                    platform_display: String::new(),
                    download_url: String::new(),
                    install_path: component.install_dir().to_string_lossy().into(),
                    size: 0,
                    checksum: String::new(),
                    checksum_algorithm: String::new(),
                    is_installed: component.is_installed(),
                });
                eprintln!("[components] Failed to resolve {}: {e}", component.id());
            }
        }
    }
    Ok(infos)
}

#[tauri::command]
pub async fn component_info(
    id: String,
    registry: tauri::State<'_, Arc<ComponentRegistry>>,
) -> Result<ComponentInfo, String> {
    let component = registry
        .get(&id)
        .ok_or_else(|| format!("Component '{id}' not found"))?;
    component.resolve().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn component_download(
    id: String,
    registry: tauri::State<'_, Arc<ComponentRegistry>>,
) -> Result<Vec<DownloadProgress>, String> {
    let component = registry
        .get(&id)
        .ok_or_else(|| format!("Component '{id}' not found"))?;
    component.clear_cancel();
    component.download().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn component_download_cancel(
    id: String,
    registry: tauri::State<'_, Arc<ComponentRegistry>>,
) -> Result<(), String> {
    let component = registry
        .get(&id)
        .ok_or_else(|| format!("Component '{id}' not found"))?;
    component.cancel();
    Ok(())
}

#[tauri::command]
pub async fn component_status(
    id: String,
    registry: tauri::State<'_, Arc<ComponentRegistry>>,
) -> Result<DownloadProgress, String> {
    let component = registry
        .get(&id)
        .ok_or_else(|| format!("Component '{id}' not found"))?;

    let is_installed = component.is_installed();
    let install_dir = component.install_dir();
    let archive_size = find_archive_size(install_dir);

    let status = if is_installed {
        DownloadStatus::Ready
    } else if archive_size > 0 {
        DownloadStatus::Downloading
    } else {
        DownloadStatus::Pending
    };

    let bytes_total = if is_installed {
        archive_size.max(1)
    } else {
        archive_size.saturating_add(1024).max(1)
    };

    Ok(DownloadProgress {
        component_id: id,
        bytes_downloaded: archive_size,
        bytes_total,
        percent: if is_installed {
            100.0
        } else if bytes_total == 0 {
            0.0
        } else {
            ((archive_size as f32 / bytes_total as f32) * 100.0).min(100.0)
        },
        status,
    })
}

#[tauri::command]
pub async fn component_verify(
    id: String,
    registry: tauri::State<'_, Arc<ComponentRegistry>>,
) -> Result<String, String> {
    let component = registry
        .get(&id)
        .ok_or_else(|| format!("Component '{id}' not found"))?;
    component.verify().await.map_err(|e| e.to_string())
}

fn find_archive_size(install_dir: &std::path::Path) -> u64 {
    std::fs::read_dir(install_dir)
        .ok()
        .and_then(|entries| {
            entries
                .filter_map(|e| e.ok())
                .find(|e| {
                    let name = e.file_name();
                    let s = name.to_string_lossy();
                    s.ends_with(".tar.bz2") || s.ends_with(".tar.gz") || s.ends_with(".zip")
                })
                .and_then(|e| e.metadata().ok())
                .map(|m| m.len())
        })
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use snapfzz_kernel::components::component::{ComponentError, SystemComponent};
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, Ordering};
    use tauri::Manager;

    struct TestComponent {
        dir: PathBuf,
        installed: bool,
        cancelled: AtomicBool,
    }

    impl TestComponent {
        fn new(dir: PathBuf, installed: bool) -> Self {
            Self {
                dir,
                installed,
                cancelled: AtomicBool::new(false),
            }
        }
    }

    #[async_trait::async_trait]
    impl SystemComponent for TestComponent {
        fn id(&self) -> &str { "test-component" }
        fn name(&self) -> &str { "Test Component" }
        fn install_dir(&self) -> &Path { &self.dir }
        fn is_installed(&self) -> bool { self.installed }
        async fn resolve(&self) -> Result<ComponentInfo, ComponentError> {
            Ok(ComponentInfo {
                id: "test-component".into(),
                name: "Test Component".into(),
                version: "1.0.0".into(),
                platform: "test-platform".into(),
                platform_display: "Test".into(),
                download_url: "https://example.com/test.tar.bz2".into(),
                install_path: self.dir.to_string_lossy().into(),
                size: 1000,
                checksum: "abc123".into(),
                checksum_algorithm: "sha1".into(),
                is_installed: self.installed,
            })
        }
        async fn download(&self) -> Result<Vec<DownloadProgress>, ComponentError> {
            Ok(vec![DownloadProgress {
                component_id: "test-component".into(),
                bytes_downloaded: 1000,
                bytes_total: 1000,
                percent: 100.0,
                status: DownloadStatus::Ready,
            }])
        }
        fn cancel(&self) { self.cancelled.store(true, Ordering::SeqCst); }
        fn clear_cancel(&self) { self.cancelled.store(false, Ordering::SeqCst); }
        async fn verify(&self) -> Result<String, ComponentError> { Ok("test-hash".into()) }
        async fn extract(&self) -> Result<(), ComponentError> { Ok(()) }
    }

    fn make_registry(installed: bool) -> Arc<ComponentRegistry> {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path().to_path_buf();
        std::mem::forget(temp);
        let mut registry = ComponentRegistry::new();
        registry.register(Arc::new(TestComponent::new(dir, installed)));
        Arc::new(registry)
    }

    #[tokio::test]
    async fn a014_components_cmd_component_list_returns_all() {
        let registry = make_registry(false);
        let app = tauri::test::mock_builder()
            .manage(registry)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let infos = component_list(app.state()).await.unwrap();
        assert_eq!(infos.len(), 1);
        assert_eq!(infos[0].id, "test-component");
    }

    #[tokio::test]
    async fn a014_components_cmd_component_info_returns_info() {
        let registry = make_registry(false);
        let app = tauri::test::mock_builder()
            .manage(registry)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let info = component_info("test-component".into(), app.state()).await.unwrap();
        assert_eq!(info.name, "Test Component");
        assert_eq!(info.version, "1.0.0");
    }

    #[tokio::test]
    async fn a014_components_cmd_component_info_returns_error_for_unknown() {
        let registry = make_registry(false);
        let app = tauri::test::mock_builder()
            .manage(registry)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let err = component_info("nonexistent".into(), app.state()).await.unwrap_err();
        assert!(err.contains("not found"));
    }

    #[tokio::test]
    async fn a014_components_cmd_component_download_returns_progress() {
        let registry = make_registry(false);
        let app = tauri::test::mock_builder()
            .manage(registry)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let events = component_download("test-component".into(), app.state()).await.unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].status, DownloadStatus::Ready);
    }

    #[tokio::test]
    async fn a014_components_cmd_component_download_cancel_succeeds() {
        let registry = make_registry(false);
        let app = tauri::test::mock_builder()
            .manage(registry)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        component_download_cancel("test-component".into(), app.state()).await.unwrap();
    }

    #[tokio::test]
    async fn a014_components_cmd_component_status_returns_pending() {
        let registry = make_registry(false);
        let app = tauri::test::mock_builder()
            .manage(registry)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let status = component_status("test-component".into(), app.state()).await.unwrap();
        assert_eq!(status.status, DownloadStatus::Pending);
    }

    #[tokio::test]
    async fn a014_components_cmd_component_status_returns_ready_when_installed() {
        let registry = make_registry(true);
        let app = tauri::test::mock_builder()
            .manage(registry)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let status = component_status("test-component".into(), app.state()).await.unwrap();
        assert_eq!(status.status, DownloadStatus::Ready);
        assert_eq!(status.percent, 100.0);
    }

    #[tokio::test]
    async fn a014_components_cmd_component_verify_returns_hash() {
        let registry = make_registry(false);
        let app = tauri::test::mock_builder()
            .manage(registry)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let hash = component_verify("test-component".into(), app.state()).await.unwrap();
        assert_eq!(hash, "test-hash");
    }

    struct FailingComponent {
        dir: PathBuf,
    }

    #[async_trait::async_trait]
    impl SystemComponent for FailingComponent {
        fn id(&self) -> &str { "failing" }
        fn name(&self) -> &str { "Failing Component" }
        fn install_dir(&self) -> &Path { &self.dir }
        fn is_installed(&self) -> bool { false }
        async fn resolve(&self) -> Result<ComponentInfo, ComponentError> {
            Err(ComponentError::network("resolve failed"))
        }
        async fn download(&self) -> Result<Vec<DownloadProgress>, ComponentError> {
            Err(ComponentError::network("download failed"))
        }
        fn cancel(&self) {}
        fn clear_cancel(&self) {}
        async fn verify(&self) -> Result<String, ComponentError> {
            Err(ComponentError::network("verify failed"))
        }
        async fn extract(&self) -> Result<(), ComponentError> {
            Err(ComponentError::network("extract failed"))
        }
    }

    #[tokio::test]
    async fn a014_components_cmd_component_list_handles_resolve_failure() {
        let mut registry = ComponentRegistry::new();
        registry.register(Arc::new(FailingComponent {
            dir: PathBuf::from("/tmp/failing"),
        }));
        let registry = Arc::new(registry);
        let app = tauri::test::mock_builder()
            .manage(registry)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let infos = component_list(app.state()).await.unwrap();
        assert_eq!(infos.len(), 1);
        assert_eq!(infos[0].id, "failing");
        assert!(infos[0].download_url.is_empty());
    }

    #[tokio::test]
    async fn a014_components_cmd_component_download_returns_error_for_unknown() {
        let registry = Arc::new(ComponentRegistry::new());
        let app = tauri::test::mock_builder()
            .manage(registry)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let err = component_download("nonexistent".into(), app.state()).await.unwrap_err();
        assert!(err.contains("not found"));
    }

    #[tokio::test]
    async fn a014_components_cmd_component_download_cancel_returns_error_for_unknown() {
        let registry = Arc::new(ComponentRegistry::new());
        let app = tauri::test::mock_builder()
            .manage(registry)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let err = component_download_cancel("nonexistent".into(), app.state()).await.unwrap_err();
        assert!(err.contains("not found"));
    }

    #[tokio::test]
    async fn a014_components_cmd_component_status_returns_error_for_unknown() {
        let registry = Arc::new(ComponentRegistry::new());
        let app = tauri::test::mock_builder()
            .manage(registry)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let err = component_status("nonexistent".into(), app.state()).await.unwrap_err();
        assert!(err.contains("not found"));
    }

    #[tokio::test]
    async fn a014_components_cmd_component_verify_returns_error_for_unknown() {
        let registry = Arc::new(ComponentRegistry::new());
        let app = tauri::test::mock_builder()
            .manage(registry)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let err = component_verify("nonexistent".into(), app.state()).await.unwrap_err();
        assert!(err.contains("not found"));
    }

    #[test]
    fn a014_components_find_archive_size_returns_zero_for_empty_dir() {
        let temp = tempfile::tempdir().unwrap();
        assert_eq!(find_archive_size(temp.path()), 0);
    }

    #[test]
    fn a014_components_find_archive_size_finds_tar_bz2() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("cef.tar.bz2"), vec![0u8; 1024]).unwrap();
        assert_eq!(find_archive_size(temp.path()), 1024);
    }

    #[test]
    fn a014_components_find_archive_size_finds_tar_gz() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("llama.tar.gz"), vec![0u8; 2048]).unwrap();
        assert_eq!(find_archive_size(temp.path()), 2048);
    }

    #[test]
    fn a014_components_find_archive_size_returns_zero_for_nonexistent_dir() {
        assert_eq!(find_archive_size(std::path::Path::new("/nonexistent/path")), 0);
    }
}
