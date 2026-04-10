use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GatewayConfig {
    pub model_list: Vec<ModelDeployment>,
    pub router_settings: RouterSettings,
    pub litellm_settings: LiteLLMSettings,
    pub general_settings: GeneralSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelDeployment {
    pub model_name: String,
    pub litellm_params: LiteLLMParams,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LiteLLMParams {
    pub model: String,
    pub api_key: String,
    pub api_base: Option<String>,
    pub rpm: Option<u32>,
    pub tpm: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RouterSettings {
    pub routing_strategy: String,
    pub model_group_alias: HashMap<String, String>,
    #[serde(default)]
    pub fallbacks: Vec<FallbackRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FallbackRule {
    pub model: String,
    pub fallbacks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GeneralSettings {
    pub master_key: String,
    pub database_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LiteLLMSettings {
    pub json_logs: bool,
    pub turn_off_message_logging: bool,
    pub default_key_generate_params: DefaultKeyGenerateParams,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DefaultKeyGenerateParams {
    pub max_budget: f64,
    pub budget_duration: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyGenerateParams {
    pub models: Vec<String>,
    pub max_budget: f64,
    pub budget_duration: String,
    pub metadata: HashMap<String, String>,
    pub rpm_limit: Option<u32>,
    pub tpm_limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyUpdateParams {
    pub models: Option<Vec<String>>,
    pub max_budget: Option<f64>,
    pub budget_duration: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
    pub rpm_limit: Option<u32>,
    pub tpm_limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GeneratedKey {
    pub key: String,
    pub key_alias: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyInfo {
    pub key: String,
    pub models: Vec<String>,
    pub spend: Option<f64>,
    pub max_budget: Option<f64>,
    pub budget_duration: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyListResponse {
    #[serde(default)]
    pub keys: Vec<KeyInfo>,
    pub total_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct SpendFilters {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub key: Option<String>,
    pub model: Option<String>,
    pub user: Option<String>,
    pub page: Option<u32>,
    pub size: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpendLog {
    pub request_id: String,
    pub api_key: String,
    pub model: String,
    pub spend: f64,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeySpend {
    pub key: String,
    pub spend: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GlobalSpend {
    pub total_spend: f64,
    pub by_provider: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelInfo {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelListResponse {
    #[serde(default)]
    pub data: Vec<ModelInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProviderConfig {
    pub provider_id: String,
    pub key_name: String,
    pub model_name: String,
    pub provider_model: String,
    pub api_base: Option<String>,
    pub rpm: Option<u32>,
    pub tpm: Option<u32>,
    pub enabled: bool,
}

#[derive(Debug, Error)]
pub enum LlmError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("yaml error: {0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("http client error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("vault error: {0}")]
    Vault(String),
    #[error("http status {status}: {body}")]
    HttpStatus { status: u16, body: String },
    #[error("{0}")]
    Message(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a013_types_gateway_config_round_trip_yaml_serialization() {
        let config = GatewayConfig {
            model_list: vec![ModelDeployment {
                model_name: "gpt-4o".to_string(),
                litellm_params: LiteLLMParams {
                    model: "openai/gpt-4o".to_string(),
                    api_key: "os.environ/OPENAI_KEY_1".to_string(),
                    api_base: None,
                    rpm: Some(100),
                    tpm: Some(1_000),
                },
            }],
            router_settings: RouterSettings {
                routing_strategy: "simple-shuffle".to_string(),
                model_group_alias: HashMap::from([("fast".to_string(), "gpt-4o".to_string())]),
                fallbacks: vec![FallbackRule {
                    model: "fast".to_string(),
                    fallbacks: vec!["smart".to_string()],
                }],
            },
            litellm_settings: LiteLLMSettings {
                json_logs: true,
                turn_off_message_logging: false,
                default_key_generate_params: DefaultKeyGenerateParams {
                    max_budget: 0.0,
                    budget_duration: "30d".to_string(),
                },
            },
            general_settings: GeneralSettings {
                master_key: "os.environ/LITELLM_MASTER_KEY".to_string(),
                database_url: None,
            },
        };

        let yaml = serde_yaml::to_string(&config).expect("serialize yaml");
        let decoded: GatewayConfig = serde_yaml::from_str(&yaml).expect("deserialize yaml");

        assert_eq!(decoded, config);
    }

    #[test]
    fn a013_types_key_generate_params_round_trip_json_serialization() {
        let params = KeyGenerateParams {
            models: vec!["gpt-4o".to_string()],
            max_budget: 25.0,
            budget_duration: "30d".to_string(),
            metadata: HashMap::from([("env".to_string(), "dev".to_string())]),
            rpm_limit: Some(200),
            tpm_limit: Some(8_000),
        };

        let json = serde_json::to_string(&params).expect("serialize json");
        let decoded: KeyGenerateParams = serde_json::from_str(&json).expect("deserialize json");

        assert_eq!(decoded, params);
    }

    #[test]
    fn a013_types_spend_filters_defaults_to_empty() {
        let filters = SpendFilters::default();
        assert_eq!(filters.start_date, None);
        assert_eq!(filters.end_date, None);
        assert_eq!(filters.key, None);
        assert_eq!(filters.model, None);
    }
}
