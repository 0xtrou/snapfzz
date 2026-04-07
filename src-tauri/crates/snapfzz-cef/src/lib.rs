pub mod cdp;
pub mod download;
pub mod paths;
pub mod runtime;
pub mod types;
pub mod window;

#[cfg(test)]
mod tests {
    #[test]
    fn a015_snapfzz_cef_crate_exports_required_modules() {
        let _ = crate::runtime::CefRuntime::new;
        let _ = crate::window::CefWindow::new;
        let _ = crate::download::CefDownloader::new;
        let _ = crate::cdp::CdpServer::new;
        let _ = crate::types::WindowConfig::default;
    }
}
