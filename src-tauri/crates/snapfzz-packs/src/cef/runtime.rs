use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::cef::cdp::CdpServer;
use crate::cef::download::CefDownloader;
use crate::cef::types::{CefError, ConsoleMessage, WindowConfig};
use crate::cef::window::CefWindow;

pub struct CefRuntime {
    initialized: bool,
    cef_dir: PathBuf,
    windows: HashMap<String, CefWindow>,
    cdp_server: Option<CdpServer>,
    next_cdp_port: u16,
}

impl CefRuntime {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            initialized: false,
            cef_dir: data_dir.join("runtime").join("cef"),
            windows: HashMap::new(),
            cdp_server: None,
            next_cdp_port: 9222,
        }
    }

    pub async fn ensure_ready(&mut self, downloader: &CefDownloader) -> Result<(), CefError> {
        if self.initialized {
            return Ok(());
        }

        if !downloader.is_installed() {
            return Err(CefError::invalid_state(
                "CEF runtime is not installed. Start the download flow first.",
            ));
        }

        self.initialized = true;
        if self.cdp_server.is_none() {
            let port = self.next_cdp_port;
            self.next_cdp_port = self.next_cdp_port.saturating_add(1);
            self.cdp_server = Some(CdpServer::new(port));
        }
        Ok(())
    }

    pub fn is_ready(&self) -> bool {
        self.initialized
    }

    pub fn create_window(
        &mut self,
        id: &str,
        url: &str,
        config: WindowConfig,
    ) -> Result<&CefWindow, CefError> {
        if !self.initialized {
            return Err(CefError::invalid_state("CEF runtime is not ready"));
        }
        if self.windows.contains_key(id) {
            return Err(CefError::already_exists(format!("window '{id}' already exists")));
        }

        let mut window = CefWindow::new(id.to_string(), url.to_string(), config);
        let cdp_server = self
            .cdp_server
            .as_mut()
            .ok_or_else(|| CefError::invalid_state("CDP server is not running"))?;
        cdp_server.attach(id);
        window.attach_cdp_port(cdp_server.port());
        self.windows.insert(id.to_string(), window);
        self.windows
            .get(id)
            .ok_or_else(|| CefError::internal("failed to get inserted window"))
    }

    pub fn window(&self, id: &str) -> Option<&CefWindow> {
        self.windows.get(id)
    }

    pub fn window_mut(&mut self, id: &str) -> Option<&mut CefWindow> {
        self.windows.get_mut(id)
    }

    pub fn close_window(&mut self, id: &str) -> Result<(), CefError> {
        let mut window = self
            .windows
            .remove(id)
            .ok_or_else(|| CefError::not_found(format!("window '{id}' not found")))?;
        if let Some(cdp_server) = self.cdp_server.as_mut() {
            cdp_server.detach(id);
        }
        window.close();
        Ok(())
    }

    pub fn shutdown(&mut self) {
        for (_id, mut window) in self.windows.drain() {
            window.close();
        }
        self.cdp_server = None;
        self.initialized = false;
    }

    pub fn cef_dir(&self) -> &Path {
        &self.cef_dir
    }

    pub fn cdp_server(&self) -> Option<&CdpServer> {
        self.cdp_server.as_ref()
    }

    pub fn navigate_window(&mut self, id: &str, url: &str) -> Result<(), CefError> {
        let window = self
            .windows
            .get_mut(id)
            .ok_or_else(|| CefError::not_found(format!("window '{id}' not found")))?;
        window.navigate(url);
        Ok(())
    }

    pub fn go_back(&mut self, id: &str) -> Result<(), CefError> {
        let window = self
            .windows
            .get_mut(id)
            .ok_or_else(|| CefError::not_found(format!("window '{id}' not found")))?;
        window.back();
        Ok(())
    }

    pub fn reload_window(&mut self, id: &str) -> Result<(), CefError> {
        let window = self
            .windows
            .get_mut(id)
            .ok_or_else(|| CefError::not_found(format!("window '{id}' not found")))?;
        window.reload();
        Ok(())
    }

    pub fn set_devtools(&mut self, id: &str, open: bool) -> Result<(), CefError> {
        let mut window = self
            .windows
            .remove(id)
            .ok_or_else(|| CefError::not_found(format!("window '{id}' not found")))?;
        let result = {
            let cdp_server = self
                .cdp_server
                .as_mut()
                .ok_or_else(|| CefError::invalid_state("CDP server is not running"))?;
            if open {
                window.devtools_open(cdp_server)
            } else {
                window.devtools_close(cdp_server)
            }
        };
        self.windows.insert(id.to_string(), window);
        result
    }

    pub fn capture_screenshot(&mut self, id: &str) -> Result<Vec<u8>, CefError> {
        let window = self
            .windows
            .remove(id)
            .ok_or_else(|| CefError::not_found(format!("window '{id}' not found")))?;
        let screenshot = {
            let cdp_server = self
                .cdp_server
                .as_mut()
                .ok_or_else(|| CefError::invalid_state("CDP server is not running"))?;
            window.screenshot(cdp_server)
        };
        self.windows.insert(id.to_string(), window);
        screenshot
    }

    pub fn record_console_message(
        &mut self,
        id: &str,
        message: ConsoleMessage,
    ) -> Result<(), CefError> {
        {
            let cdp_server = self
                .cdp_server
                .as_mut()
                .ok_or_else(|| CefError::invalid_state("CDP server is not running"))?;
            cdp_server.on_console_message(id, message);
        }

        let window = self
            .windows
            .get_mut(id)
            .ok_or_else(|| CefError::not_found(format!("window '{id}' not found")))?;

        let cdp_server = self
            .cdp_server
            .as_ref()
            .ok_or_else(|| CefError::invalid_state("CDP server is not running"))?;
        window.sync_console_from_cdp(cdp_server);
        Ok(())
    }

    pub fn console_messages(&self, id: &str) -> Result<Vec<ConsoleMessage>, CefError> {
        let window = self
            .windows
            .get(id)
            .ok_or_else(|| CefError::not_found(format!("window '{id}' not found")))?;
        Ok(window.console_messages().to_vec())
    }

    pub fn clear_console_messages(&mut self, id: &str) -> Result<(), CefError> {
        let window = self
            .windows
            .get_mut(id)
            .ok_or_else(|| CefError::not_found(format!("window '{id}' not found")))?;
        window.clear_console();
        Ok(())
    }

    pub fn stop_window(&mut self, id: &str) -> Result<(), CefError> {
        let window = self
            .windows
            .get_mut(id)
            .ok_or_else(|| CefError::not_found(format!("window '{id}' not found")))?;
        window.stop();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::CefRuntime;
    use crate::cef::download::CefDownloader;
    use crate::cef::types::{CefError, WindowConfig};

    #[tokio::test]
    async fn a015_runtime_ensure_ready_requires_preinstalled_cef() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        let mut runtime = CefRuntime::new(temp.path());
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());

        let error = runtime
            .ensure_ready(&downloader)
            .await
            .expect_err("missing install should fail");

        assert!(matches!(error, CefError::InvalidState(_)));
        assert!(!runtime.is_ready());
    }

    #[tokio::test]
    async fn a015_runtime_ensure_ready_with_cached_cef_starts_cdp_server_once() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(install_dir.join("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64"))
            .expect("create install marker");

        let mut runtime = CefRuntime::new(temp.path());
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());

        runtime.ensure_ready(&downloader).await.expect("ready");
        let first_port = runtime.cdp_server().expect("cdp server").port();
        runtime.ensure_ready(&downloader).await.expect("second ensure");

        assert!(runtime.is_ready());
        assert_eq!(runtime.cdp_server().expect("cdp server").port(), first_port);
    }

    #[tokio::test]
    async fn a015_runtime_create_window_attaches_cdp_session() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(install_dir.join("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64"))
            .expect("create install marker");

        let mut runtime = CefRuntime::new(temp.path());
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        runtime.ensure_ready(&downloader).await.expect("ready");

        let window = runtime
            .create_window("miniapp-1", "http://127.0.0.1:3000", WindowConfig::default())
            .expect("create window");

        assert!(window.cdp_port().is_some());
        assert!(runtime
            .cdp_server()
            .expect("cdp server")
            .has_session("miniapp-1"));
    }

    #[tokio::test]
    async fn a015_runtime_create_window_rejects_duplicate_ids() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(install_dir.join("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64"))
            .expect("create install marker");

        let mut runtime = CefRuntime::new(temp.path());
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        runtime.ensure_ready(&downloader).await.expect("ready");
        runtime
            .create_window("miniapp-1", "http://127.0.0.1:3000", WindowConfig::default())
            .expect("first window");

        let error = runtime
            .create_window("miniapp-1", "http://127.0.0.1:4000", WindowConfig::default())
            .expect_err("duplicate id should fail");

        assert!(matches!(error, CefError::AlreadyExists(_)));
    }

    #[tokio::test]
    async fn a015_runtime_shutdown_closes_windows_and_clears_state() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(install_dir.join("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64"))
            .expect("create install marker");

        let mut runtime = CefRuntime::new(temp.path());
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        runtime.ensure_ready(&downloader).await.expect("ready");
        runtime
            .create_window("miniapp-1", "http://127.0.0.1:3000", WindowConfig::default())
            .expect("window");

        runtime.shutdown();

        assert!(!runtime.is_ready());
        assert!(runtime.window("miniapp-1").is_none());
        assert!(runtime.cdp_server().is_none());
    }

    #[tokio::test]
    async fn a015_runtime_navigate_back_and_reload_update_window_state() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(install_dir.join("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64"))
            .expect("create install marker");

        let mut runtime = CefRuntime::new(temp.path());
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        runtime.ensure_ready(&downloader).await.expect("ready");
        runtime
            .create_window("miniapp-1", "http://127.0.0.1:3000", WindowConfig::default())
            .expect("window");

        runtime
            .navigate_window("miniapp-1", "http://127.0.0.1:4000")
            .expect("navigate");
        runtime.go_back("miniapp-1").expect("back");
        runtime.reload_window("miniapp-1").expect("reload");

        let window = runtime.window("miniapp-1").expect("window exists");
        assert_eq!(window.current_url(), "http://127.0.0.1:3000");
        assert!(window.is_loading());
    }

    #[tokio::test]
    async fn a015_runtime_devtools_and_screenshot_route_through_cdp() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(install_dir.join("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64"))
            .expect("create install marker");

        let mut runtime = CefRuntime::new(temp.path());
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        runtime.ensure_ready(&downloader).await.expect("ready");
        runtime
            .create_window("miniapp-1", "http://127.0.0.1:3000", WindowConfig::default())
            .expect("window");

        runtime
            .set_devtools("miniapp-1", true)
            .expect("open devtools");
        let screenshot = runtime
            .capture_screenshot("miniapp-1")
            .expect("screenshot bytes");
        runtime
            .set_devtools("miniapp-1", false)
            .expect("close devtools");

        let window = runtime.window("miniapp-1").expect("window exists");
        assert!(!window.is_devtools_open());
        assert!(screenshot.starts_with(&[0x89, b'P', b'N', b'G']));
    }

    #[tokio::test]
    async fn a015_runtime_console_messages_are_exposed_per_window() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(install_dir.join("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64"))
            .expect("create install marker");

        let mut runtime = CefRuntime::new(temp.path());
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        runtime.ensure_ready(&downloader).await.expect("ready");
        runtime
            .create_window("miniapp-1", "http://127.0.0.1:3000", WindowConfig::default())
            .expect("window");

        runtime
            .record_console_message(
                "miniapp-1",
                crate::cef::types::ConsoleMessage {
                    level: "warn".to_string(),
                    message: "slow render".to_string(),
                    source: Some("miniapp.js".to_string()),
                    line: Some(8),
                },
            )
            .expect("record console");

        let messages = runtime
            .console_messages("miniapp-1")
            .expect("console messages");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].message, "slow render");

        runtime
            .clear_console_messages("miniapp-1")
            .expect("clear console");
        let cleared = runtime
            .console_messages("miniapp-1")
            .expect("console messages after clear");
        assert!(cleared.is_empty());
    }

    #[tokio::test]
    async fn a015_runtime_stop_window_clears_loading_state() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("cef");
        std::fs::create_dir_all(install_dir.join("cef_binary_146.0.10+g1234567+chromium-146.0.7423.3_macosarm64"))
            .expect("create install marker");

        let mut runtime = CefRuntime::new(temp.path());
        let downloader = CefDownloader::new(install_dir, "macos-arm64".to_string());
        runtime.ensure_ready(&downloader).await.expect("ready");
        runtime
            .create_window("miniapp-1", "http://127.0.0.1:3000", WindowConfig::default())
            .expect("window");
        runtime
            .navigate_window("miniapp-1", "http://127.0.0.1:4000")
            .expect("navigate");

        runtime.stop_window("miniapp-1").expect("stop");

        let window = runtime.window("miniapp-1").expect("window exists");
        assert!(!window.is_loading());
    }
}
