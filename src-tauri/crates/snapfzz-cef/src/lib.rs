// A018/Cef: Domain logic for the Chromium Embedded Framework browser runtime.
//
// This crate owns CEF domain concerns — runtime lifecycle, window management,
// Chrome DevTools Protocol, path resolution, and shared types.
//
// Runtime management (download, install, extract) lives in `snapfzz-packs::cef`.

pub mod cdp;
pub mod paths;
pub mod runtime;
pub mod types;
pub mod window;

// Re-exports for convenience.
pub use cdp::CdpServer;
pub use paths::{cef_binary_path, cef_cache_path, cef_data_dir, ensure_cef_dirs};
pub use runtime::CefRuntime;
pub use types::{
    CefError, CefPlatformInfo, ConsoleMessage, DownloadProgress, DownloadStatus, WindowConfig,
};
pub use window::CefWindow;

/// Trait for checking whether the CEF runtime binaries are installed.
///
/// This decouples the domain runtime (`CefRuntime`) from the download/install
/// machinery in `snapfzz-packs`. The downloader implements this trait so the
/// runtime can query install status without depending on the packs crate.
pub trait CefInstallCheck: Send + Sync {
    fn is_installed(&self) -> bool;
}

impl<T: CefInstallCheck> CefInstallCheck for std::sync::Arc<T> {
    fn is_installed(&self) -> bool {
        (**self).is_installed()
    }
}

/// Build a [`CefPlatformInfo`] snapshot for the UI.
///
/// Accepts raw device strings and a generic install-checker so this function
/// does not depend on `snapfzz-packs`.
pub fn build_platform_info(
    os: &str,
    arch: &str,
    platform: &str,
    platform_display: &str,
    download_url: String,
    install_path: String,
    is_installed: bool,
) -> CefPlatformInfo {
    CefPlatformInfo {
        os: os.to_string(),
        arch: arch.to_string(),
        platform: platform.to_string(),
        platform_display: platform_display.to_string(),
        download_url,
        install_path,
        is_installed,
    }
}

#[cfg(test)]
mod tests {
    // Spec: docs/plans/T29-snapfzz-cef-crate-plan.md
    // Section: Unit 1 — Crate Skeleton
    // Verifies: cef crate exports required domain modules.
    #[test]
    fn a015_crate_skeleton_exports_required_modules() {
        let _ = crate::runtime::CefRuntime::new;
        let _ = crate::window::CefWindow::new;
        let _ = crate::cdp::CdpServer::new;
        let _ = crate::types::WindowConfig::default;
    }
}
