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
    #[serde(default = "default_litellm_host")]
    pub litellm_host: String,
    #[serde(
        default = "default_litellm_port",
        deserialize_with = "deserialize_string_or_number_litellm"
    )]
    pub litellm_port: String,
    #[serde(default)]
    pub agentscope_working_dir: String,
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

fn default_litellm_host() -> String {
    "127.0.0.1".to_string()
}

fn default_litellm_port() -> String {
    "4000".to_string()
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

fn deserialize_string_or_number_litellm<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::String(value) => Ok(value),
        serde_json::Value::Number(value) => Ok(value.to_string()),
        _ => Ok(default_litellm_port()),
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
            litellm_host: default_litellm_host(),
            litellm_port: default_litellm_port(),
            agentscope_working_dir: String::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Settings;

    // --- Default values ---

    #[test]
    fn a014_settings_schema_default_model_is_gpt4o() {
        let s = Settings::default();
        assert_eq!(s.model, "gpt-4o");
    }

    #[test]
    fn a014_settings_schema_default_api_url_is_openai() {
        let s = Settings::default();
        assert_eq!(s.api_url, "https://api.openai.com/v1");
    }

    #[test]
    fn a014_settings_schema_default_theme_is_system() {
        let s = Settings::default();
        assert_eq!(s.theme, "system");
    }

    #[test]
    fn a014_settings_schema_default_open_last_project_is_true() {
        let s = Settings::default();
        assert!(s.open_last_project);
    }

    #[test]
    fn a014_settings_schema_default_language_is_en() {
        let s = Settings::default();
        assert_eq!(s.language, "en");
    }

    #[test]
    fn a014_settings_schema_default_font_family_is_inter() {
        let s = Settings::default();
        assert_eq!(s.font_family, "Inter");
    }

    #[test]
    fn a014_settings_schema_default_font_size_is_13() {
        let s = Settings::default();
        assert_eq!(s.font_size, "13");
    }

    #[test]
    fn a014_settings_schema_default_fps_counter_is_true() {
        let s = Settings::default();
        assert!(s.fps_counter);
    }

    #[test]
    fn a014_settings_schema_default_log_level_is_info() {
        let s = Settings::default();
        assert_eq!(s.log_level, "info");
    }

    #[test]
    fn a014_settings_schema_default_preset_is_auto() {
        let s = Settings::default();
        assert_eq!(s.preset, "auto");
    }

    #[test]
    fn a014_settings_schema_default_agentscope_host_is_loopback() {
        let s = Settings::default();
        assert_eq!(s.agentscope_host, "127.0.0.1");
    }

    #[test]
    fn a014_settings_schema_default_agentscope_port_is_8090() {
        let s = Settings::default();
        assert_eq!(s.agentscope_port, "8090");
    }

    #[test]
    fn a014_settings_schema_default_litellm_host_is_loopback() {
        let s = Settings::default();
        assert_eq!(s.litellm_host, "127.0.0.1");
    }

    #[test]
    fn a014_settings_schema_default_litellm_port_is_4000() {
        let s = Settings::default();
        assert_eq!(s.litellm_port, "4000");
    }

    #[test]
    fn a014_settings_schema_default_api_key_is_empty() {
        let s = Settings::default();
        assert!(s.api_key.is_empty());
    }

    #[test]
    fn a014_settings_schema_default_agentscope_working_dir_is_empty() {
        let s = Settings::default();
        assert!(s.agentscope_working_dir.is_empty());
    }

    // --- Deserialization: string port values ---

    #[test]
    fn a014_settings_schema_agentscope_port_deserializes_string() {
        let json = r#"{"agentscopePort": "9090"}"#;
        let s: Settings = serde_json::from_str(json).expect("deserialize string port");
        assert_eq!(s.agentscope_port, "9090");
    }

    #[test]
    fn a014_settings_schema_litellm_port_deserializes_string() {
        let json = r#"{"litellmPort": "5000"}"#;
        let s: Settings = serde_json::from_str(json).expect("deserialize litellm string port");
        assert_eq!(s.litellm_port, "5000");
    }

    // --- Deserialization: numeric port values ---

    #[test]
    fn a014_settings_schema_agentscope_port_deserializes_number() {
        let json = r#"{"agentscopePort": 8091}"#;
        let s: Settings = serde_json::from_str(json).expect("deserialize numeric port");
        assert_eq!(s.agentscope_port, "8091");
    }

    #[test]
    fn a014_settings_schema_litellm_port_deserializes_number() {
        let json = r#"{"litellmPort": 4001}"#;
        let s: Settings = serde_json::from_str(json).expect("deserialize litellm numeric port");
        assert_eq!(s.litellm_port, "4001");
    }

    // --- Deserialization: null/invalid port falls back to defaults ---

    #[test]
    fn a014_settings_schema_agentscope_port_falls_back_on_null() {
        let json = r#"{"agentscopePort": null}"#;
        let s: Settings = serde_json::from_str(json).expect("deserialize null port");
        assert_eq!(s.agentscope_port, "8090");
    }

    #[test]
    fn a014_settings_schema_litellm_port_falls_back_on_null() {
        let json = r#"{"litellmPort": null}"#;
        let s: Settings = serde_json::from_str(json).expect("deserialize null litellm port");
        assert_eq!(s.litellm_port, "4000");
    }

    // --- Deserialization: snake_case aliases ---

    #[test]
    fn a014_settings_schema_api_key_alias_snake_case_deserializes() {
        let json = r#"{"api_key": "sk-abc123"}"#;
        let s: Settings = serde_json::from_str(json).expect("deserialize api_key alias");
        assert_eq!(s.api_key, "sk-abc123");
    }

    // --- Missing fields fall back to defaults ---

    #[test]
    fn a014_settings_schema_empty_json_uses_all_defaults() {
        let s: Settings = serde_json::from_str("{}").expect("deserialize empty object");
        assert_eq!(s, Settings::default());
    }

    // --- Round-trip ---

    #[test]
    fn a014_settings_schema_round_trip_preserves_all_fields() {
        let mut original = Settings::default();
        original.api_key = "sk-test".to_string();
        original.model = "gpt-4-turbo".to_string();
        original.theme = "dark".to_string();
        original.agentscope_port = "9001".to_string();
        original.litellm_port = "5001".to_string();
        original.agentscope_working_dir = "/tmp/work".to_string();

        let json = serde_json::to_string(&original).expect("serialize");
        let restored: Settings = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(restored, original);
    }

    // --- PartialEq ---

    #[test]
    fn a014_settings_schema_two_defaults_are_equal() {
        assert_eq!(Settings::default(), Settings::default());
    }

    #[test]
    fn a014_settings_schema_modified_settings_not_equal_to_default() {
        let mut s = Settings::default();
        s.theme = "dark".to_string();
        assert_ne!(s, Settings::default());
    }
}
