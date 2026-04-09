use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use serde::Deserialize;
use crate::component::{
    ComponentError, ComponentInfo, DownloadProgress, DownloadStatus, SystemComponent,
};
use crate::download::{download_file, extract_tar_gz};
use crate::constants;
use crate::platform::PlatformInfo;

const USER_AGENT: &str = "snapfzz-packs/0.1.0";

#[derive(Debug, Clone)]
pub struct UvDownloader {
    install_dir: PathBuf,
    platform: PlatformInfo,
    release_api_url: String,
    cancelled: Arc<AtomicBool>,
}

impl UvDownloader {
    pub fn new(install_dir: PathBuf, platform: PlatformInfo) -> Self {
        Self {
            install_dir,
            platform,
            release_api_url: constants::urls::UV_RELEASES_URL.to_string(),
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    fn archive_path(&self) -> PathBuf {
        self.install_dir
            .join(format!("uv-archive{}", self.platform.archive_ext))
    }

    #[cfg(test)]
    fn with_release_url(install_dir: PathBuf, platform: PlatformInfo, release_api_url: String) -> Self {
        Self {
            install_dir,
            platform,
            release_api_url,
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn binary_path(&self) -> PathBuf {
        self.install_dir.join(format!("uv{}", self.platform.exe_suffix))
    }

    fn cleanup_extracted_artifacts(&self, extracted: &Path) -> Result<(), ComponentError> {
        if extracted == self.binary_path() {
            return Ok(());
        }

        if extracted.exists() {
            std::fs::remove_file(extracted)?;
        }

        let mut current = extracted.parent();
        while let Some(dir) = current {
            if dir == self.install_dir {
                break;
            }

            match std::fs::remove_dir(dir) {
                Ok(()) => current = dir.parent(),
                Err(error) if error.kind() == std::io::ErrorKind::DirectoryNotEmpty => break,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
                Err(error) => return Err(ComponentError::from(error)),
            }
        }

        Ok(())
    }

    fn asset_name(&self) -> &'static str {
        match self.platform.platform.as_str() {
            "macos-arm64" => "uv-aarch64-apple-darwin.tar.gz",
            "macos-x64" => "uv-x86_64-apple-darwin.tar.gz",
            "linux-x64" => "uv-x86_64-unknown-linux-gnu.tar.gz",
            "linux-arm64" => "uv-aarch64-unknown-linux-gnu.tar.gz",
            "windows-x64" => "uv-x86_64-pc-windows-msvc.zip",
            "windows-arm64" => "uv-aarch64-pc-windows-msvc.zip",
            _ => "",
        }
    }

    fn extract_archive(&self, archive_path: &Path) -> Result<(), ComponentError> {
        if self.platform.archive_ext == ".tar.gz" {
            extract_tar_gz(archive_path, &self.install_dir)?;
        } else {
            extract_zip_archive(archive_path, &self.install_dir)?;
        }

        let filename = format!("uv{}", self.platform.exe_suffix);
        let extracted = find_file_recursive(&self.install_dir, &filename)
            .ok_or_else(|| ComponentError::not_found("uv binary missing after extraction"))?;
        let target = self.binary_path();
        if extracted != target {
            if let Some(parent) = target.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let rename_result: Result<(), std::io::Error> = std::fs::rename(&extracted, &target);
            if rename_result.is_err() {
                let _ = std::fs::copy(&extracted, &target);
                let _ = self.cleanup_extracted_artifacts(&extracted);
            }
        }
        let _ = ensure_executable(&target);
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[async_trait::async_trait]
impl SystemComponent for UvDownloader {
    fn id(&self) -> &str {
        "uv"
    }

    fn name(&self) -> &str {
        "uv (Python Package Manager)"
    }

    fn install_dir(&self) -> &Path {
        &self.install_dir
    }

    fn is_installed(&self) -> bool {
        self.binary_path().exists()
    }

    async fn resolve(&self) -> Result<ComponentInfo, ComponentError> {
        // First try to fetch from GitHub API (with fallback to hardcoded version on rate limit)
        let client = reqwest::Client::new();
        let release_result = client
            .get(&self.release_api_url)
            .header(reqwest::header::USER_AGENT, USER_AGENT)
            .send()
            .await;

        let (version, download_url, size) = match release_result {
            Ok(resp) if resp.status().is_success() => {
                let release: GithubRelease = resp.json().await
                    .map_err(|error| ComponentError::network(format!("failed to parse uv release: {error}")))?;
                
                let asset_name = self.asset_name();
                let asset = release
                    .assets
                    .into_iter()
                    .find(|asset| asset.name == asset_name)
                    .ok_or_else(|| ComponentError::not_found(format!("uv asset not found: {asset_name}")))?;

                (release.tag_name, asset.browser_download_url, asset.size)
            }
            _ => {
                // Fallback to hardcoded version on rate limit or network error
                let base_url = format!("{}/{}", constants::urls::UV_DOWNLOAD_BASE, constants::versions::UV);
                let download_url = format!("{}/{}", base_url, self.asset_name());
                
                // Approximate sizes from GitHub release page
                let size = match self.platform.platform.as_str() {
                    "macos-arm64" => 11_000_000,
                    "macos-x64" => 11_500_000,
                    "linux-x64" => 12_000_000,
                    "linux-arm64" => 11_000_000,
                    "windows-x64" => 13_000_000,
                    "windows-arm64" => 12_500_000,
                    _ => 11_000_000,
                };

                (constants::versions::UV.to_string(), download_url, size)
            }
        };

        Ok(ComponentInfo {
            id: "uv".into(),
            name: "uv (Python Package Manager)".into(),
            description: "Fast Python package manager. Required for all Python runtimes.".into(),
            license: "Apache-2.0 / MIT".into(),
            version,
            platform: self.platform.platform.clone(),
            platform_display: self.platform.display.to_string(),
            download_url,
            install_path: self.binary_path().to_string_lossy().into_owned(),
            size,
            checksum: String::new(),
            checksum_algorithm: String::new(),
            is_installed: self.is_installed(),
            repository_url: "https://github.com/astral-sh/uv".into(),
            website_url: "https://docs.astral.sh/uv".into(),
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

        let info = self.resolve().await?;
        let archive_path = self.archive_path();

        let mut progress = download_file(
            &info.download_url,
            &archive_path,
            info.size,
            &self.cancelled,
            self.id(),
        )
        .await?;

        if matches!(
            progress.last().map(|event| &event.status),
            Some(DownloadStatus::Cancelled)
        ) {
            return Ok(progress);
        }

        progress.push(DownloadProgress {
            component_id: self.id().into(),
            bytes_downloaded: info.size,
            bytes_total: info.size.max(1),
            percent: 100.0,
            status: DownloadStatus::Extracting,
        });

        self.extract_archive(&archive_path)?;

        progress.push(DownloadProgress {
            component_id: self.id().into(),
            bytes_downloaded: info.size,
            bytes_total: info.size.max(1),
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
        let output = Command::new(self.binary_path())
            .arg("--version")
            .output()
            .map_err(ComponentError::from)?;
        if !output.status.success() {
            return Err(ComponentError::internal(format!(
                "uv --version failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    async fn extract(&self) -> Result<(), ComponentError> {
        let archive_path = self.archive_path();
        self.extract_archive(&archive_path)
    }

    fn status_path(&self) -> PathBuf {
        self.binary_path()
    }
}

fn extract_zip_archive(archive_path: &Path, dest_dir: &Path) -> Result<(), ComponentError> {
    let file = std::fs::File::open(archive_path)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| ComponentError::internal(format!("zip open failed: {error}")))?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| ComponentError::internal(format!("zip entry failed: {error}")))?;
        let outpath = dest_dir.join(entry.name());

        if entry.name().ends_with('/') {
            std::fs::create_dir_all(&outpath)?;
            continue;
        }

        if let Some(parent) = outpath.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut outfile = std::fs::File::create(&outpath)?;
        std::io::copy(&mut entry, &mut outfile)?;
    }

    Ok(())
}

fn find_file_recursive(root: &Path, filename: &str) -> Option<PathBuf> {
    if !root.exists() {
        return None;
    }

    let mut stack = vec![root.to_path_buf()];
    while let Some(current) = stack.pop() {
        let entries = std::fs::read_dir(&current).ok()?;
        for entry in entries {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.file_name().and_then(|name| name.to_str()) == Some(filename) {
                return Some(path);
            }
        }
    }

    None
}

fn ensure_executable(path: &Path) -> Result<(), ComponentError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(path)?.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn platform(platform: &str, archive_ext: &'static str, exe_suffix: &'static str) -> PlatformInfo {
        PlatformInfo {
            os: "test-os",
            arch: "test-arch",
            platform: platform.to_string(),
            display: "Test Platform",
            exe_suffix,
            archive_ext,
        }
    }

    #[test]
    fn t32_uv_asset_mapping_matches_expected_release_assets() {
        let cases = [
            ("macos-arm64", ".tar.gz", "", "uv-aarch64-apple-darwin.tar.gz"),
            ("macos-x64", ".tar.gz", "", "uv-x86_64-apple-darwin.tar.gz"),
            ("linux-x64", ".tar.gz", "", "uv-x86_64-unknown-linux-gnu.tar.gz"),
            ("linux-arm64", ".tar.gz", "", "uv-aarch64-unknown-linux-gnu.tar.gz"),
            ("windows-x64", ".zip", ".exe", "uv-x86_64-pc-windows-msvc.zip"),
            ("windows-arm64", ".zip", ".exe", "uv-aarch64-pc-windows-msvc.zip"),
        ];

        for (platform_key, archive_ext, exe_suffix, expected) in cases {
            let component = UvDownloader::new(
                PathBuf::from("/tmp/snapfzz/runtime/bin"),
                platform(platform_key, archive_ext, exe_suffix),
            );
            assert_eq!(component.asset_name(), expected);
        }
    }

    #[test]
    fn t32_uv_is_installed_detects_binary_presence() {
        let temp = tempfile::tempdir().unwrap();
        let component = UvDownloader::new(temp.path().to_path_buf(), platform("linux-x64", ".tar.gz", ""));
        assert!(!component.is_installed());

        std::fs::write(component.binary_path(), b"#!/bin/sh\necho uv\n").unwrap();
        assert!(component.is_installed());
    }

    #[test]
    fn t32_uv_cancel_and_clear_cancel_toggle_internal_flag() {
        let temp = tempfile::tempdir().unwrap();
        let component = UvDownloader::new(temp.path().to_path_buf(), platform("linux-x64", ".tar.gz", ""));
        assert!(!component.cancelled.load(Ordering::SeqCst));
        component.cancel();
        assert!(component.cancelled.load(Ordering::SeqCst));
        component.clear_cancel();
        assert!(!component.cancelled.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn t32_uv_download_returns_cancelled_when_pre_cancelled() {
        let temp = tempfile::tempdir().unwrap();
        let component = UvDownloader::new(temp.path().to_path_buf(), platform("linux-x64", ".tar.gz", ""));
        component.cancel();

        let events = component.download().await.unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].status, DownloadStatus::Cancelled);
    }

    #[tokio::test]
    async fn t32_uv_verify_executes_binary_and_returns_version() {
        let temp = tempfile::tempdir().unwrap();
        let component = UvDownloader::new(temp.path().to_path_buf(), platform("linux-x64", ".tar.gz", ""));
        let binary = component.binary_path();
        std::fs::write(&binary, b"#!/bin/sh\nprintf 'uv 0.5.0\\n'\n").unwrap();
        ensure_executable(&binary).unwrap();

        let version = component.verify().await.unwrap();

        assert_eq!(version, "uv 0.5.0");
    }

    #[tokio::test]
    async fn t32_uv_resolve_returns_component_info_from_latest_release() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buffer = [0_u8; 2048];
                let _ = socket.read(&mut buffer).await;
                let body = format!(
                    "{{\"tag_name\":\"v0.5.0\",\"assets\":[{{\"name\":\"uv-x86_64-unknown-linux-gnu.tar.gz\",\"browser_download_url\":\"http://{addr}/uv.tar.gz\",\"size\":4096}}]}}"
                );
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = socket.write_all(response.as_bytes()).await;
            }
        });

        let temp = tempfile::tempdir().unwrap();
        let component = UvDownloader::with_release_url(
            temp.path().to_path_buf(),
            platform("linux-x64", ".tar.gz", ""),
            format!("http://{addr}/latest"),
        );

        let info = component.resolve().await.unwrap();
        server.await.unwrap();

        assert_eq!(info.id, "uv");
        assert_eq!(info.name, "uv (Python Package Manager)");
        assert_eq!(info.license, "Apache-2.0 / MIT");
        assert_eq!(
            info.description,
            "Fast Python package manager. Required for all Python runtimes."
        );
        assert_eq!(info.version, "v0.5.0");
        assert_eq!(info.platform, "linux-x64");
        assert_eq!(info.platform_display, "Test Platform");
        assert_eq!(info.download_url, format!("http://{addr}/uv.tar.gz"));
        assert_eq!(info.size, 4096);
    }

    #[tokio::test]
    async fn t32_uv_resolve_errors_when_asset_missing_for_platform() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buffer = [0_u8; 2048];
                let _ = socket.read(&mut buffer).await;
                let body = "{\"tag_name\":\"v0.5.0\",\"assets\":[{\"name\":\"other.tar.gz\",\"browser_download_url\":\"http://example/other\",\"size\":1}]}";
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = socket.write_all(response.as_bytes()).await;
            }
        });

        let temp = tempfile::tempdir().unwrap();
        let component = UvDownloader::with_release_url(
            temp.path().to_path_buf(),
            platform("linux-x64", ".tar.gz", ""),
            format!("http://{addr}/latest"),
        );

        let err = component.resolve().await.unwrap_err();
        server.await.unwrap();
        assert!(matches!(err, ComponentError::NotFound(_)));
    }

    #[test]
    fn t32_uv_extract_archive_tar_gz_places_binary_in_target_path() {
        let temp = tempfile::tempdir().unwrap();
        let component = UvDownloader::new(temp.path().to_path_buf(), platform("linux-x64", ".tar.gz", ""));
        let archive_path = temp.path().join("uv.tar.gz");

        let file = std::fs::File::create(&archive_path).unwrap();
        let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::default());
        let mut archive = tar::Builder::new(encoder);
        let bytes = b"#!/bin/sh\nprintf 'uv 9.9.9\\n'\n";
        let mut header = tar::Header::new_gnu();
        header.set_size(bytes.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        archive
            .append_data(&mut header, "uv-x86_64-unknown-linux-gnu/uv", &bytes[..])
            .unwrap();
        archive.into_inner().unwrap().finish().unwrap();

        component.extract_archive(&archive_path).unwrap();

        let binary = component.binary_path();
        assert!(binary.exists());
        assert!(std::fs::metadata(binary).unwrap().len() > 0);
    }

    #[test]
    fn t32_uv_extract_archive_returns_not_found_when_binary_missing() {
        let temp = tempfile::tempdir().unwrap();
        let component = UvDownloader::new(temp.path().to_path_buf(), platform("linux-x64", ".tar.gz", ""));
        let archive_path = temp.path().join("empty.tar.gz");

        let file = std::fs::File::create(&archive_path).unwrap();
        let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::default());
        let mut archive = tar::Builder::new(encoder);
        let bytes = b"readme";
        let mut header = tar::Header::new_gnu();
        header.set_size(bytes.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        archive
            .append_data(&mut header, "uv-x86_64-unknown-linux-gnu/README.txt", &bytes[..])
            .unwrap();
        archive.into_inner().unwrap().finish().unwrap();

        let err = component.extract_archive(&archive_path).unwrap_err();
        assert!(matches!(err, ComponentError::NotFound(_)));
    }

    #[test]
    fn t32_uv_extract_archive_zip_branch_extracts_exe() {
        let temp = tempfile::tempdir().unwrap();
        let component = UvDownloader::new(temp.path().to_path_buf(), platform("windows-x64", ".zip", ".exe"));
        let archive_path = temp.path().join("uv.zip");

        let file = std::fs::File::create(&archive_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        zip.add_directory("uv-x86_64-pc-windows-msvc/", options).unwrap();
        zip.start_file("uv-x86_64-pc-windows-msvc/uv.exe", options).unwrap();
        use std::io::Write;
        zip.write_all(b"binary").unwrap();
        zip.finish().unwrap();

        component.extract_archive(&archive_path).unwrap();
        assert!(component.binary_path().exists());
    }

    #[tokio::test]
    async fn t32_uv_verify_returns_error_when_binary_exits_nonzero() {
        let temp = tempfile::tempdir().unwrap();
        let component = UvDownloader::new(temp.path().to_path_buf(), platform("linux-x64", ".tar.gz", ""));
        let binary = component.binary_path();
        std::fs::write(&binary, b"#!/bin/sh\nexit 9\n").unwrap();
        ensure_executable(&binary).unwrap();

        let err = component.verify().await.unwrap_err();

        assert!(matches!(err, ComponentError::Internal(_)));
    }

    #[test]
    fn t32_uv_find_file_recursive_returns_none_for_missing_root() {
        let missing = PathBuf::from("/definitely/does/not/exist/snapfzz");
        assert!(find_file_recursive(&missing, "uv").is_none());
    }
}
