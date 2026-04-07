use snapfzz_vault::SecretVault;
use std::sync::{Arc, Mutex};

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
    ensure_initialized(&guard)?;
    guard.store(&key, value.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_read(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    key: String,
    plugin_id: Option<String>,
) -> Result<String, String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let mut guard = vault.lock().unwrap();
    ensure_initialized(&guard)?;
    let bytes = guard.read(&key).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_delete(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    key: String,
    plugin_id: Option<String>,
) -> Result<(), String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let mut guard = vault.lock().unwrap();
    ensure_initialized(&guard)?;
    guard.delete(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_list(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    plugin_id: Option<String>,
) -> Result<Vec<String>, String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let mut guard = vault.lock().unwrap();
    ensure_initialized(&guard)?;
    guard.list().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_has(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    key: String,
    plugin_id: Option<String>,
) -> Result<bool, String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let guard = vault.lock().unwrap();
    ensure_initialized(&guard)?;
    Ok(guard.has(&key))
}

#[cfg(test)]
mod tests {
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
}
