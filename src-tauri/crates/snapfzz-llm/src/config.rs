use crate::types::{GatewayConfig, LlmError};
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub fn generate_config(
    config: &GatewayConfig,
    vault_keys: &[String],
    data_dir: &Path,
) -> Result<String, LlmError> {
    if !config
        .general_settings
        .master_key
        .starts_with("os.environ/")
    {
        return Err(LlmError::Message(
            "master_key must use os.environ/ reference".to_string(),
        ));
    }

    for deployment in &config.model_list {
        if !deployment.litellm_params.api_key.starts_with("os.environ/") {
            return Err(LlmError::Message(format!(
                "api_key for model '{}' must use os.environ/ reference",
                deployment.model_name
            )));
        }
    }

    for key in vault_keys {
        if key.trim().is_empty() {
            return Err(LlmError::Message(
                "vault key names cannot be empty".to_string(),
            ));
        }
    }

    let mut config = config.clone();
    if config.general_settings.database_url.is_none() {
        let db_path = data_dir.join("gateway").join("litellm.db");
        config.general_settings.database_url = Some(format!("sqlite:///{}", db_path.display()));
    }

    Ok(serde_yaml::to_string(&config)?)
}

pub fn write_config_atomically(path: &Path, yaml: &str) -> Result<(), LlmError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let tmp_path = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    std::fs::write(&tmp_path, yaml)?;

    if let Err(error) = std::fs::rename(&tmp_path, path) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(LlmError::Io(error));
    }

    Ok(())
}

pub fn config_path(data_dir: &Path) -> PathBuf {
    data_dir.join("gateway").join("config.yaml")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{
        DefaultKeyGenerateParams, FallbackRule, GeneralSettings, LiteLLMParams, LiteLLMSettings,
        LlmError, ModelDeployment, RouterSettings,
    };
    use std::collections::HashMap;
    use std::path::PathBuf;

    fn sample_config() -> GatewayConfig {
        GatewayConfig {
            model_list: vec![
                ModelDeployment {
                    model_name: "gpt-4o".to_string(),
                    litellm_params: LiteLLMParams {
                        model: "openai/gpt-4o".to_string(),
                        api_key: "os.environ/PROVIDER_OPENAI_KEY_1".to_string(),
                        api_base: None,
                        rpm: Some(100),
                        tpm: Some(1000),
                    },
                },
                ModelDeployment {
                    model_name: "claude-sonnet".to_string(),
                    litellm_params: LiteLLMParams {
                        model: "anthropic/claude-sonnet-4-20250514".to_string(),
                        api_key: "os.environ/PROVIDER_ANTHROPIC_KEY_1".to_string(),
                        api_base: None,
                        rpm: None,
                        tpm: None,
                    },
                },
            ],
            router_settings: RouterSettings {
                routing_strategy: "simple-shuffle".to_string(),
                model_group_alias: HashMap::from([
                    ("fast".to_string(), "gpt-4o".to_string()),
                    ("smart".to_string(), "claude-sonnet".to_string()),
                ]),
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
        }
    }

    #[test]
    fn a013_config_generate_config_produces_valid_yaml() {
        // A013/Config: generate_config produces valid YAML
        let temp = tempfile::tempdir().expect("tempdir");
        let config = sample_config();
        let yaml =
            generate_config(&config, &["key_1".to_string()], temp.path()).expect("generate yaml");

        let parsed: GatewayConfig = serde_yaml::from_str(&yaml).expect("parse yaml");
        assert_eq!(parsed.model_list, config.model_list);
        assert!(parsed.general_settings.database_url.is_some());
    }

    #[test]
    fn a013_config_model_list_includes_all_enabled_providers() {
        // A013/Config: model_list includes all enabled providers
        let temp = tempfile::tempdir().expect("tempdir");
        let config = sample_config();

        let yaml = generate_config(
            &config,
            &["key_1".to_string(), "key_2".to_string()],
            temp.path(),
        )
        .expect("yaml");

        assert!(yaml.contains("model_name: gpt-4o"));
        assert!(yaml.contains("model_name: claude-sonnet"));
    }

    #[test]
    fn a013_config_router_settings_includes_strategy_and_aliases() {
        // A013/Config: router_settings includes strategy and aliases
        let temp = tempfile::tempdir().expect("tempdir");
        let config = sample_config();
        let yaml = generate_config(&config, &[], temp.path()).expect("yaml");

        assert!(yaml.contains("routing_strategy: simple-shuffle"));
        assert!(yaml.contains("fast: gpt-4o"));
        assert!(yaml.contains("smart: claude-sonnet"));
    }

    #[test]
    fn a013_config_master_key_uses_env_var_reference() {
        // A013/Config: master_key uses env var reference
        let temp = tempfile::tempdir().expect("tempdir");
        let mut config = sample_config();
        config.general_settings.master_key = "raw-secret-value".to_string();

        let result = generate_config(&config, &[], temp.path());

        assert!(
            matches!(result, Err(LlmError::Message(message)) if message.contains("os.environ/"))
        );
    }

    #[test]
    fn a013_config_database_url_defaults_to_sqlite() {
        // A013/Config: database_url defaults to sqlite in data_dir
        let temp = tempfile::tempdir().expect("tempdir");
        let config = sample_config();
        let yaml = generate_config(&config, &[], temp.path()).expect("yaml");

        assert!(yaml.contains("database_url: sqlite:///"));
    }

    #[test]
    fn a013_config_written_atomically() {
        // A013/Config: config written atomically
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("gateway").join("config.yaml");

        write_config_atomically(&path, "model_list: []\n").expect("first write");
        write_config_atomically(&path, "model_list:\n  - model_name: gpt-4o\n")
            .expect("second write");

        let content = std::fs::read_to_string(&path).expect("read file");
        assert_eq!(content, "model_list:\n  - model_name: gpt-4o\n");

        let parent = path.parent().expect("parent");
        let entries = std::fs::read_dir(parent).expect("read dir");
        for entry in entries {
            let file_name = entry.expect("entry").file_name();
            assert!(!file_name.to_string_lossy().contains(".tmp"));
        }
    }

    #[test]
    fn a013_config_path_uses_gateway_subdirectory() {
        let path = config_path(&PathBuf::from("/tmp/snapfzz"));
        assert_eq!(path, PathBuf::from("/tmp/snapfzz/gateway/config.yaml"));
    }
}
