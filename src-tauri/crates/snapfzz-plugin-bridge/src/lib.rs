// A005/PluginArchitecture: Bridge between plugins and kernel.
// Beta scope — validates payloads, checks capabilities, tags budget, enforces rate limits.
// Alpha: main.rs handles this manually for the chat plugin.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInvoke {
    pub plugin_id: String,
    pub command: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginCapability {
    pub invoke_commands: Vec<String>,
    pub max_concurrent: usize,
    pub allowed_events: Vec<String>,
}

#[derive(Debug)]
pub enum BridgeError {
    Unauthorized(String),
    SchemaViolation(String),
    BudgetExhausted(String),
    RateLimited(String),
}

impl std::fmt::Display for BridgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BridgeError::Unauthorized(msg) => write!(f, "unauthorized: {msg}"),
            BridgeError::SchemaViolation(msg) => write!(f, "schema violation: {msg}"),
            BridgeError::BudgetExhausted(msg) => write!(f, "budget exhausted: {msg}"),
            BridgeError::RateLimited(msg) => write!(f, "rate limited: {msg}"),
        }
    }
}

impl std::error::Error for BridgeError {}
