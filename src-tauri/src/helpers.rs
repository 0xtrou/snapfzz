use serde::Serialize;
use snapfzz_kernel::boot::{OnPreflightReady, PreflightContext, PreflightError};
use snapfzz_kernel::budget::BudgetRegistry;
use snapfzz_kernel::process::{ProcessManager, SpawnConfig};
use snapfzz_kernel::settings::SettingsManager;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Emitter;

const AGENTSCOPE_PORT: u16 = 8090;

fn snapfzz_home() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".snapfzz")
}

pub(crate) fn resolve_data_dir_from(home: PathBuf) -> PathBuf {
    let pointer_path = home.join("pointer.json");
    if !pointer_path.exists() {
        return home;
    }

    if let Ok(content) = fs::read_to_string(&pointer_path) {
        if let Ok(pointer) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(dir) = pointer.get("dataDir").and_then(|v| v.as_str()) {
                let custom = PathBuf::from(dir);
                if custom.exists() {
                    return custom;
                }
            }
        }
    }

    home
}

pub fn resolve_data_dir() -> PathBuf {
    resolve_data_dir_from(snapfzz_home())
}

pub fn agentscope_base_url(settings_mgr: &SettingsManager) -> String {
    let settings = settings_mgr.load().unwrap_or_default();
    let host = if settings.agentscope_host.is_empty() {
        "127.0.0.1".to_string()
    } else {
        settings.agentscope_host
    };
    let port: u16 = settings.agentscope_port.parse().unwrap_or(AGENTSCOPE_PORT);
    format!("http://{host}:{port}")
}

fn resolve_intelligence_dir() -> Result<PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    for candidate in [
        cwd.join("intelligence"),
        cwd.join("..").join("intelligence"),
        cwd.join("../..").join("intelligence"),
    ] {
        if candidate.join("pyproject.toml").exists() {
            return Ok(candidate);
        }
    }
    Err("Unable to find intelligence/ directory".to_string())
}

pub fn resolve_spawn_config(settings_mgr: &SettingsManager) -> Result<SpawnConfig, String> {
    let settings = settings_mgr.load().unwrap_or_default();
    let host = if settings.agentscope_host.is_empty() {
        "127.0.0.1".to_string()
    } else {
        settings.agentscope_host
    };

    Ok(SpawnConfig {
        host,
        port: settings.agentscope_port.parse().unwrap_or(AGENTSCOPE_PORT),
        working_dir: resolve_intelligence_dir()?,
    })
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SupervisorEvent {
    event_type: String,
    process: String,
    message: String,
    timestamp: u64,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn emit_supervisor(app: &tauri::AppHandle, event_type: &str, process: &str, message: String) {
    let _ = app.emit(
        "supervisor-event",
        SupervisorEvent {
            event_type: event_type.into(),
            process: process.into(),
            message,
            timestamp: now_ms(),
        },
    );
}

fn spawn_failure(err: impl ToString) -> String {
    format!("Failed to start AgentScope Runtime: {}", err.to_string())
}

pub async fn spawn_agentscope(
    handle: tauri::AppHandle,
    registry: Arc<BudgetRegistry>,
    process_mgr: Arc<ProcessManager>,
    settings_mgr: Arc<SettingsManager>,
) {
    match resolve_spawn_config(&settings_mgr) {
        Ok(config) => match process_mgr.spawn("agentscope", &config, &registry).await {
            Ok(_) => {
                let _ = handle.emit("agent-status", "online");
                emit_supervisor(
                    &handle,
                    "success",
                    "agentscope",
                    "AgentScope Runtime started successfully".into(),
                );
            }
            Err(err) => {
                let msg = spawn_failure(err);
                emit_supervisor(&handle, "error", "agentscope", msg);
            }
        },
        Err(err) => {
            let msg = spawn_failure(err);
            emit_supervisor(&handle, "error", "agentscope", msg);
        }
    }
}

pub struct BootLogger;

impl OnPreflightReady for BootLogger {
    fn on_preflight_ready(&self, ctx: &PreflightContext) -> Result<(), PreflightError> {
        let preset = ctx.registry().preset.read().unwrap();
        eprintln!(
            "[preflight] Ready: preset={}, data_dir={}",
            preset.name,
            ctx.data_dir.display()
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a004_persistence_resolve_data_dir_returns_default_when_no_pointer_exists() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        assert_eq!(resolve_data_dir_from(home.clone()), home);
    }

    #[test]
    fn a004_persistence_resolve_data_dir_reads_custom_path_from_pointer_json() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        let custom = tmp.path().join("custom_data");
        fs::create_dir_all(&custom).unwrap();
        fs::write(
            home.join("pointer.json"),
            serde_json::to_string(&serde_json::json!({"dataDir": custom.to_str().unwrap()})).unwrap(),
        )
        .unwrap();
        assert_eq!(resolve_data_dir_from(home), custom);
    }

    #[test]
    fn a004_persistence_resolve_data_dir_falls_back_when_pointer_path_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        fs::write(
            home.join("pointer.json"),
            serde_json::to_string(&serde_json::json!({"dataDir": "/this/path/does/not/exist/xyz"}))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(resolve_data_dir_from(home.clone()), home);
    }

    #[test]
    fn a004_persistence_resolve_data_dir_falls_back_when_pointer_is_corrupt() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        fs::write(home.join("pointer.json"), "not { valid json").unwrap();
        assert_eq!(resolve_data_dir_from(home.clone()), home);
    }
}
