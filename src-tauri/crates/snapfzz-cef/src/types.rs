use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowConfig {
    pub width: u32,
    pub height: u32,
    pub min_width: u32,
    pub min_height: u32,
    pub resizable: bool,
    pub title: String,
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            width: 1200,
            height: 800,
            min_width: 400,
            min_height: 300,
            resizable: true,
            title: "Mini App".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleMessage {
    pub level: String,
    pub message: String,
    pub source: Option<String>,
    pub line: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub bytes_downloaded: u64,
    pub bytes_total: u64,
    pub percent: f32,
    pub status: DownloadStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum DownloadStatus {
    Downloading,
    Extracting,
    Verifying,
    Ready,
    Cancelled,
    Failed(String),
}

#[derive(Debug, thiserror::Error)]
pub enum CefError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("already exists: {0}")]
    AlreadyExists(String),
    #[error("unsupported platform: {0}")]
    UnsupportedPlatform(String),
    #[error("network: {0}")]
    Network(String),
    #[error("io: {0}")]
    Io(String),
    #[error("checksum mismatch: expected {expected}, got {actual}")]
    ChecksumMismatch { expected: String, actual: String },
    #[error("invalid state: {0}")]
    InvalidState(String),
    #[error("internal: {0}")]
    Internal(String),
}

impl CefError {
    pub fn not_found(msg: String) -> Self {
        Self::NotFound(msg)
    }

    pub fn already_exists(msg: String) -> Self {
        Self::AlreadyExists(msg)
    }

    pub fn internal(msg: &str) -> Self {
        Self::Internal(msg.to_string())
    }

    pub fn invalid_state(msg: impl Into<String>) -> Self {
        Self::InvalidState(msg.into())
    }

    pub fn network(msg: String) -> Self {
        Self::Network(msg)
    }
}

impl From<std::io::Error> for CefError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value.to_string())
    }
}

/// Platform metadata for the CEF runtime, surfaced to the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CefPlatformInfo {
    pub os: String,
    pub arch: String,
    pub platform: String,
    pub platform_display: String,
    pub download_url: String,
    pub install_path: String,
    pub is_installed: bool,
}

#[cfg(test)]
mod tests {
    use super::{CefError, ConsoleMessage, DownloadProgress, DownloadStatus, WindowConfig};

    #[test]
    fn a015_types_window_config_default_matches_manifest_baseline() {
        let cfg = WindowConfig::default();
        assert_eq!(cfg.width, 1200);
        assert_eq!(cfg.height, 800);
        assert_eq!(cfg.min_width, 400);
        assert_eq!(cfg.min_height, 300);
        assert!(cfg.resizable);
        assert_eq!(cfg.title, "Mini App");
    }

    #[test]
    fn a015_types_download_status_and_progress_are_constructible() {
        let progress = DownloadProgress {
            bytes_downloaded: 64,
            bytes_total: 128,
            percent: 50.0,
            status: DownloadStatus::Downloading,
        };

        assert_eq!(progress.bytes_downloaded, 64);
        assert_eq!(progress.bytes_total, 128);
        assert_eq!(progress.percent, 50.0);
        assert!(matches!(progress.status, DownloadStatus::Downloading));

        let failed = DownloadStatus::Failed("network timeout".to_string());
        assert!(matches!(failed, DownloadStatus::Failed(message) if message == "network timeout"));
    }

    #[test]
    fn a015_types_cef_error_helpers_return_expected_variants() {
        assert!(matches!(
            CefError::not_found("missing".to_string()),
            CefError::NotFound(message) if message == "missing"
        ));
        assert!(matches!(
            CefError::already_exists("dup".to_string()),
            CefError::AlreadyExists(message) if message == "dup"
        ));
        assert!(matches!(
            CefError::invalid_state("invalid"),
            CefError::InvalidState(message) if message == "invalid"
        ));
        assert!(matches!(
            CefError::internal("internal"),
            CefError::Internal(message) if message == "internal"
        ));
    }

    #[test]
    fn a015_types_console_message_fields_are_preserved() {
        let message = ConsoleMessage {
            level: "warn".to_string(),
            message: "slow render".to_string(),
            source: Some("miniapp.js".to_string()),
            line: Some(44),
        };

        assert_eq!(message.level, "warn");
        assert_eq!(message.message, "slow render");
        assert_eq!(message.source.as_deref(), Some("miniapp.js"));
        assert_eq!(message.line, Some(44));
    }

    #[test]
    fn a015_types_io_error_conversion_maps_to_io_variant() {
        let error: CefError = std::io::Error::other("disk failed").into();
        assert!(matches!(error, CefError::Io(message) if message.contains("disk failed")));
    }
}
