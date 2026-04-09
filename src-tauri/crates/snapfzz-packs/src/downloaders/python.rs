use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use crate::component::{
    ComponentError, ComponentInfo, DownloadProgress, DownloadStatus, SystemComponent,
};
use crate::constants;
use crate::platform::PlatformInfo;

#[derive(Debug, Clone)]
pub struct PythonDownloader {
    uv_binary: PathBuf,
    install_dir: PathBuf,
    platform: PlatformInfo,
    version: String,
    cancelled: Arc<AtomicBool>,
}

impl PythonDownloader {
    pub fn new(
        uv_binary: PathBuf,
        install_dir: PathBuf,
        platform: PlatformInfo,
        version: String,
    ) -> Self {
        Self {
            uv_binary,
            install_dir,
            platform,
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
impl SystemComponent for PythonDownloader {
    fn id(&self) -> &str {
        "python"
    }

    fn name(&self) -> &str {
        "Python"
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
            name: format!("Python {}", constants::versions::PYTHON),
            description: "Python runtime managed by uv. Required for AgentScope and Python-based packs.".into(),
            license: "PSF-2.0".into(),
            version: self.version.clone(),
            platform: self.platform.platform.clone(),
            platform_display: self.platform.display.to_string(),
            download_url: String::new(),
            install_path: self.install_dir.to_string_lossy().into_owned(),
            size: 0,
            checksum: String::new(),
            checksum_algorithm: String::new(),
            is_installed: self.is_installed(),
            repository_url: "https://github.com/python/cpython".into(),
            website_url: "https://www.python.org/".into(),
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

        let output = self.run_uv(["python", "install", self.version.as_str()])?;
        if !output.status.success() {
            return Err(ComponentError::internal(format!(
                "uv python install failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(vec![DownloadProgress {
            component_id: self.id().into(),
            bytes_downloaded: 0,
            bytes_total: 0,
            percent: 100.0,
            status: DownloadStatus::Ready,
        }])
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    fn clear_cancel(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }

    async fn verify(&self) -> Result<String, ComponentError> {
        let output = self.run_uv(["python", "find", self.version.as_str()])?;
        if !output.status.success() {
            return Err(ComponentError::internal(format!(
                "uv python find failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    async fn extract(&self) -> Result<(), ComponentError> {
        Ok(())
    }
}