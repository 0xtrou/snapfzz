// A013/Commands: Tauri commands for LLM Gateway operations

use serde_json::Value;
use snapfzz_kernel::settings::SettingsManager;
use snapfzz_llm::{
    config, vault,
    GatewayConfig,
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

// A013/Runtime: Returns the LiteLLM master key so the frontend can call LiteLLM
// APIs directly via fetch() — no Rust proxy needed for key/spend/model endpoints.
#[tauri::command]
pub async fn llm_get_master_key(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
) -> Result<String, String> {
    let mut guard = vault.lock().unwrap();
    vault::get_or_create_master_key(&mut guard).map_err(|e| e.to_string())
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
    
    let yaml = config::generate_config(&config, &all_keys, &data_path)
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

// A013/Discovery: Discover models from a provider's own API using vault-stored keys.
// The frontend cannot call provider APIs directly because API keys live in the vault.

// A013/Internal: Known API base URLs for built-in providers. Used only by
// llm_discover_models when no explicit base_url is supplied by the caller.
// The frontend no longer queries this — it uses the bundled model catalog for metadata.
fn resolve_provider_base_url(provider_id: &str) -> Option<&'static str> {
    match provider_id {
        "openai" => Some("https://api.openai.com"),
        "anthropic" => Some("https://api.anthropic.com"),
        "google" | "gemini" => Some("https://generativelanguage.googleapis.com"),
        "mistral" => Some("https://api.mistral.ai"),
        "groq" => Some("https://api.groq.com/openai"),
        "deepseek" => Some("https://api.deepseek.com"),
        "together_ai" => Some("https://api.together.xyz"),
        "fireworks_ai" => Some("https://api.fireworks.ai/inference"),
        "openrouter" => Some("https://openrouter.ai/api"),
        "zhipu" => Some("https://open.bigmodel.cn/api/paas"),
        "xai" => Some("https://api.x.ai"),
        _ => None,
    }
}

#[tauri::command]
pub async fn llm_discover_models(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    provider_id: String,
    base_url: Option<String>,
) -> Result<Value, String> {
    // 1. Get API key from vault
    let api_key = {
        let mut guard = vault.lock().unwrap();
        let keys = vault::list_provider_keys(&mut guard, &provider_id)
            .map_err(|e| e.to_string())?;
        let first_key = keys.first().ok_or("No API keys stored for this provider")?;
        vault::read_provider_key(&mut guard, &provider_id, first_key)
            .map_err(|e| e.to_string())?
    };

    // 2. Determine base URL — caller override, then known defaults
    let url = match base_url {
        Some(ref u) if !u.is_empty() => u.clone(),
        _ => resolve_provider_base_url(&provider_id)
            .ok_or_else(|| format!("No base URL known for provider '{provider_id}'"))?
            .to_string(),
    };

    // 3. Call the provider's /v1/models endpoint
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/v1/models", url.trim_end_matches('/')))
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Provider returned {status}: {body}"));
    }

    let body: Value = response.json().await.map_err(|e| format!("Invalid JSON: {e}"))?;
    Ok(body)
}

#[tauri::command]
pub async fn llm_import_model(
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
    provider_id: String,
    model_id: String,
    model_name: Option<String>,
    base_url: Option<String>,
) -> Result<Value, String> {
    // Get master key for LiteLLM auth
    let master_key = {
        let mut guard = vault.lock().unwrap();
        vault::get_or_create_master_key(&mut guard)
            .map_err(|e| e.to_string())?
    };

    // Resolve API key env var reference for the provider
    let api_key_ref = {
        let mut guard = vault.lock().unwrap();
        let keys = vault::list_provider_keys(&mut guard, &provider_id)
            .unwrap_or_default();
        let key_name = keys.first().cloned().unwrap_or_else(|| "DEFAULT".to_string());
        format!(
            "os.environ/PROVIDER_{}_{}",
            provider_id.to_uppercase().replace('-', "_"),
            key_name.to_uppercase().replace('-', "_"),
        )
    };

    // Get LiteLLM base URL from settings
    let settings = settings_mgr.load().unwrap_or_default();
    let litellm_host = if settings.litellm_host.is_empty() {
        "127.0.0.1"
    } else {
        &settings.litellm_host
    };
    let litellm_port = if settings.litellm_port.is_empty() {
        "4000"
    } else {
        &settings.litellm_port
    };
    let litellm_url = format!("http://{}:{}", litellm_host, litellm_port);

    // Build model deployment payload
    let body = serde_json::json!({
        "model_name": model_name.unwrap_or_else(|| model_id.clone()),
        "litellm_params": {
            "model": format!("{}/{}", provider_id, model_id),
            "api_key": api_key_ref,
            "api_base": base_url,
        }
    });

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/model/new", litellm_url))
        .header("Authorization", format!("Bearer {}", master_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("LiteLLM returned {status}: {body}"));
    }

    let result: Value = response.json().await.map_err(|e| format!("Invalid JSON: {e}"))?;
    Ok(result)
}

