// A013/Commands: Tauri commands for LLM Gateway operations

use snapfzz_llm::{
    config, keys, spend, vault,
    GeneratedKey, GatewayConfig, KeyGenerateParams, KeyInfo, KeyListResponse,
    KeyUpdateParams, SpendFilters, SpendLog, KeySpend, GlobalSpend, ModelListResponse,
};
use snapfzz_vault::SecretVault;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

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
pub async fn llm_read_provider_key(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    provider_id: String,
    key_name: String,
) -> Result<String, String> {
    let mut guard = vault.lock().unwrap();
    vault::read_provider_key(&mut guard, &provider_id, &key_name)
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

#[tauri::command]
pub async fn llm_get_or_create_master_key(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
) -> Result<String, String> {
    let mut guard = vault.lock().unwrap();
    vault::get_or_create_master_key(&mut guard)
        .map_err(|e| e.to_string())
}

// A013/Config: Config management commands

#[tauri::command]
pub async fn llm_save_config(
    config: GatewayConfig,
    vault_keys: Vec<String>,
    data_dir: String,
) -> Result<(), String> {
    let data_path = PathBuf::from(data_dir);
    let config_path = config::config_path(&data_path);
    
    let yaml = config::generate_config(&config, &vault_keys)
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

#[tauri::command]
pub async fn llm_generate_key(
    base_url: String,
    master_key: String,
    params: KeyGenerateParams,
) -> Result<GeneratedKey, String> {
    let client = reqwest::Client::new();
    keys::generate_key(&client, &base_url, &master_key, &params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_list_keys(
    base_url: String,
    master_key: String,
    page: Option<u32>,
    size: Option<u32>,
) -> Result<KeyListResponse, String> {
    let client = reqwest::Client::new();
    keys::list_keys(&client, &base_url, &master_key, page, size)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_delete_key(
    base_url: String,
    master_key: String,
    key: String,
) -> Result<bool, String> {
    let client = reqwest::Client::new();
    keys::delete_key(&client, &base_url, &master_key, &key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_get_key_info(
    base_url: String,
    master_key: String,
    key: String,
) -> Result<KeyInfo, String> {
    let client = reqwest::Client::new();
    keys::get_key_info(&client, &base_url, &master_key, &key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_update_key(
    base_url: String,
    master_key: String,
    key: String,
    params: KeyUpdateParams,
) -> Result<KeyInfo, String> {
    let client = reqwest::Client::new();
    keys::update_key(&client, &base_url, &master_key, &key, &params)
        .await
        .map_err(|e| e.to_string())
}

// A013/Spend: Spend tracking commands

#[tauri::command]
pub async fn llm_get_spend_logs(
    base_url: String,
    master_key: String,
    filters: SpendFilters,
) -> Result<Vec<SpendLog>, String> {
    let client = reqwest::Client::new();
    spend::get_spend_logs(&client, &base_url, &master_key, &filters)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_get_key_spend(
    base_url: String,
    master_key: String,
    key: String,
) -> Result<KeySpend, String> {
    let client = reqwest::Client::new();
    spend::get_key_spend(&client, &base_url, &master_key, &key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_get_global_spend(
    base_url: String,
    master_key: String,
) -> Result<GlobalSpend, String> {
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