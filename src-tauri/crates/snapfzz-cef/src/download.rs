use std::io::Write;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use futures::StreamExt;
use sha1::{Digest, Sha1};
use tokio::sync::Mutex;

use crate::types::{CefError, DownloadProgress, DownloadStatus};

const CEF_INDEX_URL: &str = "https://cef-builds.spotifycdn.com/index.json";
const CEF_CDN_BASE: &str = "https://cef-builds.spotifycdn.com";
const ARCHIVE_SUFFIX: &str = ".tar.bz2";
const CEF_BUILD_TYPE: &str = "minimal";

pub struct CefDownloader {
    install_dir: PathBuf,
    platform: String,
    cdn_platform: String,
    cancelled: Arc<AtomicBool>,
    cached_build: Mutex<Option<CefBuildInfo>>,
}

impl CefDownloader {
    pub fn new(install_dir: PathBuf, platform: String) -> Self {
        let cdn_platform = cef_platform_key(&platform);
        Self {
            install_dir,
            cdn_platform,
            platform,
            cancelled: Arc::new(AtomicBool::new(false)),
            cached_build: Mutex::new(None),
        }
    }

    pub fn from_current_platform(install_dir: PathBuf) -> Result<Self, CefError> {
        let platform = detect_platform()?.to_string();
        Ok(Self::new(install_dir, platform))
    }

