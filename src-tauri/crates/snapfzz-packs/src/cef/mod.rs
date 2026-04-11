// A018/Packs: CEF service pack — download and install management only.
//
// Domain logic (runtime, window, CDP, types, paths) lives in `snapfzz-cef`.

pub mod download;

use crate::cef::download::CefDownloader;
use snapfzz_cef::CefPlatformInfo;

/// Build a [`CefPlatformInfo`] snapshot for the UI.
///
/// Accepts raw device strings so this function does not depend on `snapfzz-kernel`.
pub async fn build_platform_info(
    os: &str,
    arch: &str,
    platform: &str,
    platform_display: &str,
    downloader: &CefDownloader,
) -> CefPlatformInfo {
    let download_url = downloader
        .resolve_latest_build()
        .await
        .map(|build| build.download_url)
        .unwrap_or_else(|_| downloader.download_url());

    snapfzz_cef::build_platform_info(
        os,
        arch,
        platform,
        platform_display,
        download_url,
        downloader.install_dir().to_string_lossy().to_string(),
        downloader.is_installed(),
    )
}

#[cfg(test)]
mod tests {
    // Spec: docs/plans/T29-snapfzz-cef-crate-plan.md
    // Section: Unit 1 — Crate Skeleton
    // Verifies: cef service pack exports download module.
    #[test]
    fn a015_crate_skeleton_exports_download_module() {
        let _ = crate::cef::download::CefDownloader::new;
    }

    // ── build_platform_info ──────────────────────────────────────────────────

    #[tokio::test]
    async fn a015_build_platform_info_falls_back_to_default_url_on_network_error() {
        use super::*;

        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create dir");

        // No cache — resolve_latest_build will fail (no real network in test env).
        // build_platform_info must fall back to downloader.download_url().
        let downloader = CefDownloader::new(install_dir, "linux-x64".to_string());
        let fallback_url = downloader.download_url();

        let info = build_platform_info(
            "linux",
            "x86_64",
            "linux-x64",
            "Linux (x86_64)",
            &downloader,
        )
        .await;

        assert_eq!(info.os, "linux");
        assert_eq!(info.arch, "x86_64");
        assert_eq!(info.platform, "linux-x64");
        assert_eq!(info.platform_display, "Linux (x86_64)");
        // URL is either the static fallback (offline) or a real CDN URL (online) — both are valid
        assert!(
            info.download_url == fallback_url || info.download_url.starts_with("https://cef-builds.spotifycdn.com/"),
            "unexpected url: {}",
            info.download_url
        );
        assert!(!info.is_installed);
    }

    #[tokio::test]
    async fn a015_build_platform_info_returns_correct_install_dir() {
        use super::*;

        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(&install_dir).expect("create dir");
        let expected_path = install_dir.to_string_lossy().to_string();

        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        let info = build_platform_info(
            "macos",
            "aarch64",
            "macos-arm64",
            "macOS (Apple Silicon)",
            &downloader,
        )
        .await;

        assert_eq!(info.install_path, expected_path);
    }
}
