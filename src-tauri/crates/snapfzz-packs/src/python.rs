use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use snapfzz_kernel::components::{
    ComponentError, ComponentInfo, DownloadProgress, DownloadStatus, SystemComponent,
};

use crate::platform::detect_platform;

#[derive(Debug, Clone)]
pub struct PythonComponent {
    uv_binary: PathBuf,
    install_dir: PathBuf,
    version: String,
    cancelled: Arc<AtomicBool>,
}

impl PythonComponent {
    pub fn new(uv_binary: PathBuf, install_dir: PathBuf, version: String) -> Self {
        Self {
            uv_binary,
            install_dir,
            version,
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    fn run_uv<I, S>(&self, args: I) -> Result<std::process::Output, ComponentError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<std::ffi::OsStr>,
    {
        Command::new(&self.uv_binary)
            .args(args)
            .output()
            .map_err(ComponentError::from)
    }
}

#[async_trait::async_trait]
impl SystemComponent for PythonComponent {
    fn id(&self) -> &str {
        "python"
    }

    fn name(&self) -> &str {
        "Python 3.12"
    }

    fn install_dir(&self) -> &Path {
        &self.install_dir
    }

    fn is_installed(&self) -> bool {
        match self.run_uv(["python", "find", self.version.as_str()]) {
            Ok(output) => output.status.success(),
            Err(_) => false,
        }
    }

    async fn resolve(&self) -> Result<ComponentInfo, ComponentError> {
        Ok(ComponentInfo {
            id: "python".into(),
            name: "Python 3.12".into(),
            description: "Python runtime managed by uv. Required for AgentScope and Python-based packs.".into(),
            license: "PSF-2.0".into(),
            version: self.version.clone(),
            platform: detect_platform()?.platform,
            platform_display: detect_platform()?.display.to_string(),
            download_url: String::new(),
            install_path: self.install_dir.to_string_lossy().into_owned(),
            size: 0,
            checksum: String::new(),
            checksum_algorithm: String::new(),
            is_installed: self.is_installed(),
        })
    }

    async fn download(&self) -> Result<Vec<DownloadProgress>, ComponentError> {
        std::fs::create_dir_all(&self.install_dir)?;
        if self.cancelled.load(Ordering::SeqCst) {
            return Ok(vec![DownloadProgress {
                component_id: self.id().into(),
                bytes_downloaded: 0,
                bytes_total: 0,
                percent: 0.0,
                status: DownloadStatus::Cancelled,
            }]);
        }

        let mut progress = vec![DownloadProgress {
            component_id: self.id().into(),
            bytes_downloaded: 0,
            bytes_total: 1,
            percent: 0.0,
            status: DownloadStatus::Downloading,
        }];

        let output = self.run_uv([
            "python",
            "install",
            self.version.as_str(),
            "--install-dir",
            self.install_dir.to_string_lossy().as_ref(),
        ])?;

        if !output.status.success() {
            return Err(ComponentError::internal(format!(
                "uv python install failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        progress.push(DownloadProgress {
            component_id: self.id().into(),
            bytes_downloaded: 1,
            bytes_total: 1,
            percent: 100.0,
            status: DownloadStatus::Ready,
        });

        Ok(progress)
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    fn clear_cancel(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }

    async fn verify(&self) -> Result<String, ComponentError> {
        let output = self.run_uv(["run", "python", "--version"])?;
        if !output.status.success() {
            return Err(ComponentError::internal(format!(
                "python verification failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            Ok(String::from_utf8_lossy(&output.stderr).trim().to_string())
        } else {
            Ok(stdout)
        }
    }

    async fn extract(&self) -> Result<(), ComponentError> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_script(path: &Path, script: &str) {
        std::fs::write(path, script.as_bytes()).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = std::fs::metadata(path).unwrap().permissions();
            permissions.set_mode(0o755);
            std::fs::set_permissions(path, permissions).unwrap();
        }
    }

    fn setup_mock_uv(script: &str) -> (tempfile::TempDir, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let uv = temp.path().join("uv");
        write_script(&uv, script);
        (temp, uv)
    }

    #[test]
    fn t32_python_is_installed_false_when_uv_fails() {
        let (_temp, uv) = setup_mock_uv("#!/bin/sh\nexit 1\n");
        let component = PythonComponent::new(uv, PathBuf::from("/tmp/python"), "3.12".to_string());
        assert!(!component.is_installed());
    }

    #[test]
    fn t32_python_is_installed_true_when_uv_finds_version() {
        let (_temp, uv) = setup_mock_uv("#!/bin/sh\nif [ \"$1\" = \"python\" ] && [ \"$2\" = \"find\" ]; then exit 0; fi\nexit 1\n");
        let component = PythonComponent::new(uv, PathBuf::from("/tmp/python"), "3.12".to_string());
        assert!(component.is_installed());
    }

    #[test]
    fn t32_python_cancel_and_clear_cancel_toggle_flag() {
        let (_temp, uv) = setup_mock_uv("#!/bin/sh\nexit 0\n");
        let component = PythonComponent::new(uv, PathBuf::from("/tmp/python"), "3.12".to_string());
        assert!(!component.cancelled.load(Ordering::SeqCst));
        component.cancel();
        assert!(component.cancelled.load(Ordering::SeqCst));
        component.clear_cancel();
        assert!(!component.cancelled.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn t32_python_download_returns_cancelled_when_pre_cancelled() {
        let (_temp, uv) = setup_mock_uv("#!/bin/sh\nexit 0\n");
        let install_dir = tempfile::tempdir().unwrap();
        let component = PythonComponent::new(uv, install_dir.path().join("python"), "3.12".to_string());
        component.cancel();

        let events = component.download().await.unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].status, DownloadStatus::Cancelled);
    }

    #[tokio::test]
    async fn t32_python_verify_returns_python_version() {
        let (_temp, uv) = setup_mock_uv("#!/bin/sh\nif [ \"$1\" = \"run\" ]; then echo 'Python 3.12.7'; exit 0; fi\nexit 1\n");
        let component = PythonComponent::new(uv, PathBuf::from("/tmp/python"), "3.12".to_string());

        let version = component.verify().await.unwrap();

        assert_eq!(version, "Python 3.12.7");
    }

    #[tokio::test]
    async fn t32_python_resolve_contains_required_component_info_fields() {
        let (_temp, uv) = setup_mock_uv("#!/bin/sh\nexit 1\n");
        let component = PythonComponent::new(uv, PathBuf::from("/tmp/python"), "3.12".to_string());

        let info = component.resolve().await.unwrap();

        assert_eq!(info.id, "python");
        assert_eq!(info.name, "Python 3.12");
        assert_eq!(info.license, "PSF-2.0");
        assert_eq!(info.version, "3.12");
        assert_eq!(info.install_path, "/tmp/python");
        assert!(!info.is_installed);
    }
}
