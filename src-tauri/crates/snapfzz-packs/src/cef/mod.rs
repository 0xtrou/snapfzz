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
}
