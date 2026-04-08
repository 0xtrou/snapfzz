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
pub struct LiteLLMComponent {
    uv_binary: PathBuf,
    install_dir: PathBuf,
    cancelled: Arc<AtomicBool>,
}

impl LiteLLMComponent {
    pub fn new(uv_binary: PathBuf, install_dir: PathBuf) -> Self {
        Self {
            uv_binary,
            install_dir,
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
impl SystemComponent for LiteLLMComponent {
    fn id(&self) -> &str {
        "litellm"
    }

    fn name(&self) -> &str {
        "LiteLLM Gateway"
    }

    fn install_dir(&self) -> &Path {
        &self.install_dir
    }

    fn is_installed(&self) -> bool {
        match self.run_uv(["run", "python", "-c", "import litellm"]) {
            Ok(output) => output.status.success(),
            Err(_) => false,
        }
    }

    async fn resolve(&self) -> Result<ComponentInfo, ComponentError> {
        Ok(ComponentInfo {
            id: "litellm".into(),
            name: "LiteLLM Gateway".into(),
            description: "LiteLLM proxy runtime package for unified model gateway and provider routing.".into(),
            license: "MIT".into(),
            version: "latest".into(),
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
            "pip",
            "install",
            "litellm[proxy]",
            "--target",
            self.install_dir.to_string_lossy().as_ref(),
        ])?;

        if !output.status.success() {
            return Err(ComponentError::internal(format!(
                "litellm install failed: {}",
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
        let output = self.run_uv(["run", "python", "-c", "import litellm; print(litellm.version)"])?;
        if !output.status.success() {
            return Err(ComponentError::internal(format!(
                "litellm verify failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
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
    fn t32_litellm_is_installed_true_when_import_succeeds() {
        let (_temp, uv) = setup_mock_uv("#!/bin/sh\nif [ \"$1\" = \"run\" ]; then exit 0; fi\nexit 1\n");
        let component = LiteLLMComponent::new(uv, PathBuf::from("/tmp/runtime/packages/litellm"));
        assert!(component.is_installed());
    }

    #[test]
    fn t32_litellm_is_installed_false_when_import_fails() {
        let (_temp, uv) = setup_mock_uv("#!/bin/sh\nexit 1\n");
        let component = LiteLLMComponent::new(uv, PathBuf::from("/tmp/runtime/packages/litellm"));
        assert!(!component.is_installed());
    }

    #[test]
    fn t32_litellm_cancel_and_clear_toggle_flag() {
        let (_temp, uv) = setup_mock_uv("#!/bin/sh\nexit 0\n");
        let component = LiteLLMComponent::new(uv, PathBuf::from("/tmp/runtime/packages/litellm"));
        assert!(!component.cancelled.load(Ordering::SeqCst));
        component.cancel();
        assert!(component.cancelled.load(Ordering::SeqCst));
        component.clear_cancel();
        assert!(!component.cancelled.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn t32_litellm_verify_returns_installed_version() {
        let (_temp, uv) = setup_mock_uv("#!/bin/sh\nif [ \"$1\" = \"run\" ]; then echo '2.0.1'; exit 0; fi\nexit 1\n");
        let component = LiteLLMComponent::new(uv, PathBuf::from("/tmp/runtime/packages/litellm"));

        let version = component.verify().await.unwrap();

        assert_eq!(version, "2.0.1");
    }

    #[tokio::test]
    async fn t32_litellm_resolve_has_expected_component_info() {
        let (_temp, uv) = setup_mock_uv("#!/bin/sh\nexit 1\n");
        let component = LiteLLMComponent::new(uv, PathBuf::from("/tmp/runtime/packages/litellm"));

        let info = component.resolve().await.unwrap();

        assert_eq!(info.id, "litellm");
        assert_eq!(info.name, "LiteLLM Gateway");
        assert_eq!(info.license, "MIT");
        assert_eq!(info.install_path, "/tmp/runtime/packages/litellm");
        assert!(!info.is_installed);
    }
}
