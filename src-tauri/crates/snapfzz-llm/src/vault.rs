use crate::types::LlmError;
use snapfzz_vault::{SecretVault, VaultError};
use uuid::Uuid;

const MASTER_KEY_NAME: &str = "litellm:master_key";

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

}
