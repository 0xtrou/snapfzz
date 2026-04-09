use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use serde::Serialize;
use serde_json::Value;
use snapfzz_kernel::components::{
    download_file, extract_tar_bz2, verify_sha1, ComponentError, ComponentInfo, DownloadProgress,
    DownloadStatus, SystemComponent,
};
use tokio::sync::Mutex;

use crate::platform::PlatformInfo;

const DEFAULT_CEF_INDEX_URL: &str = "https://cef-builds.spotifycdn.com/index.json";
const DEFAULT_CEF_CDN_BASE: &str = "https://cef-builds.spotifycdn.com";
const CEF_ARCHIVE_SUFFIX: &str = ".tar.bz2";
const CEF_BUILD_TYPE: &str = "minimal";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CefBuildInfo {
    pub cef_version: String,
    pub chromium_version: String,
    pub filename: String,
    pub download_url: String,
    pub size: u64,
    pub sha1: String,
}

#[derive(Debug)]
pub struct CefPackComponent {
    install_dir: PathBuf,
    platform: PlatformInfo,
    cdn_platform: String,
    cancelled: Arc<AtomicBool>,
    cached_build: Mutex<Option<CefBuildInfo>>,
    index_url: String,
    cdn_base_url: String,
}

impl CefPackComponent {
    pub fn new(install_dir: PathBuf, platform: PlatformInfo) -> Self {
        Self {
            install_dir,
            cdn_platform: cef_platform_key(&platform.platform),
            platform,
            cancelled: Arc::new(AtomicBool::new(false)),
            cached_build: Mutex::new(None),
            index_url: DEFAULT_CEF_INDEX_URL.to_string(),
            cdn_base_url: DEFAULT_CEF_CDN_BASE.to_string(),
        }
    }

    #[cfg(test)]
    fn with_urls(
        install_dir: PathBuf,
        platform: PlatformInfo,
        index_url: String,
        cdn_base_url: String,
    ) -> Self {
        Self {
            install_dir,
            cdn_platform: cef_platform_key(&platform.platform),
            platform,
            cancelled: Arc::new(AtomicBool::new(false)),
            cached_build: Mutex::new(None),
            index_url,
            cdn_base_url,
        }
    }

    pub fn platform(&self) -> &str {
        &self.platform.platform
    }

    async fn resolve_latest_build(&self) -> Result<CefBuildInfo, ComponentError> {
        {
            let cache = self.cached_build.lock().await;
            if let Some(build) = cache.clone() {
                return Ok(build);
            }
        }

        let build = self.fetch_latest_build().await?;
        let mut cache = self.cached_build.lock().await;
        *cache = Some(build.clone());
        Ok(build)
    }

    async fn fetch_latest_build(&self) -> Result<CefBuildInfo, ComponentError> {
        let index: Value = reqwest::Client::new()
            .get(&self.index_url)
            .send()
            .await
            .map_err(|error| ComponentError::network(format!("failed to fetch CEF index: {error}")))?
            .error_for_status()
            .map_err(|error| ComponentError::network(format!("failed to fetch CEF index: {error}")))?
            .json()
            .await
            .map_err(|error| ComponentError::network(format!("failed to parse CEF index: {error}")))?;

        let versions = index
            .get(&self.cdn_platform)
            .and_then(|value| value.get("versions"))
            .and_then(|value| value.as_array())
            .ok_or_else(|| ComponentError::not_found(format!("no CEF versions for {}", self.cdn_platform)))?;

        let selected = versions
            .iter()
            .find(|entry| entry.get("channel").and_then(|value| value.as_str()) == Some("stable"))
            .or_else(|| versions.first())
            .ok_or_else(|| ComponentError::not_found("no CEF stable build available"))?;

        let files = selected
            .get("files")
            .and_then(|value| value.as_array())
            .ok_or_else(|| ComponentError::not_found("no CEF files available for build"))?;

        let file = files
            .iter()
            .find(|entry| entry.get("type").and_then(|value| value.as_str()) == Some(CEF_BUILD_TYPE))
            .ok_or_else(|| ComponentError::not_found(format!("no '{CEF_BUILD_TYPE}' build file")))?;

        let filename = file
            .get("name")
            .and_then(|value| value.as_str())
            .ok_or_else(|| ComponentError::not_found("CEF file missing name"))?
            .to_string();

        Ok(CefBuildInfo {
            cef_version: selected
                .get("cef_version")
                .and_then(|value| value.as_str())
                .unwrap_or("unknown")
                .to_string(),
            chromium_version: selected
                .get("chromium_version")
                .and_then(|value| value.as_str())
                .unwrap_or("unknown")
                .to_string(),
            filename: filename.clone(),
            download_url: format!("{}/{}", self.cdn_base_url, filename),
            size: file.get("size").and_then(|value| value.as_u64()).unwrap_or(0),
            sha1: file
                .get("sha1")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string(),
        })
    }

