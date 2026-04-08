pub mod cdp;
pub mod download;
pub mod paths;
pub mod runtime;
pub mod types;
pub mod window;

#[cfg(test)]
mod tests {
    // Spec: docs/plans/T29-snapfzz-cef-crate-plan.md
    // Section: Unit 1 — Crate Skeleton
    // Verifies: snapfzz-cef exports required runtime modules.
    #[test]
    fn a015_crate_skeleton_exports_required_modules() {
        let _ = crate::runtime::CefRuntime::new;
        let _ = crate::window::CefWindow::new;
        let _ = crate::download::CefDownloader::new;
        let _ = crate::cdp::CdpServer::new;
        let _ = crate::types::WindowConfig::default;
    }
}