    pub fn is_installed(&self) -> bool {
        std::fs::read_dir(&self.install_dir)
            .ok()
            .map(|entries| {
                entries.filter_map(|entry| entry.ok()).any(|entry| {
                    entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false)
                        && entry.file_name().to_string_lossy().starts_with("cef_binary")
                })
            })
            .unwrap_or(false)
    }

    pub fn cancel_download(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn clear_cancel_download(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }

    pub fn archive_path(&self) -> PathBuf {
        self.install_dir.join(format!("cef_binary{ARCHIVE_SUFFIX}"))
    }

    pub fn download_url(&self) -> String {
        format!("{CEF_CDN_BASE}/{}/{CEF_BUILD_TYPE}", self.cdn_platform)
    }

    pub fn cdn_base(&self) -> &str {
        CEF_CDN_BASE
    }

    pub fn platform(&self) -> &str {
        &self.platform
    }

    pub fn install_dir(&self) -> &std::path::Path {
        &self.install_dir
    }

    pub async fn resolve_latest_build(&self) -> Result<CefBuildInfo, CefError> {
        {
            let cache = self.cached_build.lock().await;
            if let Some(ref build) = *cache {
                return Ok(build.clone());
            }
        }

        let build = self.fetch_latest_build().await?;

        {
            let mut cache = self.cached_build.lock().await;
            *cache = Some(build.clone());
        }

        Ok(build)
    }

    async fn fetch_latest_build(&self) -> Result<CefBuildInfo, CefError> {
        let client = reqwest::Client::new();
        let index: serde_json::Value = client
            .get(CEF_INDEX_URL)
            .send()
            .await
            .map_err(|e| CefError::network(format!("Failed to fetch CEF index: {e}")))?
            .json()
            .await
            .map_err(|e| CefError::network(format!("Failed to parse CEF index: {e}")))?;

        let cdn_key = &self.cdn_platform;
        let versions = index
            .get(cdn_key)
            .and_then(|v| v.get("versions"))
            .and_then(|v| v.as_array())
            .ok_or_else(|| CefError::not_found(format!("No builds for platform: {cdn_key}")))?;

        let stable = versions
            .iter()
            .find(|v| v.get("channel").and_then(|c| c.as_str()) == Some("stable"))
            .or_else(|| versions.first())
            .ok_or_else(|| CefError::not_found(format!("No versions for platform: {cdn_key}")))?;

        let cef_version = stable
            .get("cef_version")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let chromium_version = stable
            .get("chromium_version")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let files = stable
            .get("files")
            .and_then(|f| f.as_array())
            .ok_or_else(|| CefError::not_found("No files in build".to_string()))?;

        let build_file = files
            .iter()
            .find(|f| f.get("type").and_then(|t| t.as_str()) == Some(CEF_BUILD_TYPE))
            .ok_or_else(|| {
                CefError::not_found(format!("No '{CEF_BUILD_TYPE}' build type for {cdn_key}"))
            })?;

        let filename = build_file
            .get("name")
            .and_then(|n| n.as_str())
            .ok_or_else(|| CefError::not_found("Build file has no name".to_string()))?
            .to_string();

        let size = build_file
            .get("size")
            .and_then(|s| s.as_u64())
            .unwrap_or(0);

        let sha1 = build_file
            .get("sha1")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string();

        Ok(CefBuildInfo {
            cef_version,
            chromium_version,
            filename: filename.clone(),
            download_url: format!("{CEF_CDN_BASE}/{filename}"),
            size,
            sha1,
        })
    }

    pub async fn download_cef(&self) -> Result<Vec<crate::types::DownloadProgress>, CefError> {
        std::fs::create_dir_all(&self.install_dir)?;

        if self.cancelled.load(Ordering::SeqCst) {
            return Ok(vec![DownloadProgress {
                bytes_downloaded: 0,
                bytes_total: 0,
                percent: 0.0,
                status: DownloadStatus::Cancelled,
            }]);
        }

        let build = self.resolve_latest_build().await?;
        let archive = self.install_dir.join(&build.filename);
        let bytes_total = build.size;

        let existing_bytes = std::fs::metadata(&archive).map(|m| m.len()).unwrap_or(0);

        let client = reqwest::Client::new();
        let mut request = client.get(&build.download_url);

        if existing_bytes > 0 && existing_bytes < bytes_total {
            request = request.header("Range", format!("bytes={existing_bytes}-"));
        }

        let response = request
            .send()
            .await
            .map_err(|e| CefError::network(format!("Download request failed: {e}")))?;

        if !response.status().is_success() && response.status().as_u16() != 206 {
            return Err(CefError::network(format!(
                "CEF CDN returned HTTP {}",
                response.status()
            )));
        }

        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(existing_bytes > 0 && response.status().as_u16() == 206)
            .write(true)
            .truncate(existing_bytes == 0 || response.status().as_u16() != 206)
            .open(&archive)?;

        let mut bytes_downloaded = if response.status().as_u16() == 206 {
            existing_bytes
        } else {
            0
        };

        let mut progress_events = Vec::new();
        let mut stream = response.bytes_stream();
        let mut last_reported_pct: i32 = -1;

        while let Some(chunk_result) = stream.next().await {
            if self.cancelled.load(Ordering::SeqCst) {
                progress_events.push(DownloadProgress {
                    bytes_downloaded,
                    bytes_total,
                    percent: pct(bytes_downloaded, bytes_total),
                    status: DownloadStatus::Cancelled,
                });
                return Ok(progress_events);
            }

            let chunk = chunk_result
                .map_err(|e| CefError::network(format!("Stream read error: {e}")))?;

            file.write_all(&chunk)?;
            bytes_downloaded += chunk.len() as u64;

            let current_pct = pct(bytes_downloaded, bytes_total) as i32;
            if current_pct > last_reported_pct {
                last_reported_pct = current_pct;
                progress_events.push(DownloadProgress {
                    bytes_downloaded,
                    bytes_total,
                    percent: pct(bytes_downloaded, bytes_total),
                    status: DownloadStatus::Downloading,
                });
            }
        }

        drop(file);

        progress_events.push(DownloadProgress {
            bytes_downloaded,
            bytes_total,
            percent: 100.0,
            status: DownloadStatus::Verifying,
        });

        let actual_sha1 = sha1_hex(&std::fs::read(&archive)?);
        if !build.sha1.is_empty() && actual_sha1 != build.sha1 {
            let _ = std::fs::remove_file(&archive);
            return Err(CefError::ChecksumMismatch {
                expected: build.sha1,
                actual: actual_sha1,
            });
        }

        progress_events.push(DownloadProgress {
            bytes_downloaded,
            bytes_total,
            percent: 100.0,
            status: DownloadStatus::Extracting,
        });

        snapfzz_packs::extract_tar_bz2(
            &self.install_dir.join(&build.filename),
            &self.install_dir,
        )
        .map_err(|e| CefError::Io(e.to_string()))?;

        progress_events.push(DownloadProgress {
            bytes_downloaded,
            bytes_total,
            percent: 100.0,
            status: DownloadStatus::Ready,
        });

        Ok(progress_events)
    }

    pub async fn download_events(&self) -> Result<Vec<DownloadProgress>, CefError> {
        self.download_cef().await
    }

    pub async fn verify_checksum_cef(&self) -> Result<String, CefError> {
        let archive = self.find_archive()?;
        let bytes = std::fs::read(&archive)?;
        let digest = sha1_hex(&bytes);
        if digest.is_empty() {
            return Err(CefError::invalid_state("empty checksum result"));
        }
        Ok(digest)
    }

    pub async fn verify_checksum_against(&self, expected: &str) -> Result<(), CefError> {
        let archive = self.find_archive()?;
        let bytes = std::fs::read(&archive)?;
        let actual = sha1_hex(&bytes);
        if actual != expected {
            let _ = std::fs::remove_file(&archive);
            return Err(CefError::ChecksumMismatch {
                expected: expected.to_string(),
                actual,
            });
        }
        Ok(())
    }

    pub async fn extract_cef(&self) -> Result<(), CefError> {
        let archive = self.find_archive()?;
        snapfzz_packs::extract_tar_bz2(&archive, &self.install_dir)
            .map_err(|e| CefError::Io(e.to_string()))?;
        Ok(())
    }

    fn find_archive(&self) -> Result<PathBuf, CefError> {
        for entry in std::fs::read_dir(&self.install_dir).map_err(|e| {
            CefError::not_found(format!("Cannot read install dir: {e}"))
        })? {
            let entry = entry.map_err(|e| CefError::not_found(e.to_string()))?;
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.ends_with(ARCHIVE_SUFFIX) {
                return Ok(entry.path());
            }
        }
        Err(CefError::not_found("CEF archive not found in install directory".to_string()))
    }
}

