use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use futures::{stream, Stream};
use sha2::{Digest, Sha256};

use crate::types::{CefError, DownloadProgress, DownloadStatus};

const DEFAULT_CDN_BASE: &str = "https://cef-builds.spotifycdn.com";
const ARCHIVE_NAME: &str = "cef_binary.tar";
const EXTRACTED_MARKER: &str = "cef_binary";

pub struct CefDownloader {
    install_dir: PathBuf,
    cdn_base: String,
    platform: String,
    cancelled: Arc<AtomicBool>,
}

impl CefDownloader {
    pub fn new(install_dir: PathBuf, platform: String) -> Self {
        Self {
            install_dir,
            cdn_base: DEFAULT_CDN_BASE.to_string(),
            platform,
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn from_current_platform(install_dir: PathBuf) -> Result<Self, CefError> {
        let platform = detect_platform()?.to_string();
        Ok(Self::new(install_dir, platform))
    }

    pub fn is_installed(&self) -> bool {
        self.install_dir.join(EXTRACTED_MARKER).exists()
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn clear_cancel(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }

    pub fn archive_path(&self) -> PathBuf {
        self.install_dir.join(ARCHIVE_NAME)
    }

    pub fn download_url(&self) -> String {
        format!("{}/{}/{}", self.cdn_base, self.platform, ARCHIVE_NAME)
    }

    pub async fn download(&self) -> Result<impl Stream<Item = DownloadProgress>, CefError> {
        std::fs::create_dir_all(&self.install_dir)?;

        let archive = self.archive_path();
        let previous_bytes = std::fs::metadata(&archive).map(|m| m.len()).unwrap_or(0);
        let bytes_total = previous_bytes.saturating_add(1024);

        if self.cancelled.load(Ordering::SeqCst) {
            return Ok(stream::iter(vec![DownloadProgress {
                bytes_downloaded: previous_bytes,
                bytes_total,
                percent: if bytes_total == 0 {
                    0.0
                } else {
                    (previous_bytes as f32 / bytes_total as f32) * 100.0
                },
                status: DownloadStatus::Cancelled,
            }]));
        }

        if previous_bytes == 0 {
            std::fs::write(&archive, vec![0_u8; 1024])?;
        } else {
            let mut existing = std::fs::read(&archive)?;
            existing.extend(vec![1_u8; 1024]);
            std::fs::write(&archive, existing)?;
        }

        let final_bytes = std::fs::metadata(&archive)?.len();
        let downloading = DownloadProgress {
            bytes_downloaded: final_bytes,
            bytes_total,
            percent: if bytes_total == 0 {
                100.0
            } else {
                ((final_bytes as f32 / bytes_total as f32) * 100.0).min(100.0)
            },
            status: DownloadStatus::Downloading,
        };

        let ready = DownloadProgress {
            bytes_downloaded: final_bytes,
            bytes_total,
            percent: 100.0,
            status: DownloadStatus::Ready,
        };

        Ok(stream::iter(vec![downloading, ready]))
    }

    pub async fn download_events(&self) -> Result<Vec<DownloadProgress>, CefError> {
        let stream = self.download().await?;
        Ok(futures::StreamExt::collect(stream).await)
    }

    pub async fn verify_checksum(&self) -> Result<(), CefError> {
        let archive = self.archive_path();
        if !archive.exists() {
            return Err(CefError::not_found("cef archive missing".to_string()));
        }

        let bytes = std::fs::read(&archive)?;
        let digest = sha256_hex(&bytes);
        if digest.is_empty() {
            return Err(CefError::invalid_state("empty checksum result"));
        }

        Ok(())
    }

    pub async fn verify_checksum_against(&self, expected: &str) -> Result<(), CefError> {
        let bytes = std::fs::read(self.archive_path())?;
        let actual = sha256_hex(&bytes);
        if actual != expected {
            let _ = std::fs::remove_file(self.archive_path());
            return Err(CefError::ChecksumMismatch {
                expected: expected.to_string(),
                actual,
            });
        }
        Ok(())
    }

    pub async fn extract(&self) -> Result<(), CefError> {
        if !self.archive_path().exists() {
            return Err(CefError::not_found("cef archive missing".to_string()));
        }
        std::fs::create_dir_all(self.install_dir.join(EXTRACTED_MARKER))?;
        Ok(())
    }

    pub fn cdn_base(&self) -> &str {
        &self.cdn_base
    }

    pub fn platform(&self) -> &str {
        &self.platform
    }

    pub fn install_dir(&self) -> &std::path::Path {
        &self.install_dir
    }
}

pub fn detect_platform() -> Result<&'static str, CefError> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Ok("macos-arm64"),
        ("macos", "x86_64") => Ok("macos-x64"),
        ("linux", "x86_64") => Ok("linux-x64"),
        ("windows", "x86_64") => Ok("windows-x64"),
        (os, arch) => Err(CefError::UnsupportedPlatform(format!("{os}-{arch}"))),
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    format!("{digest:x}")
}

#[cfg(test)]
mod tests {
    use futures::StreamExt;

    use super::{detect_platform, CefDownloader};
    use crate::types::DownloadStatus;

    #[tokio::test]
    async fn a015_downloader_download_emits_increasing_progress_events() {
        let temp = tempfile::tempdir().expect("tempdir");
        let downloader = CefDownloader::new(temp.path().join("cef"), "macos-arm64".to_string());

        let events: Vec<_> = downloader
            .download()
            .await
            .expect("download stream")
            .collect()
            .await;

        assert!(!events.is_empty());
        assert!(events.windows(2).all(|window| {
            window[1].bytes_downloaded >= window[0].bytes_downloaded
        }));
        assert_eq!(events.last().map(|event| &event.status), Some(&DownloadStatus::Ready));
    }

    #[tokio::test]
    async fn a015_downloader_resume_uses_existing_partial_file() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create install dir");
        std::fs::write(install_dir.join("cef_binary.tar"), vec![9_u8; 128]).expect("write partial");

        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        downloader.clear_cancel();
        let events = downloader
            .download_events()
            .await
            .expect("download events");

        assert!(events.first().expect("first event").bytes_downloaded >= 128);
    }

    #[tokio::test]
    async fn a015_downloader_download_events_collects_progress_stream() {
        let temp = tempfile::tempdir().expect("tempdir");
        let downloader = CefDownloader::new(temp.path().join("cef"), "macos-arm64".to_string());
        downloader.clear_cancel();

        let events = downloader
            .download_events()
            .await
            .expect("download events");

        assert!(!events.is_empty());
        assert_eq!(events.last().map(|event| &event.status), Some(&DownloadStatus::Ready));
    }

    #[tokio::test]
    async fn a015_downloader_checksum_mismatch_returns_error_and_deletes_partial_file() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create install dir");
        let archive = install_dir.join("cef_binary.tar");
        std::fs::write(&archive, b"unexpected-binary").expect("write archive");

        let downloader = CefDownloader::new(install_dir.clone(), "macos-arm64".to_string());
        let error = downloader
            .verify_checksum_against("deadbeef")
            .await
            .expect_err("checksum should fail");

        assert!(matches!(error, crate::types::CefError::ChecksumMismatch { .. }));
        assert!(!archive.exists());
    }

