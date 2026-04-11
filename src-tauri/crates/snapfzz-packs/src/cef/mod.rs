// A018/Packs: CEF service pack — Chromium Embedded Framework browser runtime.

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
