// A013/Commands: Tauri commands for LLM Gateway operations

const DEFAULT_LITELLM_HOST: &str = "127.0.0.1";
const DEFAULT_LITELLM_PORT: &str = "4000";

/// LiteLLM internal table name — coupled to LiteLLM schema version.
const LITELLM_SPEND_LOGS_TABLE: &str = "LiteLLM_SpendLogs";

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
