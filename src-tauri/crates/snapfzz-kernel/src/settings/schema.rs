use serde::{Deserialize, Serialize};

const AGENTSCOPE_PORT: u16 = 8090;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(alias = "api_key", default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(alias = "api_url", default = "default_api_url")]
    pub api_url: String,

    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_true")]
    pub open_last_project: bool,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_font_size")]
    pub font_size: String,

    #[serde(default = "default_true")]
    pub fps_counter: bool,
    #[serde(default = "default_log_level")]
    pub log_level: String,

    #[serde(default = "default_preset")]
    pub preset: String,
    #[serde(default = "default_agentscope_host")]
    pub agentscope_host: String,
    #[serde(
        default = "default_agentscope_port",
        deserialize_with = "deserialize_string_or_number"
    )]
    pub agentscope_port: String,
}

fn default_model() -> String {
    "gpt-4o".to_string()
}

fn default_api_url() -> String {
    "https://api.openai.com/v1".to_string()
}

fn default_theme() -> String {
    "system".to_string()
}

fn default_true() -> bool {
    true
}

fn default_font_family() -> String {
    "Inter".to_string()
}

fn default_font_size() -> String {
    "13".to_string()
}

fn default_language() -> String {
    "en".to_string()
}

fn default_log_level() -> String {
    "info".to_string()
}

fn default_preset() -> String {
    "auto".to_string()
}

fn default_agentscope_host() -> String {
    "127.0.0.1".to_string()
}

fn default_agentscope_port() -> String {
    AGENTSCOPE_PORT.to_string()
}

fn deserialize_string_or_number<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::String(value) => Ok(value),
        serde_json::Value::Number(value) => Ok(value.to_string()),
        _ => Ok(default_agentscope_port()),
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: default_model(),
            api_url: default_api_url(),
            theme: default_theme(),
            open_last_project: default_true(),
            language: default_language(),
            font_family: default_font_family(),
            font_size: default_font_size(),
            fps_counter: default_true(),
            log_level: default_log_level(),
            preset: default_preset(),
            agentscope_host: default_agentscope_host(),
            agentscope_port: default_agentscope_port(),
        }
    }
}