fn platform_display_name(platform: &str) -> &'static str {
    match platform {
        "macos-arm64" => "macOS (Apple Silicon)",
        "macos-x64" => "macOS (Intel)",
        "linux-x64" => "Linux (x86_64)",
        "linux-arm64" => "Linux (ARM64)",
        "windows-x64" => "Windows (x64)",
        "windows-arm64" => "Windows (ARM64)",
        _ => "Unknown platform",
    }
}

use snapfzz_packs::{
    ComponentError, ComponentInfo, DownloadProgress as KernelProgress, DownloadStatus as KernelStatus,
    SystemComponent,
};

#[async_trait::async_trait]
impl SystemComponent for CefDownloader {
    fn id(&self) -> &str {
        "cef"
    }

    fn name(&self) -> &str {
        "Chromium Embedded Framework"
    }

    fn install_dir(&self) -> &std::path::Path {
        &self.install_dir
    }

    fn is_installed(&self) -> bool {
        std::fs::read_dir(&self.install_dir)
            .ok()
            .map(|entries| {
                entries.filter_map(|entry| entry.ok()).any(|entry| {
                    entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false)
                        && entry.file_name().to_string_lossy().starts_with("cef_binary")
                })
            })
            .unwrap_or(false)
    }

    async fn resolve(&self) -> Result<ComponentInfo, ComponentError> {
        let build = self
            .resolve_latest_build()
            .await
            .map_err(|e| ComponentError::network(e.to_string()))?;

        Ok(ComponentInfo {
            id: "cef".into(),
            name: "Chromium Embedded Framework".into(),
            description: "Full Chromium browser engine for running mini apps with WebRTC, WebGL, service workers, and DevTools support.".into(),
            license: "BSD-3-Clause".into(),
            version: build.cef_version,
            platform: self.platform.clone(),
            platform_display: platform_display_name(&self.platform).to_string(),
            download_url: build.download_url,
            install_path: self.install_dir.to_string_lossy().into(),
            size: build.size,
            checksum: build.sha1,
            checksum_algorithm: "sha1".into(),
            is_installed: self.is_installed(),
            repository_url: "https://github.com/chromiumembedded/cef".into(),
            website_url: "https://chromiumembedded.github.io/cef/".into(),
        })
    }

    async fn download(&self) -> Result<Vec<KernelProgress>, ComponentError> {
        let cef_events = self
            .download_cef()
            .await
            .map_err(|e| ComponentError::internal(e.to_string()))?;

        Ok(cef_events
            .into_iter()
            .map(|e| KernelProgress {
                component_id: "cef".into(),
                bytes_downloaded: e.bytes_downloaded,
                bytes_total: e.bytes_total,
                percent: e.percent,
                status: match e.status {
                    DownloadStatus::Downloading => KernelStatus::Downloading,
                    DownloadStatus::Verifying => KernelStatus::Verifying,
                    DownloadStatus::Extracting => KernelStatus::Extracting,
                    DownloadStatus::Ready => KernelStatus::Ready,
                    DownloadStatus::Cancelled => KernelStatus::Cancelled,
                    DownloadStatus::Failed(msg) => KernelStatus::Failed(msg),
                    _ => KernelStatus::Pending,
                },
            })
            .collect())
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    fn clear_cancel(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }

    async fn verify(&self) -> Result<String, ComponentError> {
        self.verify_checksum_cef()
            .await
            .map_err(|e| ComponentError::internal(e.to_string()))
    }

    async fn extract(&self) -> Result<(), ComponentError> {
        self.extract_cef()
            .await
            .map_err(|e| ComponentError::internal(e.to_string()))
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CefBuildInfo {
    pub cef_version: String,
    pub chromium_version: String,
    pub filename: String,
    pub download_url: String,
    pub size: u64,
    pub sha1: String,
}

fn cef_platform_key(platform: &str) -> String {
    match platform {
        "macos-arm64" => "macosarm64",
        "macos-x64" => "macosx64",
        "linux-x64" => "linux64",
        "linux-arm64" => "linuxarm64",
        "windows-x64" => "windows64",
        "windows-arm64" => "windowsarm64",
        other => other,
    }
    .to_string()
}

pub fn detect_platform() -> Result<&'static str, CefError> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Ok("macos-arm64"),
        ("macos", "x86_64") => Ok("macos-x64"),
        ("linux", "x86_64") => Ok("linux-x64"),
        ("linux", "aarch64") => Ok("linux-arm64"),
        ("windows", "x86_64") => Ok("windows-x64"),
        ("windows", "aarch64") => Ok("windows-arm64"),
        (os, arch) => Err(CefError::UnsupportedPlatform(format!("{os}-{arch}"))),
    }
}