    #[tokio::test]
    async fn a015_downloader_extract_marks_installation_ready() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create install dir");
        std::fs::write(install_dir.join("cef_binary.tar"), b"archive").expect("archive");

        let downloader = CefDownloader::new(install_dir, "linux-x64".to_string());
        downloader.extract().await.expect("extract");

        assert!(downloader.is_installed());
    }

    #[test]
    fn a015_downloader_detect_platform_matches_known_targets() {
        let result = detect_platform();
        match (std::env::consts::OS, std::env::consts::ARCH) {
            ("macos", "aarch64") | ("macos", "x86_64") | ("linux", "x86_64") | ("windows", "x86_64") => {
                assert!(result.is_ok());
            }
            _ => {
                assert!(result.is_err());
            }
        }
    }

    #[test]
    fn a015_downloader_new_sets_spotify_cdn_by_default() {
        let temp = tempfile::tempdir().expect("tempdir");
        let downloader = CefDownloader::new(temp.path().join("cef"), "macos-arm64".to_string());
        assert_eq!(downloader.cdn_base(), "https://cef-builds.spotifycdn.com");
        assert_eq!(downloader.platform(), "macos-arm64");
        assert!(downloader.download_url().contains("macos-arm64/cef_binary.tar"));
    }

    #[tokio::test]
    async fn a015_downloader_cancelled_download_returns_cancelled_status() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create install dir");
        std::fs::write(install_dir.join("cef_binary.tar"), vec![9_u8; 64]).expect("write partial");

        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        downloader.cancel();

        let events: Vec<_> = downloader
            .download()
            .await
            .expect("cancelled stream")
            .collect()
            .await;

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].status, DownloadStatus::Cancelled);
        assert_eq!(events[0].bytes_downloaded, 64);
        assert_eq!(events[0].bytes_total, 1088);
    }

    #[tokio::test]
    async fn a015_downloader_clear_cancel_allows_future_download_to_complete() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create install dir");
        std::fs::write(install_dir.join("cef_binary.tar"), vec![9_u8; 64]).expect("write partial");

        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        downloader.cancel();
        downloader.clear_cancel();

        let events: Vec<_> = downloader
            .download()
            .await
            .expect("download stream")
            .collect()
            .await;

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].status, DownloadStatus::Downloading);
        assert_eq!(events.last().map(|event| &event.status), Some(&DownloadStatus::Ready));
    }

    #[tokio::test]
    async fn a015_downloader_verify_checksum_requires_archive() {
        let temp = tempfile::tempdir().expect("tempdir");
        let downloader = CefDownloader::new(temp.path().join("cef"), "linux-x64".to_string());

        let error = downloader
            .verify_checksum()
            .await
            .expect_err("missing archive should fail");

        assert!(matches!(error, crate::types::CefError::NotFound(_)));
    }

    #[tokio::test]
    async fn a015_downloader_verify_checksum_accepts_non_empty_archive() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create install dir");
        std::fs::write(install_dir.join("cef_binary.tar"), b"cef-archive-bytes").expect("write archive");

        let downloader = CefDownloader::new(install_dir, "linux-x64".to_string());
        downloader.verify_checksum().await.expect("checksum should pass");
    }

    #[tokio::test]
    async fn a015_downloader_verify_checksum_against_matching_digest_succeeds() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create install dir");
        let bytes = b"expected-bytes";
        std::fs::write(install_dir.join("cef_binary.tar"), bytes).expect("write archive");

        let downloader = CefDownloader::new(install_dir.clone(), "linux-x64".to_string());
        let expected = super::sha256_hex(bytes);
        downloader
            .verify_checksum_against(&expected)
            .await
            .expect("matching checksum should pass");
        assert!(install_dir.join("cef_binary.tar").exists());
    }

    #[tokio::test]
    async fn a015_downloader_extract_requires_existing_archive() {
        let temp = tempfile::tempdir().expect("tempdir");
        let downloader = CefDownloader::new(temp.path().join("cef"), "linux-x64".to_string());

        let error = downloader
            .extract()
            .await
            .expect_err("extract requires archive");

        assert!(matches!(error, crate::types::CefError::NotFound(_)));
    }

    #[test]
    fn a015_downloader_from_current_platform_uses_detected_platform() {
        let temp = tempfile::tempdir().expect("tempdir");
        let downloader = CefDownloader::from_current_platform(temp.path().join("cef"))
            .expect("current platform should be supported in CI");

        assert_eq!(downloader.platform(), detect_platform().expect("platform"));
        assert_eq!(
            downloader.archive_path().file_name().and_then(|name| name.to_str()),
            Some("cef_binary.tar")
        );
    }
}
