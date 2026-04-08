use snapfzz_vault::SecretVault;
use std::sync::{Arc, Mutex};

pub(crate) fn do_vault_store(vault: &mut SecretVault, key: &str, value: &str) -> Result<(), String> {
    ensure_initialized(vault)?;
    vault.store(key, value.as_bytes()).map_err(|e| e.to_string())
}

pub(crate) fn do_vault_read(vault: &mut SecretVault, key: &str) -> Result<String, String> {
    ensure_initialized(vault)?;
    let bytes = vault.read(key).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

pub(crate) fn do_vault_delete(vault: &mut SecretVault, key: &str) -> Result<(), String> {
    ensure_initialized(vault)?;
    vault.delete(key).map_err(|e| e.to_string())
}

pub(crate) fn do_vault_list(vault: &mut SecretVault) -> Result<Vec<String>, String> {
    ensure_initialized(vault)?;
    vault.list().map_err(|e| e.to_string())
}

pub(crate) fn do_vault_has(vault: &SecretVault, key: &str) -> Result<bool, String> {
    ensure_initialized(vault)?;
    Ok(vault.has(key))
}

pub fn ensure_system_vault_caller(plugin_id: Option<&str>) -> Result<(), String> {
    if plugin_id.is_some() {
        return Err("Vault access denied: plugins cannot access the system vault".to_string());
    }
    Ok(())
}

fn ensure_initialized(vault: &SecretVault) -> Result<(), String> {
    if !vault.is_initialized() {
        return Err("Vault not initialized — restart the app to regenerate the master key".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn vault_store(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    key: String,
    value: String,
    plugin_id: Option<String>,
) -> Result<(), String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let mut guard = vault.lock().unwrap();
    do_vault_store(&mut guard, &key, &value)
}

#[tauri::command]
pub async fn vault_read(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    key: String,
    plugin_id: Option<String>,
) -> Result<String, String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let mut guard = vault.lock().unwrap();
    do_vault_read(&mut guard, &key)
}

#[tauri::command]
pub async fn vault_delete(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    key: String,
    plugin_id: Option<String>,
) -> Result<(), String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let mut guard = vault.lock().unwrap();
    do_vault_delete(&mut guard, &key)
}

#[tauri::command]
pub async fn vault_list(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    plugin_id: Option<String>,
) -> Result<Vec<String>, String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let mut guard = vault.lock().unwrap();
    do_vault_list(&mut guard)
}

