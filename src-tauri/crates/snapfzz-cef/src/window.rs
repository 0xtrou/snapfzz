use base64::Engine;
use serde_json::json;

use crate::cdp::CdpServer;
use crate::types::{CefError, ConsoleMessage, WindowConfig};

#[derive(Debug)]
pub struct CefWindow {
    id: String,
    history: Vec<String>,
    history_index: usize,
    loading: bool,
    devtools_open: bool,
    console_messages: Vec<ConsoleMessage>,
    _config: WindowConfig,
    closed: bool,
    cdp_port: Option<u16>,
}

impl CefWindow {
    pub fn new(id: String, url: String, config: WindowConfig) -> Self {
        Self {
            id,
            history: vec![url],
            history_index: 0,
            loading: false,
            devtools_open: false,
            console_messages: Vec::new(),
            _config: config,
            closed: false,
            cdp_port: None,
        }
    }

    pub fn navigate(&mut self, url: &str) {
        if self.history_index + 1 < self.history.len() {
            self.history.truncate(self.history_index + 1);
        }
        self.history.push(url.to_string());
        self.history_index = self.history.len().saturating_sub(1);
        self.loading = true;
    }

    pub fn back(&mut self) {
        if self.can_go_back() {
            self.history_index = self.history_index.saturating_sub(1);
            self.loading = true;
        }
    }

    pub fn forward(&mut self) {
        if self.can_go_forward() {
            self.history_index += 1;
            self.loading = true;
        }
    }

    pub fn reload(&mut self) {
        self.loading = true;
    }

    pub fn stop(&mut self) {
        self.loading = false;
    }

    pub fn is_loading(&self) -> bool {
        self.loading
    }

    pub fn can_go_back(&self) -> bool {
        self.history_index > 0
    }

    pub fn can_go_forward(&self) -> bool {
        self.history_index + 1 < self.history.len()
    }

    pub fn current_url(&self) -> &str {
        &self.history[self.history_index]
    }

    pub fn devtools_open(&mut self, cdp: &mut CdpServer) -> Result<(), CefError> {
        cdp.route(&self.id, "DevTools.open", json!({}))?;
        self.devtools_open = true;
        Ok(())
    }

    pub fn devtools_close(&mut self, cdp: &mut CdpServer) -> Result<(), CefError> {
        cdp.route(&self.id, "DevTools.close", json!({}))?;
        self.devtools_open = false;
        Ok(())
    }

    pub fn is_devtools_open(&self) -> bool {
        self.devtools_open
    }

    pub fn console_messages(&self) -> &[ConsoleMessage] {
        &self.console_messages
    }

    pub fn clear_console(&mut self) {
        self.console_messages.clear();
    }

    pub fn sync_console_from_cdp(&mut self, cdp: &CdpServer) {
        self.console_messages = cdp.console_messages(&self.id).to_vec();
    }

    pub fn screenshot(&self, cdp: &mut CdpServer) -> Result<Vec<u8>, CefError> {
        let response = cdp.route(&self.id, "Page.captureScreenshot", json!({"format": "png"}))?;
        let data = response
            .get("data")
            .and_then(|value| value.as_str())
            .ok_or_else(|| CefError::internal("cdp screenshot response missing data"))?;

        base64::engine::general_purpose::STANDARD
            .decode(data)
            .map_err(|error| CefError::internal(&format!("invalid screenshot data: {error}")))
    }

    pub fn close(&mut self) {
        self.closed = true;
    }

    pub fn is_closed(&self) -> bool {
        self.closed
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn attach_cdp_port(&mut self, port: u16) {
        self.cdp_port = Some(port);
    }

    pub fn cdp_port(&self) -> Option<u16> {
        self.cdp_port
    }

    pub fn push_console_message(&mut self, message: ConsoleMessage) {
        self.console_messages.push(message);
    }
}

#[cfg(test)]
mod tests {
    use crate::cdp::CdpServer;
    use crate::types::{ConsoleMessage, WindowConfig};

    use super::CefWindow;

    #[test]
    fn a015_window_navigate_updates_current_url() {
        let mut window = CefWindow::new(
            "window-1".to_string(),
            "http://localhost:3000".to_string(),
            WindowConfig::default(),
        );

        window.navigate("http://localhost:3001/next");

        assert_eq!(window.current_url(), "http://localhost:3001/next");
        assert!(window.can_go_back());
    }

    #[test]
    fn a015_window_back_and_forward_toggle_navigation_flags() {
        let mut window = CefWindow::new(
            "window-1".to_string(),
            "http://localhost:3000".to_string(),
            WindowConfig::default(),
        );

        window.navigate("http://localhost:3000/page2");
        window.navigate("http://localhost:3000/page3");
        window.back();

        assert_eq!(window.current_url(), "http://localhost:3000/page2");
        assert!(window.can_go_forward());

        window.forward();

        assert_eq!(window.current_url(), "http://localhost:3000/page3");
        assert!(!window.can_go_forward());
    }

    #[test]
    fn a015_window_devtools_open_and_close_updates_state() {
        let mut window = CefWindow::new(
            "window-1".to_string(),
            "http://localhost:3000".to_string(),
            WindowConfig::default(),
        );
        let mut cdp = CdpServer::new(9222);
        cdp.attach("window-1");

        window.devtools_open(&mut cdp).expect("open devtools");
        assert!(window.is_devtools_open());
        assert_eq!(cdp.last_method("window-1"), Some("DevTools.open"));

        window.devtools_close(&mut cdp).expect("close devtools");
        assert!(!window.is_devtools_open());
        assert_eq!(cdp.last_method("window-1"), Some("DevTools.close"));
    }

    #[test]
    fn a015_window_console_capture_and_clear_behaves_consistently() {
        let mut window = CefWindow::new(
            "window-1".to_string(),
            "http://localhost:3000".to_string(),
            WindowConfig::default(),
        );
        let mut cdp = CdpServer::new(9222);
        cdp.attach("window-1");
        cdp.on_console_message(
            "window-1",
            ConsoleMessage {
                level: "log".to_string(),
                message: "boot complete".to_string(),
                source: Some("miniapp.js".to_string()),
                line: Some(12),
            },
        );

        window.sync_console_from_cdp(&cdp);

        assert_eq!(window.console_messages().len(), 1);
        assert_eq!(window.console_messages()[0].message, "boot complete");

        window.clear_console();
        assert!(window.console_messages().is_empty());
    }

    #[test]
    fn a015_window_screenshot_returns_png_header_bytes() {
        let window = CefWindow::new(
            "window-1".to_string(),
            "http://localhost:3000".to_string(),
            WindowConfig::default(),
        );
        let mut cdp = CdpServer::new(9222);
        cdp.attach("window-1");

        let screenshot = window.screenshot(&mut cdp).expect("screenshot bytes");

        assert!(screenshot.starts_with(&[0x89, b'P', b'N', b'G']));
    }

    #[test]
    fn a015_window_close_marks_window_as_closed() {
        let mut window = CefWindow::new(
            "window-1".to_string(),
            "http://localhost:3000".to_string(),
            WindowConfig::default(),
        );

        window.close();

        assert!(window.is_closed());
    }
}
