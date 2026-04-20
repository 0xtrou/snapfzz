// A013/Commands: Tauri commands for LLM Gateway operations

use crate::constants::{databases, litellm as litellm_cfg};
use snapfzz_kernel::settings::SettingsManager;
use snapfzz_llm::{
    combo, config, vault,
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
        litellm_cfg::DEFAULT_HOST.to_string()
    } else {
        settings.litellm_host
    };
    let port: u16 = if settings.litellm_port.is_empty() {
        litellm_cfg::DEFAULT_PORT.parse().unwrap_or(4000)
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

// A013/Config: Config management commands

#[tauri::command]
pub async fn llm_save_config(
    config: GatewayConfig,
    data_dir: String,
) -> Result<(), String> {
    let data_path = PathBuf::from(data_dir);
    let config_path = config::config_path(&data_path);

    // A013/Config: Provider API keys are managed entirely by LiteLLM in its encrypted DB.
    // The config no longer embeds vault-sourced key names — pass empty keys list.
    let yaml = config::generate_config(&config, &[], &data_path)
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

// A013/Discovery + ImportModel: Moved to pure TypeScript frontend.
// The frontend calls LiteLLM and provider APIs directly via fetch().
// No Rust proxy needed — the master key (for LiteLLM auth) is fetched via llm_get_master_key.

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
        databases::LITELLM_SPEND_LOGS_TABLE,
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

// A013/Orchestrator: mutate the system `orchestrator` combo in LiteLLM. Invoked by the
// ModelPicker when the user picks a new model. Rust owns the master key and the raw
// provider api keys (stored in snapfzz-vault) so the frontend never touches either.
// The combo stores the raw key because LiteLLM does NOT resolve `os.environ/...` for
// deployments added via `/model/new` or `/model/update` — only for yaml-config models.
#[tauri::command]
pub async fn llm_update_orchestrator_combo(
    model_target: String,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
    vault: tauri::State<'_, Arc<Mutex<SecretVault>>>,
) -> Result<(), String> {
    let base_url = resolve_base_url(&settings_mgr);
    let master_key = {
        let mut guard = vault.lock().unwrap();
        vault::get_or_create_master_key(&mut guard).map_err(|e| e.to_string())?
    };
    let vault_handle = vault.inner().clone();
    let resolve = move |provider_id: &str| -> Result<String, snapfzz_llm::LlmError> {
        let mut guard = vault_handle.lock().map_err(|e| {
            snapfzz_llm::LlmError::Message(format!("vault poisoned: {e}"))
        })?;
        let key = format!(
            "{}{}",
            crate::constants::vault_keys::PROVIDER_KEY_PREFIX,
            provider_id
        );
        let bytes = guard.read(&key).map_err(|e| {
            snapfzz_llm::LlmError::Message(format!(
                "no vault entry for provider '{provider_id}': {e} — re-save the provider key in Settings → LLM"
            ))
        })?;
        String::from_utf8(bytes).map_err(|e| {
            snapfzz_llm::LlmError::Message(format!(
                "vault entry for '{provider_id}' is not utf8: {e}"
            ))
        })
    };
    combo::update_orchestrator_combo(&base_url, &master_key, &model_target, resolve)
        .await
        .map_err(|e| e.to_string())
}

fn resolve_base_url(settings_mgr: &SettingsManager) -> String {
    let settings = settings_mgr.load().unwrap_or_default();
    let host = if settings.litellm_host.is_empty() {
        litellm_cfg::DEFAULT_HOST.to_string()
    } else {
        settings.litellm_host
    };
    let port: u16 = if settings.litellm_port.is_empty() {
        litellm_cfg::DEFAULT_PORT.parse().unwrap_or(4000)
    } else {
        settings.litellm_port.parse().unwrap_or(4000)
    };
    format!("http://{}:{}", host, port)
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
