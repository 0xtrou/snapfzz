use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub surface: Vec<HostSurface>,
    pub activation_events: Vec<String>,
    #[serde(default)]
    pub dependencies: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub required_capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum HostSurface {
    Launcher,
    Project,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusMessage {
    pub topic: String,
    pub payload: serde_json::Value,
    pub source_plugin: Option<String>,
}