#[tauri::command]
pub async fn vault_has(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    key: String,
    plugin_id: Option<String>,
) -> Result<bool, String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let guard = vault.lock().unwrap();
    do_vault_has(&guard, &key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tauri::{
        test::{mock_builder, mock_context, noop_assets},
        Manager,
    };

    fn initialized_vault() -> SecretVault {
        let temp = tempfile::tempdir().expect("tempdir");
        SecretVault::open(&[7_u8; 32], temp.path().join("vault.bin")).expect("open vault")
    }

    #[test]
    fn a014_commands_vault_module_exports_all_vault_commands() {
        let _store = super::vault_store;
        let _read = super::vault_read;
        let _delete = super::vault_delete;
        let _list = super::vault_list;
        let _has = super::vault_has;
    }

    #[test]
    fn a014_commands_vault_rejects_plugin_callers() {
        let result = super::ensure_system_vault_caller(Some("plugin.test"));
        assert!(result.is_err());
    }

    #[test]
    fn a014_commands_vault_allows_system_caller() {
        assert!(ensure_system_vault_caller(None).is_ok());
    }

    #[test]
    fn a014_commands_vault_ensure_initialized_rejects_empty_vault() {
        let temp = tempfile::tempdir().expect("tempdir");
        let vault = SecretVault::empty(temp.path().join("vault.bin"));
        let err = ensure_initialized(&vault).expect_err("empty vault should reject");
        assert!(err.contains("Vault not initialized"));
    }

    #[test]
    fn a014_commands_vault_do_store_read_delete_list_has_roundtrip() {
        let mut vault = initialized_vault();

        do_vault_store(&mut vault, "api-key", "secret-value").expect("store");
        assert!(do_vault_has(&vault, "api-key").expect("has"));

        let listed = do_vault_list(&mut vault).expect("list");
        assert_eq!(listed, vec!["api-key".to_string()]);

        let read = do_vault_read(&mut vault, "api-key").expect("read");
        assert_eq!(read, "secret-value");

        do_vault_delete(&mut vault, "api-key").expect("delete");
        assert!(!do_vault_has(&vault, "api-key").expect("has after delete"));
    }

    #[test]
    fn a014_commands_vault_do_read_rejects_missing_key() {
        let mut vault = initialized_vault();
        let err = do_vault_read(&mut vault, "missing").expect_err("missing key should fail");
        assert!(err.contains("secret not found"));
    }

    #[test]
    fn a014_commands_vault_do_delete_returns_not_found_error() {
        let mut vault = initialized_vault();
        let err = do_vault_delete(&mut vault, "missing").expect_err("missing key");
        assert!(err.contains("secret not found"));
    }

    #[test]
    fn a014_commands_vault_do_list_rate_limit_error_path_is_exposed() {
        let mut vault = initialized_vault();
        do_vault_store(&mut vault, "k", "v").expect("store");

        for _ in 0..10 {
            let _ = do_vault_list(&mut vault);
        }

        let err = do_vault_list(&mut vault).expect_err("rate limited list");
        assert!(err.contains("rate limited"));
    }

    #[test]
    fn a014_commands_vault_ipc_commands_delegate_to_pure_logic() {
        let vault = Arc::new(std::sync::Mutex::new(initialized_vault()));
        let app = mock_builder()
            .manage(vault)
            .build(mock_context(noop_assets()))
            .expect("build app");

        tauri::async_runtime::block_on(vault_store(
            app.state::<Arc<std::sync::Mutex<SecretVault>>>(),
            "token".to_string(),
            "abc".to_string(),
            None,
        ))
        .expect("store command");

        let value = tauri::async_runtime::block_on(vault_read(
            app.state::<Arc<std::sync::Mutex<SecretVault>>>(),
            "token".to_string(),
            None,
        ))
        .expect("read command");
        assert_eq!(value, "abc");

        let listed = tauri::async_runtime::block_on(vault_list(
            app.state::<Arc<std::sync::Mutex<SecretVault>>>(),
            None,
        ))
        .expect("list command");
        assert_eq!(listed, vec!["token".to_string()]);

        let has = tauri::async_runtime::block_on(vault_has(
            app.state::<Arc<std::sync::Mutex<SecretVault>>>(),
            "token".to_string(),
            None,
        ))
        .expect("has command");
        assert!(has);

        tauri::async_runtime::block_on(vault_delete(
            app.state::<Arc<std::sync::Mutex<SecretVault>>>(),
            "token".to_string(),
            None,
        ))
        .expect("delete command");

        let has_after_delete = tauri::async_runtime::block_on(vault_has(
            app.state::<Arc<std::sync::Mutex<SecretVault>>>(),
            "token".to_string(),
            None,
        ))
        .expect("has command after delete");
        assert!(!has_after_delete);
    }

    #[test]
    fn a014_commands_vault_ipc_commands_reject_plugin_access() {
        let vault = Arc::new(std::sync::Mutex::new(initialized_vault()));
        let app = mock_builder()
            .manage(vault)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let err = tauri::async_runtime::block_on(vault_store(
            app.state::<Arc<std::sync::Mutex<SecretVault>>>(),
            "token".to_string(),
            "abc".to_string(),
            Some("plugin.chat".to_string()),
        ))
        .expect_err("plugin access denied");
        assert!(err.contains("Vault access denied"));
    }
}
