use snapfzz_cef::download::{CefBuildInfo, CefDownloader};
use snapfzz_cef::runtime::CefRuntime;
use snapfzz_cef::types::{CefError, ConsoleMessage, DownloadProgress, WindowConfig};
use std::sync::Arc;
use tauri::async_runtime::Mutex;

#[derive(Clone)]
pub struct CefState {
    pub runtime: Arc<Mutex<CefRuntime>>,
    pub downloader: Arc<CefDownloader>,
}

#[tauri::command]
pub async fn cef_download_start(
    state: tauri::State<'_, CefState>,
) -> Result<Vec<DownloadProgress>, String> {
    state
        .downloader
        .download_events()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cef_download_status(
    state: tauri::State<'_, CefState>,
) -> Result<DownloadProgress, String> {
    Ok(download_status_from_downloader(&state.downloader).await)
}

#[tauri::command]
pub async fn cef_download_cancel(
    state: tauri::State<'_, CefState>,
) -> Result<(), String> {
    state.downloader.cancel_download();
    Ok(())
}

#[tauri::command]
pub async fn cef_resolve_build(
    state: tauri::State<'_, CefState>,
) -> Result<CefBuildInfo, String> {
    state
        .downloader
        .resolve_latest_build()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cef_is_ready(state: tauri::State<'_, CefState>) -> Result<bool, String> {
    let runtime = state.runtime.lock().await;
    Ok(runtime.is_ready())
}

#[tauri::command]
pub async fn cef_open_window(
    id: String,
    url: String,
    config: Option<WindowConfig>,
    state: tauri::State<'_, CefState>,
) -> Result<(), String> {
    let mut runtime = state.runtime.lock().await;
    runtime
        .ensure_ready(&state.downloader)
        .await
        .map_err(|e| e.to_string())?;
    runtime
        .create_window(&id, &url, config.unwrap_or_default())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn cef_close_window(id: String, state: tauri::State<'_, CefState>) -> Result<(), String> {
    let mut runtime = state.runtime.lock().await;
    runtime.close_window(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cef_navigate(
    id: String,
    url: String,
    state: tauri::State<'_, CefState>,
) -> Result<(), String> {
    let mut runtime = state.runtime.lock().await;
    runtime.navigate_window(&id, &url).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cef_go_back(id: String, state: tauri::State<'_, CefState>) -> Result<(), String> {
    let mut runtime = state.runtime.lock().await;
    runtime.go_back(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cef_reload(id: String, state: tauri::State<'_, CefState>) -> Result<(), String> {
    let mut runtime = state.runtime.lock().await;
    runtime.reload_window(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cef_devtools(
    id: String,
    open: bool,
    state: tauri::State<'_, CefState>,
) -> Result<(), String> {
    let mut runtime = state.runtime.lock().await;
    runtime.set_devtools(&id, open).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cef_screenshot(id: String, state: tauri::State<'_, CefState>) -> Result<Vec<u8>, String> {
    let mut runtime = state.runtime.lock().await;
    runtime.capture_screenshot(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cef_console_messages(
    id: String,
    clear_after_read: Option<bool>,
    state: tauri::State<'_, CefState>,
) -> Result<Vec<ConsoleMessage>, String> {
    let mut runtime = state.runtime.lock().await;
    let messages = runtime.console_messages(&id).map_err(|e| e.to_string())?;
    if clear_after_read.unwrap_or(false) {
        runtime.clear_console_messages(&id).map_err(|e| e.to_string())?;
    }
    Ok(messages)
}

fn find_archive_size(install_dir: &std::path::Path) -> u64 {
    std::fs::read_dir(install_dir)
        .ok()
        .and_then(|entries| {
            entries
                .filter_map(|e| e.ok())
                .find(|e| e.file_name().to_string_lossy().ends_with(".tar.bz2"))
                .and_then(|e| e.metadata().ok())
                .map(|m| m.len())
        })
        .unwrap_or(0)
}

async fn download_status_from_downloader(downloader: &CefDownloader) -> DownloadProgress {
    let bytes_downloaded = find_archive_size(downloader.install_dir());
    let installed = downloader.is_installed();
    let status = if installed {
        snapfzz_cef::types::DownloadStatus::Ready
    } else if bytes_downloaded > 0 {
        snapfzz_cef::types::DownloadStatus::Downloading
    } else {
        snapfzz_cef::types::DownloadStatus::Verifying
    };

    let bytes_total = if installed {
        bytes_downloaded.max(1)
    } else {
        bytes_downloaded.saturating_add(1024).max(1)
    };

    DownloadProgress {
        bytes_downloaded,
        bytes_total,
        percent: if installed {
            100.0
        } else if bytes_total == 0 {
            0.0
        } else {
            ((bytes_downloaded as f32 / bytes_total as f32) * 100.0).min(100.0)
        },
        status,
    }
}

fn platform_display_name(platform: &str) -> &'static str {
    match platform {
        "macos-arm64" => "macOS (Apple Silicon)",
        "macos-x64" => "macOS (Intel)",
        "linux-x64" => "Linux (x86_64)",
        "windows-x64" => "Windows (x64)",
        _ => "Unknown platform",
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CefPlatformInfo {
    pub platform: String,
    pub platform_display: String,
    pub download_url: String,
    pub install_path: String,
    pub is_installed: bool,
}

#[tauri::command]
pub async fn cef_platform_info(
    state: tauri::State<'_, CefState>,
) -> Result<CefPlatformInfo, String> {
    let download_url = state
        .downloader
        .resolve_latest_build()
        .await
        .map(|build| build.download_url)
        .unwrap_or_else(|_| state.downloader.download_url());

    Ok(CefPlatformInfo {
        platform: state.downloader.platform().to_string(),
        platform_display: platform_display_name(state.downloader.platform()).to_string(),
        download_url,
        install_path: state.downloader.install_dir().to_string_lossy().to_string(),
        is_installed: state.downloader.is_installed(),
    })
}

pub fn map_cef_error(error: CefError) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use snapfzz_cef::download::CefDownloader;
    use snapfzz_cef::types::{CefError, DownloadStatus};
    use std::sync::Arc;
    use tauri::{
        test::{mock_builder, mock_context, noop_assets},
        Manager,
    };

    fn create_test_tar_bz2(path: &std::path::Path, files: &[(&str, &[u8])]) {
        use std::io::Write;
        let file = std::fs::File::create(path).unwrap();
        let compressor = bzip2::write::BzEncoder::new(file, bzip2::Compression::fast());
        let mut archive = tar::Builder::new(compressor);
        for (name, data) in files {
            let mut header = tar::Header::new_gnu();
            header.set_size(data.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            archive.append_data(&mut header, name, &data[..]).unwrap();
        }
        archive.finish().unwrap();
    }

    fn build_cef_app(installed: bool) -> (tempfile::TempDir, tauri::App<tauri::test::MockRuntime>) {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("runtime").join("cef");
        std::fs::create_dir_all(&install_dir).expect("create install dir");
        if installed {
            std::fs::create_dir_all(
                install_dir.join("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64"),
            )
            .expect("create marker");
        }

        let state = CefState {
            runtime: Arc::new(Mutex::new(CefRuntime::new(temp.path()))),
            downloader: Arc::new(CefDownloader::new(install_dir, "macos-arm64".to_string())),
        };

        let app = mock_builder()
            .manage(state)
            .build(mock_context(noop_assets()))
            .expect("build app");

        (temp, app)
    }

    #[test]
    fn a015_commands_cef_error_mapping_returns_human_readable_string() {
        let message = super::map_cef_error(CefError::invalid_state("runtime not ready"));
        assert!(message.contains("runtime not ready"));
    }

    #[test]
    fn a015_commands_cef_module_exports_expected_commands() {
        let _download_start = super::cef_download_start;
        let _download_status = super::cef_download_status;
        let _is_ready = super::cef_is_ready;
        let _open_window = super::cef_open_window;
        let _close_window = super::cef_close_window;
        let _navigate = super::cef_navigate;
        let _go_back = super::cef_go_back;
        let _reload = super::cef_reload;
        let _devtools = super::cef_devtools;
        let _screenshot = super::cef_screenshot;
        let _console_messages = super::cef_console_messages;
        let _platform_info = super::cef_platform_info;
    }

    #[tokio::test]
    async fn a015_commands_cef_download_status_reports_verifying_before_download() {
        let temp = tempfile::tempdir().expect("tempdir");
        let downloader = CefDownloader::new(temp.path().join("cef"), "macos-arm64".to_string());

        let progress = super::download_status_from_downloader(&downloader).await;

        assert!(matches!(progress.status, DownloadStatus::Verifying));
        assert_eq!(progress.bytes_downloaded, 0);
        assert_eq!(progress.bytes_total, 1024);
    }

    #[tokio::test]
    async fn a015_commands_cef_download_status_reports_downloading_when_archive_exists() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create install dir");
        std::fs::write(install_dir.join("cef_binary.tar.bz2"), vec![7_u8; 256]).expect("write archive");
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());

        let progress = super::download_status_from_downloader(&downloader).await;

        assert!(matches!(progress.status, DownloadStatus::Downloading));
        assert_eq!(progress.bytes_downloaded, 256);
        assert_eq!(progress.bytes_total, 1280);
        assert!(progress.percent > 0.0);
    }

    #[tokio::test]
    async fn a015_commands_cef_download_status_reports_ready_after_extract() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create install dir");
        create_test_tar_bz2(
            &install_dir.join("cef_binary_test.tar.bz2"),
            &[("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64/marker.txt", b"ready")],
        );
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        downloader.extract_cef().await.expect("real extraction");

        let progress = super::download_status_from_downloader(&downloader).await;

        assert!(matches!(progress.status, DownloadStatus::Ready));
        assert_eq!(progress.percent, 100.0);
    }

    #[tokio::test]
    async fn a015_commands_cef_is_ready_reflects_runtime_state() {
        let (_temp, app) = build_cef_app(false);

        let ready_before = cef_is_ready(app.state::<CefState>())
            .await
            .expect("ready status");
        assert!(!ready_before);

        {
            let state = app.state::<CefState>();
            let mut runtime = state.runtime.lock().await;
            runtime.ensure_ready(&state.downloader).await.expect_err("not installed yet");
        }
    }

    #[tokio::test]
    async fn a015_commands_cef_open_window_requires_ready_runtime() {
        let (_temp, app) = build_cef_app(false);

        let err = cef_open_window(
            "miniapp-1".to_string(),
            "http://127.0.0.1:3000".to_string(),
            None,
            app.state::<CefState>(),
        )
        .await
        .expect_err("open window should fail before install");
        assert!(err.contains("not installed") || err.contains("runtime is not installed"));
    }

    #[tokio::test]
    async fn a015_commands_cef_window_commands_round_trip_after_ready() {
        let (_temp, app) = build_cef_app(true);

        cef_open_window(
            "miniapp-1".to_string(),
            "http://127.0.0.1:3000".to_string(),
            None,
            app.state::<CefState>(),
        )
        .await
        .expect("open window");

        assert!(cef_is_ready(app.state::<CefState>()).await.expect("ready"));

        cef_navigate(
            "miniapp-1".to_string(),
            "http://127.0.0.1:4000".to_string(),
            app.state::<CefState>(),
        )
        .await
        .expect("navigate");
        cef_go_back("miniapp-1".to_string(), app.state::<CefState>())
            .await
            .expect("go back");
        cef_reload("miniapp-1".to_string(), app.state::<CefState>())
            .await
            .expect("reload");
        cef_devtools("miniapp-1".to_string(), true, app.state::<CefState>())
            .await
            .expect("open devtools");

        let screenshot = cef_screenshot("miniapp-1".to_string(), app.state::<CefState>())
            .await
            .expect("screenshot");
        assert!(screenshot.starts_with(&[0x89, b'P', b'N', b'G']));

        let messages = cef_console_messages(
            "miniapp-1".to_string(),
            Some(true),
            app.state::<CefState>(),
        )
        .await
        .expect("console messages");
        assert!(messages.is_empty());

        cef_close_window("miniapp-1".to_string(), app.state::<CefState>())
            .await
            .expect("close window");
    }

    #[tokio::test]
    async fn a015_commands_cef_console_messages_reject_unknown_window() {
        let (_temp, app) = build_cef_app(true);
        let err = cef_console_messages(
            "missing".to_string(),
            Some(true),
            app.state::<CefState>(),
        )
        .await
        .expect_err("missing window should fail");
        assert!(err.contains("not found"));
    }

    #[tokio::test]
    async fn a015_commands_cef_platform_info_returns_displayed_platform_source_and_install_path() {
        let (_temp, app) = build_cef_app(true);

        let info = cef_platform_info(app.state::<CefState>())
            .await
            .expect("platform info");

        assert_eq!(info.platform, "macos-arm64");
        assert_eq!(info.platform_display, "macOS (Apple Silicon)");
        assert!(info.download_url.contains("cef-builds.spotifycdn.com"));
        assert!(info.install_path.ends_with("runtime/cef"));
        assert!(info.is_installed);
    }

    #[tokio::test]
    async fn a015_commands_cef_download_start_collects_progress_events() {
        let (_temp, app) = build_cef_app(false);
        let events = cef_download_start(app.state::<CefState>())
            .await
            .expect("download events");

        assert!(!events.is_empty());
        assert_eq!(events.last().map(|event| &event.status), Some(&DownloadStatus::Ready));
    }
}

