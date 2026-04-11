use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::cef::types::{CefError, ConsoleMessage};

#[derive(Clone, Debug)]
pub struct CdpSession {
    pub window_id: String,
}

pub struct CdpServer {
    port: u16,
    sessions: HashMap<String, CdpSession>,
    console: HashMap<String, Vec<ConsoleMessage>>,
    last_methods: HashMap<String, String>,
}

impl CdpServer {
    pub fn new(port: u16) -> Self {
        Self {
            port,
            sessions: HashMap::new(),
            console: HashMap::new(),
            last_methods: HashMap::new(),
        }
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn attach(&mut self, window_id: &str) {
        self.sessions.insert(
            window_id.to_string(),
            CdpSession {
                window_id: window_id.to_string(),
            },
        );
    }

    pub fn detach(&mut self, window_id: &str) {
        self.sessions.remove(window_id);
        self.console.remove(window_id);
        self.last_methods.remove(window_id);
    }

    pub fn has_session(&self, window_id: &str) -> bool {
        self.sessions.contains_key(window_id)
    }

    pub fn route(
        &mut self,
        window_id: &str,
        method: &str,
        _params: Value,
    ) -> Result<Value, CefError> {
        if !self.sessions.contains_key(window_id) {
            return Err(CefError::not_found(format!(
                "cdp session missing for '{window_id}'"
            )));
        }

        self.last_methods
            .insert(window_id.to_string(), method.to_string());

        if method == "Page.captureScreenshot" {
            let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
            let data = base64::engine::general_purpose::STANDARD.encode(png);
            return Ok(json!({"windowId": window_id, "method": method, "data": data}));
        }

        Ok(json!({"windowId": window_id, "method": method}))
    }

    pub fn on_console_message(&mut self, window_id: &str, message: ConsoleMessage) {
        self.console
            .entry(window_id.to_string())
            .or_default()
            .push(message);
    }

    pub fn console_messages(&self, window_id: &str) -> &[ConsoleMessage] {
        self.console
            .get(window_id)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub fn last_method(&self, window_id: &str) -> Option<&str> {
        self.last_methods.get(window_id).map(String::as_str)
    }
}

#[cfg(test)]
mod tests {
    use base64::Engine;

    use super::CdpServer;
    use crate::cef::types::{CefError, ConsoleMessage};

    #[test]
    fn a015_cdp_route_rejects_unknown_window_session() {
        let mut cdp = CdpServer::new(9222);

        let err = cdp
            .route("missing", "Page.reload", serde_json::json!({}))
            .expect_err("missing session should fail");

        assert!(matches!(err, CefError::NotFound(_)));
    }

    #[test]
    fn a015_cdp_capture_screenshot_returns_base64_png_data() {
        let mut cdp = CdpServer::new(9222);
        cdp.attach("miniapp-1");

        let response = cdp
            .route("miniapp-1", "Page.captureScreenshot", serde_json::json!({}))
            .expect("capture screenshot route should succeed");

        let data = response
            .get("data")
            .and_then(|value| value.as_str())
            .expect("response should include screenshot data");
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(data)
            .expect("screenshot data should decode");

        assert!(decoded.starts_with(&[0x89, b'P', b'N', b'G']));
    }

    #[test]
    fn a015_cdp_console_messages_are_stored_per_window() {
        let mut cdp = CdpServer::new(9222);
        cdp.on_console_message(
            "miniapp-1",
            ConsoleMessage {
                level: "log".to_string(),
                message: "ready".to_string(),
                source: Some("main.js".to_string()),
                line: Some(10),
            },
        );

        assert_eq!(cdp.console_messages("miniapp-1").len(), 1);
        assert_eq!(cdp.console_messages("miniapp-1")[0].message, "ready");
        assert!(cdp.console_messages("miniapp-2").is_empty());
    }
}
