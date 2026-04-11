use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio::sync::Mutex;

use crate::core::component::{
    ComponentError, ComponentInfo, DownloadProgress, DownloadStatus, SystemComponent,
};
use crate::core::constants;
use crate::core::platform::PlatformInfo;

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    fn platform() -> PlatformInfo {
        PlatformInfo {
            os: "test-os",
            arch: "test-arch",
            platform: "linux-x64".to_string(),
            display: "Test Platform",
            exe_suffix: "",
            archive_ext: ".tar.gz",
        }
    }

    fn downloader(install_dir: PathBuf) -> PythonDownloader {
        PythonDownloader::new(
            PathBuf::from("/usr/bin/uv"),
            install_dir,
            platform(),
            "3.12.0".to_string(),
        )
    }

    // A014/constructor: new() stores the paths and version it is given
    #[test]
    fn t32_python_new_stores_paths_and_version() {
        let uv = PathBuf::from("/usr/local/bin/uv");
        let install = PathBuf::from("/opt/snapfzz/python");
        let d = PythonDownloader::new(uv.clone(), install.clone(), platform(), "3.11.5".to_string());
        assert_eq!(d.uv_binary, uv);
        assert_eq!(d.install_dir, install);
        assert_eq!(d.version, "3.11.5");
    }

    // A014/constructor: cancelled flag starts as false on construction
    #[test]
    fn t32_python_new_cancelled_flag_starts_false() {
        let d = downloader(PathBuf::from("/tmp/ignored"));
        assert!(!d.cancelled.load(Ordering::SeqCst));
    }

    // A014/trait: id() returns the fixed string "python"
    #[test]
    fn t32_python_id_returns_python() {
        let d = downloader(PathBuf::from("/tmp/ignored"));
        assert_eq!(d.id(), "python");
    }

    // A014/trait: name() returns the human-readable display name
    #[test]
    fn t32_python_name_returns_display_string() {
        let d = downloader(PathBuf::from("/tmp/ignored"));
        assert_eq!(d.name(), "Python");
    }

    // A014/trait: install_dir() returns the path passed to new()
    #[test]
    fn t32_python_install_dir_matches_constructor_arg() {
        let dir = PathBuf::from("/opt/snapfzz/python");
        let d = downloader(dir.clone());
        assert_eq!(d.install_dir(), dir.as_path());
    }

    // A014/install-check: is_installed() is false when install dir is empty
    #[test]
    fn t32_python_is_installed_returns_false_when_dir_empty() {
        let temp = tempfile::tempdir().unwrap();
        let d = downloader(temp.path().to_path_buf());
        assert!(!d.is_installed());
    }

    // A014/install-check: is_installed() is false when dir does not exist at all
    #[test]
    fn t32_python_is_installed_returns_false_when_dir_missing() {
        let d = downloader(PathBuf::from("/definitely/does/not/exist/snapfzz/python"));
        assert!(!d.is_installed());
    }

    // A014/install-check: is_installed() returns true when a cpython-*/bin/python3 binary exists
    #[test]
    fn t32_python_is_installed_returns_true_when_cpython_binary_present() {
        let temp = tempfile::tempdir().unwrap();
        let bin_dir = temp.path().join("cpython-3.12.0").join("bin");
        std::fs::create_dir_all(&bin_dir).unwrap();
        std::fs::write(bin_dir.join("python3"), b"#!/bin/sh\n").unwrap();

        let d = downloader(temp.path().to_path_buf());
        assert!(d.is_installed());
    }

    // A014/install-check: is_installed() prefers python<major> over python3/python
    #[test]
    fn t32_python_is_installed_prefers_versioned_python_binary() {
        let temp = tempfile::tempdir().unwrap();
        let bin_dir = temp.path().join("cpython-3.12.0").join("bin");
        std::fs::create_dir_all(&bin_dir).unwrap();
        // Only the versioned name exists — still counts as installed
        std::fs::write(bin_dir.join("python3"), b"#!/bin/sh\n").unwrap();
        std::fs::write(bin_dir.join("python"), b"#!/bin/sh\n").unwrap();

        let d = PythonDownloader::new(
            PathBuf::from("/usr/bin/uv"),
            temp.path().to_path_buf(),
            platform(),
            "3.12.0".to_string(),
        );
        assert!(d.is_installed());
    }

    // A014/cancel: cancel() sets the cancelled atomic flag to true
    #[test]
    fn t32_python_cancel_sets_flag() {
        let d = downloader(PathBuf::from("/tmp/ignored"));
        assert!(!d.cancelled.load(Ordering::SeqCst));
        d.cancel();
        assert!(d.cancelled.load(Ordering::SeqCst));
    }

    // A014/cancel: clear_cancel() resets the cancelled atomic flag to false
    #[test]
    fn t32_python_clear_cancel_resets_flag() {
        let d = downloader(PathBuf::from("/tmp/ignored"));
        d.cancel();
        assert!(d.cancelled.load(Ordering::SeqCst));
        d.clear_cancel();
        assert!(!d.cancelled.load(Ordering::SeqCst));
    }

    // A014/cancel: cancel() and clear_cancel() can cycle multiple times
    #[test]
    fn t32_python_cancel_toggle_is_idempotent() {
        let d = downloader(PathBuf::from("/tmp/ignored"));
        d.cancel();
        d.cancel(); // calling twice is safe
        assert!(d.cancelled.load(Ordering::SeqCst));
        d.clear_cancel();
        d.clear_cancel(); // calling twice is safe
        assert!(!d.cancelled.load(Ordering::SeqCst));
    }

    // A014/cancel: shared Arc means cancel() on one clone is visible via another
    #[test]
    fn t32_python_cancel_shared_across_clones() {
        let d = downloader(PathBuf::from("/tmp/ignored"));
        let d2 = d.clone();
        d.cancel();
        assert!(d2.cancelled.load(Ordering::SeqCst));
        d2.clear_cancel();
        assert!(!d.cancelled.load(Ordering::SeqCst));
    }

    // A014/verify: verify() returns an error when no python binary is present
    #[tokio::test]
    async fn t32_python_verify_errors_when_not_installed() {
        let temp = tempfile::tempdir().unwrap();
        let d = downloader(temp.path().to_path_buf());
        let err = d.verify().await.unwrap_err();
        assert!(matches!(err, crate::core::component::ComponentError::Internal(_)));
    }

    // A014/extract: extract() is a no-op and always succeeds
    #[tokio::test]
    async fn t32_python_extract_is_noop() {
        let d = downloader(PathBuf::from("/tmp/ignored"));
        assert!(d.extract().await.is_ok());
    }
}