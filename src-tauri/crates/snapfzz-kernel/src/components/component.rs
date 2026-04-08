use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub platform: String,
    pub platform_display: String,
    pub download_url: String,
    pub install_path: String,
    pub size: u64,
    pub checksum: String,
    pub checksum_algorithm: String,
    pub is_installed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub component_id: String,
    pub bytes_downloaded: u64,
    pub bytes_total: u64,
    pub percent: f32,
    pub status: DownloadStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum DownloadStatus {
    Pending,
    Downloading,
    Verifying,
    Extracting,
    Ready,
    Cancelled,
    Failed(String),
}

#[derive(Debug, thiserror::Error)]
pub enum ComponentError {
    #[error("component not found: {0}")]
    NotFound(String),
    #[error("network error: {0}")]
    Network(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("checksum mismatch: expected {expected}, got {actual}")]
    ChecksumMismatch { expected: String, actual: String },
    #[error("unsupported platform: {0}")]
    UnsupportedPlatform(String),
    #[error("internal error: {0}")]
    Internal(String),
}

impl ComponentError {
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::NotFound(msg.into())
    }

    pub fn network(msg: impl Into<String>) -> Self {
        Self::Network(msg.into())
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self::Internal(msg.into())
    }
}

#[async_trait::async_trait]
pub trait SystemComponent: Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn install_dir(&self) -> &Path;
    fn is_installed(&self) -> bool;
    async fn resolve(&self) -> Result<ComponentInfo, ComponentError>;
    async fn download(&self) -> Result<Vec<DownloadProgress>, ComponentError>;
    fn cancel(&self);
    fn clear_cancel(&self);
    async fn verify(&self) -> Result<String, ComponentError>;
    async fn extract(&self) -> Result<(), ComponentError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a014_components_component_info_serializes_with_camel_case() {
        let info = ComponentInfo {
            id: "cef".into(),
            name: "Chromium Embedded Framework".into(),
            version: "146.0.10".into(),
            platform: "macos-arm64".into(),
            platform_display: "macOS (Apple Silicon)".into(),
            download_url: "https://example.com/cef.tar.bz2".into(),
            install_path: "/Users/test/.snapfzz/runtime/cef".into(),
            size: 124_000_000,
            checksum: "abc123".into(),
            checksum_algorithm: "sha1".into(),
            is_installed: false,
        };
        let json = serde_json::to_value(&info).unwrap();
        assert_eq!(json["componentId"], serde_json::Value::Null);
        assert_eq!(json["id"], "cef");
        assert_eq!(json["platformDisplay"], "macOS (Apple Silicon)");
        assert_eq!(json["downloadUrl"], "https://example.com/cef.tar.bz2");
        assert_eq!(json["installPath"], "/Users/test/.snapfzz/runtime/cef");
        assert_eq!(json["checksumAlgorithm"], "sha1");
        assert_eq!(json["isInstalled"], false);
    }

    #[test]
    fn a014_components_download_progress_serializes_with_camel_case() {
        let progress = DownloadProgress {
            component_id: "cef".into(),
            bytes_downloaded: 50_000_000,
            bytes_total: 124_000_000,
            percent: 40.3,
            status: DownloadStatus::Downloading,
        };
        let json = serde_json::to_value(&progress).unwrap();
        assert_eq!(json["componentId"], "cef");
        assert_eq!(json["bytesDownloaded"], 50_000_000);
        assert_eq!(json["bytesTotal"], 124_000_000);
        assert_eq!(json["status"], "downloading");
    }

    #[test]
    fn a014_components_download_status_variants_serialize() {
        assert_eq!(serde_json::to_value(DownloadStatus::Pending).unwrap(), "pending");
        assert_eq!(serde_json::to_value(DownloadStatus::Downloading).unwrap(), "downloading");
        assert_eq!(serde_json::to_value(DownloadStatus::Verifying).unwrap(), "verifying");
        assert_eq!(serde_json::to_value(DownloadStatus::Extracting).unwrap(), "extracting");
        assert_eq!(serde_json::to_value(DownloadStatus::Ready).unwrap(), "ready");
        assert_eq!(serde_json::to_value(DownloadStatus::Cancelled).unwrap(), "cancelled");
        let failed = serde_json::to_value(DownloadStatus::Failed("oops".into())).unwrap();
        assert!(failed.get("failed").is_some());
    }

    #[test]
    fn a014_components_component_error_variants_produce_messages() {
        assert!(ComponentError::not_found("x").to_string().contains("x"));
        assert!(ComponentError::network("y").to_string().contains("y"));
        assert!(ComponentError::internal("z").to_string().contains("z"));
        let io_err = ComponentError::from(std::io::Error::new(std::io::ErrorKind::NotFound, "gone"));
        assert!(io_err.to_string().contains("gone"));
        let checksum = ComponentError::ChecksumMismatch {
            expected: "aaa".into(),
            actual: "bbb".into(),
        };
        assert!(checksum.to_string().contains("aaa"));
        assert!(checksum.to_string().contains("bbb"));
        let platform = ComponentError::UnsupportedPlatform("riscv".into());
        assert!(platform.to_string().contains("riscv"));
    }
}
