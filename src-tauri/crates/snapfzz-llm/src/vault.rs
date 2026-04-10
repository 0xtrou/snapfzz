use crate::types::LlmError;
use snapfzz_vault::{SecretVault, VaultError};
use uuid::Uuid;

const MASTER_KEY_NAME: &str = "litellm:master_key";
const PROVIDER_PREFIX: &str = "litellm:provider";

pub fn store_provider_key(
    vault: &mut SecretVault,
    provider_id: &str,
    key_name: &str,
    key_value: &str,
) -> Result<(), LlmError> {
    vault
        .store(
            &provider_secret_name(provider_id, key_name),
            key_value.as_bytes(),
        )
        .map_err(vault_error)?;
    Ok(())
}

pub fn read_provider_key(
    vault: &mut SecretVault,
    provider_id: &str,
    key_name: &str,
) -> Result<String, LlmError> {
    let bytes = vault
        .read(&provider_secret_name(provider_id, key_name))
        .map_err(vault_error)?;
    String::from_utf8(bytes).map_err(|error| LlmError::Vault(error.to_string()))
}

pub fn delete_provider_key(
    vault: &mut SecretVault,
    provider_id: &str,
    key_name: &str,
) -> Result<(), LlmError> {
    vault
        .delete(&provider_secret_name(provider_id, key_name))
        .map_err(vault_error)?;
    Ok(())
}

pub fn list_provider_keys(
    vault: &mut SecretVault,
    provider_id: &str,
) -> Result<Vec<String>, LlmError> {
    let prefix = format!("{PROVIDER_PREFIX}:{provider_id}:");
    let mut keys: Vec<String> = vault
        .list()
        .map_err(vault_error)?
        .into_iter()
        .filter_map(|key| key.strip_prefix(&prefix).map(ToOwned::to_owned))
        .collect();
    keys.sort();
    Ok(keys)
}

pub fn get_or_create_master_key(vault: &mut SecretVault) -> Result<String, LlmError> {
    match vault.read(MASTER_KEY_NAME) {
        Ok(existing) => {
            String::from_utf8(existing).map_err(|error| LlmError::Vault(error.to_string()))
        }
        Err(VaultError::NotFound(_)) => {
            let generated = Uuid::new_v4().to_string();
            vault
                .store(MASTER_KEY_NAME, generated.as_bytes())
                .map_err(vault_error)?;
            Ok(generated)
        }
        Err(error) => Err(vault_error(error)),
    }
}

pub fn provider_key_to_env_var(provider_id: &str, key_name: &str) -> String {
    format!(
        "PROVIDER_{}_{}",
        sanitize_env_segment(provider_id),
        sanitize_env_segment(key_name)
    )
}

pub fn master_key_env_var() -> String {
    "LITELLM_MASTER_KEY".to_string()
}

fn provider_secret_name(provider_id: &str, key_name: &str) -> String {
    format!("{PROVIDER_PREFIX}:{provider_id}:{key_name}")
}

fn sanitize_env_segment(value: &str) -> String {
    let mut sanitized = String::with_capacity(value.len());
    let mut last_was_underscore = false;

    for character in value.chars() {
        let normalized = if character.is_ascii_alphanumeric() {
            character.to_ascii_uppercase()
        } else {
            '_'
        };

        if normalized == '_' {
            if !last_was_underscore {
                sanitized.push('_');
                last_was_underscore = true;
            }
        } else {
            sanitized.push(normalized);
            last_was_underscore = false;
        }
    }

    sanitized.trim_matches('_').to_string()
}

fn vault_error(error: VaultError) -> LlmError {
    LlmError::Vault(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use snapfzz_vault::{load_or_generate_master_key, SecretVault};

    fn test_vault() -> (tempfile::TempDir, SecretVault) {
        let temp = tempfile::tempdir().expect("tempdir");
        let master = load_or_generate_master_key(temp.path()).expect("master key");
        let vault =
            SecretVault::open(&master, temp.path().join("vault.snapfzz")).expect("open vault");
        (temp, vault)
    }

    #[test]
    fn a013_vault_provider_keys_stored_with_litellm_namespace() {
        // A013/Vault: provider keys stored with litellm:provider:{id}:{name} format
        let (_temp, mut vault) = test_vault();

        store_provider_key(&mut vault, "openai", "key_1", "sk-test").expect("store key");

        let keys = vault.list().expect("list keys");
        assert_eq!(keys, vec!["litellm:provider:openai:key_1".to_string()]);
    }

    #[test]
    fn a013_vault_config_generation_fetches_key_names_from_vault() {
        // A013/Vault: config generation fetches key names from vault
        let (_temp, mut vault) = test_vault();
        store_provider_key(&mut vault, "openai", "key_2", "sk-2").expect("store key2");
        store_provider_key(&mut vault, "openai", "key_1", "sk-1").expect("store key1");
        store_provider_key(&mut vault, "anthropic", "key_1", "ak-1").expect("store key3");

        let keys = list_provider_keys(&mut vault, "openai").expect("list provider keys");

        assert_eq!(keys, vec!["key_1".to_string(), "key_2".to_string()]);
    }

    #[test]
    fn a013_vault_master_key_generated_on_first_boot_if_missing() {
        // A013/Vault: master_key generated on first boot if missing
        let (_temp, mut vault) = test_vault();

        let first = get_or_create_master_key(&mut vault).expect("first master key");
        let second = get_or_create_master_key(&mut vault).expect("second master key");

        assert_eq!(first, second);
        assert!(Uuid::parse_str(&first).is_ok());
        assert_eq!(
            vault.read("litellm:master_key").expect("stored master key"),
            first.as_bytes()
        );
    }

    #[test]
    fn a013_vault_config_yaml_uses_os_environ_references() {
        // A013/Vault: config.yaml uses os.environ/ references
        assert_eq!(
            provider_key_to_env_var("openai", "key_1"),
            "PROVIDER_OPENAI_KEY_1".to_string()
        );
        assert_eq!(master_key_env_var(), "LITELLM_MASTER_KEY".to_string());
    }

    #[test]
    fn a013_vault_read_delete_provider_key_round_trip() {
        let (_temp, mut vault) = test_vault();

        store_provider_key(&mut vault, "openai", "key_1", "sk-abc").expect("store");
        let value = read_provider_key(&mut vault, "openai", "key_1").expect("read");
        assert_eq!(value, "sk-abc");

        delete_provider_key(&mut vault, "openai", "key_1").expect("delete");
        assert!(read_provider_key(&mut vault, "openai", "key_1").is_err());
    }
}
