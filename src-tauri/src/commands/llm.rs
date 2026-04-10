// A013/Commands: Tauri commands for LLM Gateway operations

use snapfzz_kernel::settings::SettingsManager;
use snapfzz_llm::{
    config, keys, spend, vault,
    GeneratedKey, GatewayConfig, KeyGenerateParams, KeyInfo, KeyListResponse,
    KeyUpdateParams, SpendFilters, SpendLog, KeySpend, GlobalSpend, ModelListResponse,
};
use snapfzz_vault::SecretVault;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

// A013/Config: Base URL command - returns LiteLLM gateway URL from settings

#[tauri::command]
pub async fn llm_get_base_url(
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
) -> Result<String, String> {
    let settings = settings_mgr.load().unwrap_or_default();
    let host = if settings.litellm_host.is_empty() {
        "127.0.0.1".to_string()
    } else {
        settings.litellm_host
    };
    let port: u16 = if settings.litellm_port.is_empty() {
        4000
    } else {
        settings.litellm_port.parse().unwrap_or(4000)
    };
    Ok(format!("http://{}:{}", host, port))
}

// A013/Vault: Provider key management commands

#[tauri::command]
pub async fn llm_store_provider_key(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    provider_id: String,
    key_name: String,
    key_value: String,
) -> Result<(), String> {
    let mut guard = vault.lock().unwrap();
    vault::store_provider_key(&mut guard, &provider_id, &key_name, &key_value)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_delete_provider_key(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    provider_id: String,
    key_name: String,
) -> Result<(), String> {
    let mut guard = vault.lock().unwrap();
    vault::delete_provider_key(&mut guard, &provider_id, &key_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_list_provider_keys(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    provider_id: String,
) -> Result<Vec<String>, String> {
    let mut guard = vault.lock().unwrap();
    vault::list_provider_keys(&mut guard, &provider_id)
        .map_err(|e| e.to_string())
}

// A013/Config: Config management commands

#[tauri::command]
pub async fn llm_save_config(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    config: GatewayConfig,
    data_dir: String,
) -> Result<(), String> {
    // A013/Vault: Fetch key names from vault, not from caller
    let all_keys = {
        let mut guard = vault.lock().unwrap();
        let mut keys = Vec::new();
        for deployment in &config.model_list {
            // Extract provider ID from model name (e.g., "openai/gpt-4o" -> "openai")
            if let Some(provider_id) = deployment.litellm_params.model.split('/').next() {
                let provider_keys = vault::list_provider_keys(&mut guard, provider_id)
                    .unwrap_or_default();
                keys.extend(provider_keys);
            }
        }
        keys
    };
    
    let data_path = PathBuf::from(data_dir);
    let config_path = config::config_path(&data_path);
    
    let yaml = config::generate_config(&config, &all_keys)
        .map_err(|e| e.to_string())?;
    
    config::write_config_atomically(&config_path, &yaml)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_get_config_path(data_dir: String) -> Result<String, String> {
    let data_path = PathBuf::from(data_dir);
    let path = config::config_path(&data_path);
    Ok(path.to_string_lossy().to_string())
}

// A013/Keys: LiteLLM virtual key management commands
// Master key is read from vault internally - never exposed to frontend

#[tauri::command]
pub async fn llm_generate_key(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    base_url: String,
    params: KeyGenerateParams,
) -> Result<GeneratedKey, String> {
    let master_key = {
        let mut guard = vault.lock().unwrap();
        vault::get_or_create_master_key(&mut guard).map_err(|e| e.to_string())?
    };
    
    let client = reqwest::Client::new();
    keys::generate_key(&client, &base_url, &master_key, &params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_list_keys(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    base_url: String,
    page: Option<u32>,
    size: Option<u32>,
) -> Result<KeyListResponse, String> {
    let master_key = {
        let mut guard = vault.lock().unwrap();
        vault::get_or_create_master_key(&mut guard).map_err(|e| e.to_string())?
    };
    
    let client = reqwest::Client::new();
    keys::list_keys(&client, &base_url, &master_key, page, size)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_delete_key(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    base_url: String,
    key: String,
) -> Result<bool, String> {
    let master_key = {
        let mut guard = vault.lock().unwrap();
        vault::get_or_create_master_key(&mut guard).map_err(|e| e.to_string())?
    };
    
    let client = reqwest::Client::new();
    keys::delete_key(&client, &base_url, &master_key, &key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_get_key_info(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    base_url: String,
    key: String,
) -> Result<KeyInfo, String> {
    let master_key = {
        let mut guard = vault.lock().unwrap();
        vault::get_or_create_master_key(&mut guard).map_err(|e| e.to_string())?
    };
    
    let client = reqwest::Client::new();
    keys::get_key_info(&client, &base_url, &master_key, &key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_update_key(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    base_url: String,
    key: String,
    params: KeyUpdateParams,
) -> Result<KeyInfo, String> {
    let master_key = {
        let mut guard = vault.lock().unwrap();
        vault::get_or_create_master_key(&mut guard).map_err(|e| e.to_string())?
    };
    
    let client = reqwest::Client::new();
    keys::update_key(&client, &base_url, &master_key, &key, &params)
        .await
        .map_err(|e| e.to_string())
}

// A013/Spend: Spend tracking commands

#[tauri::command]
pub async fn llm_get_spend_logs(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    base_url: String,
    filters: SpendFilters,
) -> Result<Vec<SpendLog>, String> {
    let master_key = {
        let mut guard = vault.lock().unwrap();
        vault::get_or_create_master_key(&mut guard).map_err(|e| e.to_string())?
    };
    
    let client = reqwest::Client::new();
    spend::get_spend_logs(&client, &base_url, &master_key, &filters)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_get_key_spend(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    base_url: String,
    key: String,
) -> Result<KeySpend, String> {
    let master_key = {
        let mut guard = vault.lock().unwrap();
        vault::get_or_create_master_key(&mut guard).map_err(|e| e.to_string())?
    };
    
    let client = reqwest::Client::new();
    spend::get_key_spend(&client, &base_url, &master_key, &key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_get_global_spend(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    base_url: String,
) -> Result<GlobalSpend, String> {
    let master_key = {
        let mut guard = vault.lock().unwrap();
        vault::get_or_create_master_key(&mut guard).map_err(|e| e.to_string())?
    };
    
    let client = reqwest::Client::new();
    spend::get_global_spend(&client, &base_url, &master_key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_get_models(base_url: String) -> Result<ModelListResponse, String> {
    let client = reqwest::Client::new();
    spend::get_models(&client, &base_url)
        .await
        .map_err(|e| e.to_string())
}