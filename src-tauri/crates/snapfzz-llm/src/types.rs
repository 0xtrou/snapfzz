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

#[derive(Debug, Error)]
pub enum LlmError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("yaml error: {0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("vault error: {0}")]
    Vault(String),
    #[error("{0}")]
    Message(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a013_types_llm_error_json_conversion_from_serde_json_error() {
        // A013/Types: LlmError::Json wraps serde_json::Error via From impl
        let json_err: Result<serde_json::Value, _> = serde_json::from_str("{bad json}");
        let err = json_err.unwrap_err();
        let llm_err: LlmError = err.into();
        assert!(matches!(llm_err, LlmError::Json(_)));
        assert!(!llm_err.to_string().is_empty());
    }

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

}