    fn archive_path_for(&self, filename: &str) -> PathBuf {
        self.install_dir.join(filename)
    }

    fn find_archive(&self) -> Result<PathBuf, ComponentError> {
        let entries = std::fs::read_dir(&self.install_dir)
            .map_err(|error| ComponentError::not_found(format!("unable to read install dir: {error}")))?;
        for entry in entries {
            let entry = entry.map_err(|error| ComponentError::not_found(error.to_string()))?;
            let name = entry.file_name();
            if name.to_string_lossy().ends_with(CEF_ARCHIVE_SUFFIX) {
                return Ok(entry.path());
            }
        }
        Err(ComponentError::not_found("CEF archive not found"))
    }
}

#[async_trait::async_trait]
impl SystemComponent for CefPackComponent {
    fn id(&self) -> &str {
        "cef"
    }

    fn name(&self) -> &str {
        "Chromium Embedded Framework"
    }

    fn install_dir(&self) -> &Path {
        &self.install_dir
    }

    fn is_installed(&self) -> bool {
        std::fs::read_dir(&self.install_dir)
            .ok()
            .map(|entries| {
                entries.filter_map(Result::ok).any(|entry| {
                    entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false)
                        && entry.file_name().to_string_lossy().starts_with("cef_binary")
                })
            })
            .unwrap_or(false)
    }

    async fn resolve(&self) -> Result<ComponentInfo, ComponentError> {
        let build = self.resolve_latest_build().await?;
        Ok(ComponentInfo {
            id: "cef".into(),
            name: "Chromium Embedded Framework".into(),
            description: "Full Chromium browser engine for running mini apps with WebRTC, WebGL, service workers, and DevTools support.".into(),
            license: "BSD-3-Clause".into(),
            version: build.cef_version,
            platform: self.platform.platform.clone(),
            platform_display: self.platform.display.to_string(),
            download_url: build.download_url,
            install_path: self.install_dir.to_string_lossy().into_owned(),
            size: build.size,
            checksum: build.sha1,
            checksum_algorithm: "sha1".into(),
            is_installed: self.is_installed(),
            repository_url: "https://github.com/chromiumembedded/cef".into(),
            website_url: "https://chromiumembedded.github.io/cef/".into(),
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

        let build = self.resolve_latest_build().await?;
        let archive_path = self.archive_path_for(&build.filename);

        let mut events = download_file(
            &build.download_url,
            &archive_path,
            build.size,
            &self.cancelled,
            self.id(),
        )
        .await?;

        if matches!(events.last().map(|event| &event.status), Some(DownloadStatus::Cancelled)) {
            return Ok(events);
        }

        if matches!(events.last().map(|event| &event.status), Some(DownloadStatus::Ready)) {
            events.pop();
        }

        events.push(DownloadProgress {
            component_id: self.id().into(),
            bytes_downloaded: build.size,
            bytes_total: build.size.max(1),
            percent: 100.0,
            status: DownloadStatus::Verifying,
        });

        if !build.sha1.is_empty() {
            verify_sha1(&archive_path, &build.sha1)?;
        }

        events.push(DownloadProgress {
            component_id: self.id().into(),
            bytes_downloaded: build.size,
            bytes_total: build.size.max(1),
            percent: 100.0,
            status: DownloadStatus::Extracting,
        });

        extract_tar_bz2(&archive_path, &self.install_dir)?;

        events.push(DownloadProgress {
            component_id: self.id().into(),
            bytes_downloaded: build.size,
            bytes_total: build.size.max(1),
            percent: 100.0,
            status: DownloadStatus::Ready,
        });

        Ok(events)
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    fn clear_cancel(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }

    async fn verify(&self) -> Result<String, ComponentError> {
        let archive = self.find_archive()?;
        let bytes = std::fs::read(archive)?;
        let mut hasher = sha1::Sha1::new();
        use sha1::Digest;
        hasher.update(bytes);
        Ok(format!("{:x}", hasher.finalize()))
    }

    async fn extract(&self) -> Result<(), ComponentError> {
        let archive = self.find_archive()?;
        extract_tar_bz2(&archive, &self.install_dir)
    }
}

fn cef_platform_key(platform: &str) -> String {
    match platform {
        "macos-arm64" => "macosarm64",
        "macos-x64" => "macosx64",
        "linux-x64" => "linux64",
        "linux-arm64" => "linuxarm64",
        "windows-x64" => "windows64",
        "windows-arm64" => "windowsarm64",
        _ => "unsupported",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn platform(platform: &str) -> PlatformInfo {
        PlatformInfo {
            os: "test-os",
            arch: "test-arch",
            platform: platform.to_string(),
            display: "Test Platform",
            exe_suffix: "",
            archive_ext: ".tar.gz",
        }
    }

    #[test]
    fn t32_cef_is_installed_false_without_cef_binary_dir() {
        let temp = tempfile::tempdir().unwrap();
        let component = CefPackComponent::new(temp.path().to_path_buf(), platform("linux-x64"));
        assert!(!component.is_installed());
    }

    #[test]
    fn t32_cef_is_installed_true_with_cef_binary_dir() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(temp.path().join("cef_binary_146.0.10")).unwrap();
        let component = CefPackComponent::new(temp.path().to_path_buf(), platform("linux-x64"));
        assert!(component.is_installed());
    }

    #[test]
    fn t32_cef_cancel_and_clear_cancel_toggle_flag() {
        let temp = tempfile::tempdir().unwrap();
        let component = CefPackComponent::new(temp.path().to_path_buf(), platform("linux-x64"));
        assert!(!component.cancelled.load(Ordering::SeqCst));
        component.cancel();
        assert!(component.cancelled.load(Ordering::SeqCst));
        component.clear_cancel();
        assert!(!component.cancelled.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn t32_cef_download_returns_cancelled_when_pre_cancelled() {
        let temp = tempfile::tempdir().unwrap();
        let component = CefPackComponent::new(temp.path().to_path_buf(), platform("linux-x64"));
        component.cancel();

        let events = component.download().await.unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].status, DownloadStatus::Cancelled);
    }

    #[test]
    fn t32_cef_platform_key_maps_supported_platforms() {
        assert_eq!(cef_platform_key("macos-arm64"), "macosarm64");
        assert_eq!(cef_platform_key("macos-x64"), "macosx64");
        assert_eq!(cef_platform_key("linux-x64"), "linux64");
        assert_eq!(cef_platform_key("linux-arm64"), "linuxarm64");
        assert_eq!(cef_platform_key("windows-x64"), "windows64");
        assert_eq!(cef_platform_key("windows-arm64"), "windowsarm64");
    }

    #[tokio::test]
    async fn t32_cef_resolve_returns_component_info_fields() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let index_body = r#"{
            "linux64": {
                "versions": [{
                    "channel": "stable",
                    "cef_version": "146.0.10+g1234567",
                    "chromium_version": "146.0.7423.3",
                    "files": [{
                        "type": "minimal",
                        "name": "cef_binary_test_linux64_minimal.tar.bz2",
                        "size": 2048,
                        "sha1": "abc123"
                    }]
                }]
            }
        }"#
        .to_string();

        let server = tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buffer = [0_u8; 4096];
                let _ = socket.read(&mut buffer).await;
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    index_body.len(),
                    index_body
                );
                let _ = socket.write_all(response.as_bytes()).await;
            }
        });

        let temp = tempfile::tempdir().unwrap();
        let component = CefPackComponent::with_urls(
            temp.path().to_path_buf(),
            platform("linux-x64"),
            format!("http://{addr}/index.json"),
            format!("http://{addr}"),
        );

        let info = component.resolve().await.unwrap();
        server.await.unwrap();

        assert_eq!(info.id, "cef");
        assert_eq!(info.name, "Chromium Embedded Framework");
        assert_eq!(info.license, "BSD-3-Clause");
        assert_eq!(info.version, "146.0.10+g1234567");
        assert_eq!(info.platform, "linux-x64");
        assert_eq!(info.platform_display, "Test Platform");
        assert_eq!(
            info.download_url,
            format!("http://{addr}/cef_binary_test_linux64_minimal.tar.bz2")
        );
        assert_eq!(info.size, 2048);
        assert_eq!(info.checksum, "abc123");
    }

    #[test]
    fn t32_cef_platform_accessor_returns_platform_string() {
        let temp = tempfile::tempdir().unwrap();
        let component = CefPackComponent::new(temp.path().to_path_buf(), platform("linux-arm64"));
        assert_eq!(component.platform(), "linux-arm64");
    }

    #[test]
    fn t32_cef_find_archive_returns_matching_tar_bz2_file() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("notes.txt"), b"x").unwrap();
        let archive = temp.path().join("cef_binary_linux64_minimal.tar.bz2");
        std::fs::write(&archive, b"archive-bytes").unwrap();

        let component = CefPackComponent::new(temp.path().to_path_buf(), platform("linux-x64"));
        let found = component.find_archive().unwrap();
        assert_eq!(found, archive);
    }

    #[test]
    fn t32_cef_find_archive_returns_not_found_when_no_archive() {
        let temp = tempfile::tempdir().unwrap();
        let component = CefPackComponent::new(temp.path().to_path_buf(), platform("linux-x64"));
        let err = component.find_archive().unwrap_err();
        assert!(matches!(err, ComponentError::NotFound(_)));
    }

    #[tokio::test]
    async fn t32_cef_verify_returns_sha1_for_found_archive() {
        let temp = tempfile::tempdir().unwrap();
        let archive = temp.path().join("cef_binary_linux64_minimal.tar.bz2");
        std::fs::write(&archive, b"cef-bytes").unwrap();
        let component = CefPackComponent::new(temp.path().to_path_buf(), platform("linux-x64"));

        let digest = component.verify().await.unwrap();

        assert_eq!(digest.len(), 40);
    }

    #[tokio::test]
    async fn t32_cef_extract_returns_not_found_when_archive_missing() {
        let temp = tempfile::tempdir().unwrap();
        let component = CefPackComponent::new(temp.path().to_path_buf(), platform("linux-x64"));

        let err = component.extract().await.unwrap_err();

        assert!(matches!(err, ComponentError::NotFound(_)));
    }

    #[tokio::test]
    async fn t32_cef_resolve_falls_back_to_first_version_when_no_stable_channel() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let index_body = r#"{
            "linux64": {
                "versions": [{
                    "channel": "beta",
                    "cef_version": "147.0.1",
                    "chromium_version": "147.0.0",
                    "files": [{
                        "type": "minimal",
                        "name": "cef_beta.tar.bz2",
                        "size": 123,
                        "sha1": ""
                    }]
                }]
            }
        }"#
        .to_string();

        let server = tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buffer = [0_u8; 4096];
                let _ = socket.read(&mut buffer).await;
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    index_body.len(),
                    index_body
                );
                let _ = socket.write_all(response.as_bytes()).await;
            }
        });

        let temp = tempfile::tempdir().unwrap();
        let component = CefPackComponent::with_urls(
            temp.path().to_path_buf(),
            platform("linux-x64"),
            format!("http://{addr}/index.json"),
            format!("http://{addr}"),
        );

        let info = component.resolve().await.unwrap();
        server.await.unwrap();

        assert_eq!(info.version, "147.0.1");
        assert_eq!(info.download_url, format!("http://{addr}/cef_beta.tar.bz2"));
    }

    #[tokio::test]
    async fn t32_cef_resolve_returns_not_found_when_platform_missing_in_index() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let index_body = "{}".to_string();

        let server = tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buffer = [0_u8; 4096];
                let _ = socket.read(&mut buffer).await;
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    index_body.len(),
                    index_body
                );
                let _ = socket.write_all(response.as_bytes()).await;
            }
        });

        let temp = tempfile::tempdir().unwrap();
        let component = CefPackComponent::with_urls(
            temp.path().to_path_buf(),
            platform("linux-x64"),
            format!("http://{addr}/index.json"),
            format!("http://{addr}"),
        );

        let err = component.resolve().await.unwrap_err();
        server.await.unwrap();

        assert!(matches!(err, ComponentError::NotFound(_)));
    }
}
