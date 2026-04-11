// A018/Packs: CEF service pack — Chromium Embedded Framework browser runtime.

pub mod cdp;
pub mod download;
pub mod paths;
pub mod runtime;
pub mod types;
pub mod window;

use crate::cef::download::CefDownloader;
use crate::cef::types::CefPlatformInfo;

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

    CefPlatformInfo {
        os: os.to_string(),
        arch: arch.to_string(),
        platform: platform.to_string(),
        platform_display: platform_display.to_string(),
        download_url,
        install_path: downloader.install_dir().to_string_lossy().to_string(),
        is_installed: downloader.is_installed(),
    }
}

#[cfg(test)]
mod tests {
    // Spec: docs/plans/T29-snapfzz-cef-crate-plan.md
    // Section: Unit 1 — Crate Skeleton
    // Verifies: cef service pack exports required runtime modules.
    #[test]
    fn a015_crate_skeleton_exports_required_modules() {
        let _ = crate::cef::runtime::CefRuntime::new;
        let _ = crate::cef::window::CefWindow::new;
        let _ = crate::cef::download::CefDownloader::new;
        let _ = crate::cef::cdp::CdpServer::new;
        let _ = crate::cef::types::WindowConfig::default;
    }
}