fn pct(downloaded: u64, total: u64) -> f32 {
    if total == 0 {
        0.0
    } else {
        ((downloaded as f32 / total as f32) * 100.0).min(100.0)
    }
}

fn sha1_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn a015_downloader_detect_platform_matches_known_targets() {
        let result = detect_platform();
        match (std::env::consts::OS, std::env::consts::ARCH) {
            ("macos", "aarch64") | ("macos", "x86_64") | ("linux", "x86_64")
            | ("linux", "aarch64") | ("windows", "x86_64") | ("windows", "aarch64") => {
                assert!(result.is_ok());
            }
            _ => {
                assert!(result.is_err());
            }
        }
    }

    #[test]
    fn a015_downloader_cef_platform_key_maps_correctly() {
        assert_eq!(cef_platform_key("macos-arm64"), "macosarm64");
        assert_eq!(cef_platform_key("macos-x64"), "macosx64");
        assert_eq!(cef_platform_key("linux-x64"), "linux64");
        assert_eq!(cef_platform_key("linux-arm64"), "linuxarm64");
        assert_eq!(cef_platform_key("windows-x64"), "windows64");
        assert_eq!(cef_platform_key("windows-arm64"), "windowsarm64");
        assert_eq!(cef_platform_key("unknown"), "unknown");
    }

    #[test]
    fn a015_downloader_new_sets_cdn_base() {
        let temp = tempfile::tempdir().expect("tempdir");
        let downloader = CefDownloader::new(temp.path().join("cef"), "macos-arm64".to_string());
        assert_eq!(downloader.cdn_base(), CEF_CDN_BASE);
        assert_eq!(downloader.platform(), "macos-arm64");
    }

    #[test]
    fn a015_downloader_is_installed_returns_false_when_no_extracted_cef_directory_exists() {
        let temp = tempfile::tempdir().expect("tempdir");
        let downloader = CefDownloader::new(temp.path().join("cef"), "macos-arm64".to_string());
        assert!(!downloader.is_installed());
    }

    #[test]
    fn a015_downloader_is_installed_returns_true_when_versioned_cef_directory_exists() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(install_dir.join("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64"))
            .expect("create extracted dir");
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        assert!(downloader.is_installed());
    }

    #[test]
    fn a015_downloader_cancel_and_clear() {
        let temp = tempfile::tempdir().expect("tempdir");
        let downloader = CefDownloader::new(temp.path().join("cef"), "macos-arm64".to_string());
        assert!(!downloader.cancelled.load(Ordering::SeqCst));
        downloader.cancel_download();
        assert!(downloader.cancelled.load(Ordering::SeqCst));
        downloader.clear_cancel_download();
        assert!(!downloader.cancelled.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn a015_downloader_verify_checksum_requires_archive() {
        let temp = tempfile::tempdir().expect("tempdir");
        let downloader = CefDownloader::new(temp.path().join("cef"), "linux-x64".to_string());
        let error = downloader.verify_checksum_cef().await.expect_err("should fail");
        assert!(matches!(error, CefError::NotFound(_)));
    }

    #[tokio::test]
    async fn a015_downloader_verify_checksum_returns_sha1_hex() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create dir");
        std::fs::write(install_dir.join("cef_binary_test_macosarm64_minimal.tar.bz2"), b"test-archive").expect("write");
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        let hash = downloader.verify_checksum_cef().await.expect("checksum");
        assert!(!hash.is_empty());
        assert_eq!(hash.len(), 40);
    }

    #[tokio::test]
    async fn a015_downloader_verify_checksum_against_mismatch_deletes_file() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create dir");
        let archive = install_dir.join("cef_binary_test.tar.bz2");
        std::fs::write(&archive, b"unexpected").expect("write");
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        let err = downloader.verify_checksum_against("deadbeef").await.expect_err("should fail");
        assert!(matches!(err, CefError::ChecksumMismatch { .. }));
        assert!(!archive.exists());
    }

    #[tokio::test]
    async fn a015_downloader_verify_checksum_against_matching_digest() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create dir");
        let bytes = b"expected-bytes";
        std::fs::write(install_dir.join("cef_binary_test.tar.bz2"), bytes).expect("write");
        let expected = sha1_hex(bytes);
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        downloader.verify_checksum_against(&expected).await.expect("should match");
    }

    #[tokio::test]
    async fn a015_downloader_extract_cef_decompresses_tar_bz2_archive() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create dir");
        let archive_path = install_dir.join("cef_binary_test.tar.bz2");
        create_test_tar_bz2(
            &archive_path,
            &[
                ("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64/test.txt", b"hello world"),
                ("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64/resources/app.json", br#"{"ready":true}"#),
            ],
        );
        let downloader = CefDownloader::new(install_dir.clone(), "linux-x64".to_string());

        downloader.extract_cef().await.expect("extract");

        assert!(install_dir
            .join("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64/test.txt")
            .exists());
        assert_eq!(
            std::fs::read_to_string(
                install_dir.join(
                    "cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64/resources/app.json",
                ),
            )
            .unwrap(),
            "{\"ready\":true}"
        );
        assert!(downloader.is_installed());
    }

    #[tokio::test]
    async fn a015_downloader_extract_requires_archive() {
        let temp = tempfile::tempdir().expect("tempdir");
        let downloader = CefDownloader::new(temp.path().join("cef"), "linux-x64".to_string());
        let err = downloader.extract_cef().await.expect_err("should fail");
        assert!(matches!(err, CefError::NotFound(_)));
    }

    #[test]
    fn a015_downloader_from_current_platform_uses_detected_platform() {
        let temp = tempfile::tempdir().expect("tempdir");
        let downloader = CefDownloader::from_current_platform(temp.path().join("cef"))
            .expect("current platform should be supported in CI");
        assert_eq!(downloader.platform(), detect_platform().expect("platform"));
    }

    #[test]
    fn a015_downloader_pct_edge_cases() {
        assert_eq!(pct(0, 0), 0.0);
        assert_eq!(pct(50, 100), 50.0);
        assert_eq!(pct(100, 100), 100.0);
        assert_eq!(pct(200, 100), 100.0);
    }

    #[test]
    fn a015_downloader_sha1_hex_produces_40_char_hash() {
        let hash = sha1_hex(b"hello world");
        assert_eq!(hash.len(), 40);
        assert_eq!(hash, "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed");
    }

    fn create_test_tar_bz2(path: &Path, files: &[(&str, &[u8])]) {
        let file = std::fs::File::create(path).expect("create archive");
        let compressor = bzip2::write::BzEncoder::new(file, bzip2::Compression::fast());
        let mut archive = tar::Builder::new(compressor);
        for (name, data) in files {
            let mut header = tar::Header::new_gnu();
            header.set_size(data.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            archive
                .append_data(&mut header, name, &data[..])
                .expect("append file");
        }
        archive.finish().expect("finish archive");
    }
}
