// A013/Commands: Tauri commands for LLM Gateway operations

const DEFAULT_LITELLM_HOST: &str = "127.0.0.1";
const DEFAULT_LITELLM_PORT: &str = "4000";

/// LiteLLM internal table name — coupled to LiteLLM schema version.
const LITELLM_SPEND_LOGS_TABLE: &str = "LiteLLM_SpendLogs";

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
        DEFAULT_LITELLM_HOST.to_string()
    } else {
        settings.litellm_host
    };
    let port: u16 = if settings.litellm_port.is_empty() {
        DEFAULT_LITELLM_PORT.parse().unwrap_or(4000)
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

// A013/Internal: Formerly contained hardcoded provider base URLs. Removed — the
// frontend must pass base_url explicitly. For built-in providers, the catalog
// contains the API base URL. Kept for call-site compatibility.
fn resolve_provider_base_url(_provider_id: &str) -> Option<&'static str> {
    // Built-in provider URLs removed — the frontend must pass base_url.
    // For built-in providers, the catalog contains the API base URL.
    None
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
            .ok_or_else(|| format!("No base URL configured for provider '{provider_id}'. Select a provider with a configured API endpoint."))?
            .to_string(),
    };

    // 3. Call the provider's /v1/models endpoint.
    // Strip trailing /v1 if present — custom providers may include it in base_url.
    let base = url.trim_end_matches('/').trim_end_matches("/v1");
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/v1/models", base))
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
    variant: Option<String>,  // "openai" or "anthropic" — required for custom providers
) -> Result<Value, String> {
    // Get master key for LiteLLM auth
    let master_key = {
        let mut guard = vault.lock().unwrap();
        vault::get_or_create_master_key(&mut guard)
            .map_err(|e| e.to_string())?
    };

    // Read the actual API key value from vault — LiteLLM will encrypt it in DB
    let api_key_value = {
        let mut guard = vault.lock().unwrap();
        let keys = vault::list_provider_keys(&mut guard, &provider_id)
            .unwrap_or_default();
        let key_name = keys.first().cloned()
            .ok_or_else(|| format!("No API key configured for provider '{provider_id}'. Add a key first."))?;
        vault::read_provider_key(&mut guard, &provider_id, &key_name)
            .map_err(|e| e.to_string())?
    };

    // Get LiteLLM base URL from settings
    let settings = settings_mgr.load().unwrap_or_default();
    let litellm_host = if settings.litellm_host.is_empty() {
        DEFAULT_LITELLM_HOST
    } else {
        &settings.litellm_host
    };
    let litellm_port = if settings.litellm_port.is_empty() {
        DEFAULT_LITELLM_PORT
    } else {
        &settings.litellm_port
    };
    let litellm_url = format!("http://{}:{}", litellm_host, litellm_port);

    // A013/ImportModel: model_name = <provider-slug>/<model-id> for unique routing.
    // litellm_params.model = <sdk-prefix>/<model-id> for LiteLLM SDK routing.
    // LiteLLM strips the sdk prefix before sending to the endpoint.
    let (sdk_prefix, provider_slug) = if provider_id.starts_with("custom-") {
        // Custom providers: use variant to determine SDK prefix, provider name as slug
        let slug = provider_id.strip_prefix("custom-").unwrap_or(&provider_id);
        let sdk = variant.as_deref().unwrap_or("openai");
        (sdk, slug.to_string())
    } else {
        // Built-in providers: use provider ID as both SDK prefix and slug
        (provider_id.as_str(), provider_id.clone())
    };

    let litellm_model = format!("{}/{}", sdk_prefix, model_id);
    let display_name = model_name.unwrap_or_else(|| format!("{}/{}", provider_slug, model_id));

    let body = serde_json::json!({
        "model_name": display_name,
        "litellm_params": {
            "model": litellm_model,
            "api_key": api_key_value,
            "api_base": base_url,
        },
        "model_info": {
            "snapfzz_provider_id": provider_id,
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

// A013/AuditLog: Delete spend logs older than N days directly from PostgreSQL.
// LiteLLM has no admin API for on-demand cleanup — only config-based auto-retention.
// See: https://docs.litellm.ai/docs/proxy/spend_logs_deletion
// We use the embedded psql binary to run the DELETE directly.
#[tauri::command]
pub async fn llm_cleanup_spend_logs(
    keep_days: u32,
    registry: tauri::State<'_, Arc<Mutex<snapfzz_kernel::process::ProcessFactoryRegistry>>>,
) -> Result<u64, String> {
    let db_url = {
        let guard = registry.lock().unwrap();
        guard.database_url()
            .cloned()
            .ok_or("Database not available")?
    };

    let data_dir = crate::helpers::resolve_data_dir();
    let psql = find_psql(&data_dir)?;

    let sql = format!(
        r#"DELETE FROM "{}" WHERE "startTime" < NOW() - INTERVAL '{keep_days} days'"#,
        LITELLM_SPEND_LOGS_TABLE,
    );

    let output = tokio::process::Command::new(&psql)
        .arg(&db_url)
        .arg("-t")
        .arg("-c")
        .arg(&sql)
        .output()
        .await
        .map_err(|e| format!("Failed to run psql: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("psql failed: {stderr}"));
    }

    // psql output is "DELETE N\n" — parse the count
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let count = stdout
        .split_whitespace()
        .last()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    Ok(count)
}

fn find_psql(data_dir: &std::path::Path) -> Result<PathBuf, String> {
    // Embedded PG lives at ~/.snapfzz/runtime/postgres/{version}/bin/psql
    let runtime_dir = data_dir.join("runtime").join("postgres");
    if let Ok(entries) = std::fs::read_dir(&runtime_dir) {
        for entry in entries.flatten() {
            let psql = entry.path().join("bin").join("psql");
            if psql.exists() {
                return Ok(psql);
            }
        }
    }
    Err("psql binary not found in embedded PostgreSQL installation".into())
}

