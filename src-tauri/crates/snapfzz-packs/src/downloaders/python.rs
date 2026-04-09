use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio::sync::Mutex;

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
    cached_info: Arc<Mutex<Option<ComponentInfo>>>,
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
            cached_info: Arc::new(Mutex::new(None)),
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

    fn find_python_in_dir(dir: &Path, major_version: &str) -> Option<PathBuf> {
        if !dir.exists() {
            return None;
        }

        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.starts_with("cpython-") {
                    let preferred = entry
                        .path()
                        .join("bin")
                        .join(format!("python{}", major_version));
                    if preferred.exists() {
                        return Some(preferred);
                    }

                    let py3 = entry.path().join("bin").join("python3");
                    if py3.exists() {
                        return Some(py3);
                    }

                    let py = entry.path().join("bin").join("python");
                    if py.exists() {
                        return Some(py);
                    }
                }
            }
        }
        None
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
        let major = self.version.split('.').next().unwrap_or("3");
        Self::find_python_in_dir(&self.install_dir, major).is_some()
    }

    async fn resolve(&self) -> Result<ComponentInfo, ComponentError> {
        let is_installed = self.is_installed();

        {
            let cache = self.cached_info.lock().await;
            if let Some(ref info) = *cache {
                let mut info = info.clone();
                info.is_installed = is_installed;
                return Ok(info);
            }
        }

        let info = ComponentInfo {
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
        };

        {
            let mut cache = self.cached_info.lock().await;
            *cache = Some(info.clone());
        }

        Ok(info)
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

        let install_dir_str = self.install_dir.to_string_lossy();
        let output = self.run_uv([
            "python", "install",
            "--install-dir", install_dir_str.as_ref(),
            self.version.as_str()
        ])?;
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
        let major = self.version.split('.').next().unwrap_or("3");
        match Self::find_python_in_dir(&self.install_dir, major) {
            Some(path) => Ok(path.to_string_lossy().to_string()),
            None => Err(ComponentError::internal(format!(
                "Python {} not found in {}",
                self.version,
                self.install_dir.display()
            ))),
        }
    }

    async fn extract(&self) -> Result<(), ComponentError> {
        Ok(())
    }
}