use serde::Serialize;
use serde_json::Value;
use snapfzz_kernel::budget::BudgetRegistry;
use snapfzz_kernel::process::ProcessManager;
use snapfzz_kernel::settings::SettingsManager;
use std::sync::Arc;
use tauri::Emitter;

use crate::helpers;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupervisorEvent {
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

pub(crate) fn emit_supervisor(
    app: &tauri::AppHandle,
    event_type: &str,
    process: &str,
    message: String,
) {
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

#[tauri::command]
pub async fn list_processes(
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<Value, String> {
    serde_json::to_value(registry.snapshot().processes).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_process_logs(
    name: String,
    tail_n: usize,
    process_mgr: tauri::State<'_, Arc<ProcessManager>>,
) -> Result<Vec<String>, String> {
    Ok(process_mgr.logs.tail(&name, tail_n))
}

#[tauri::command]
pub async fn clear_process_logs(
    name: String,
    process_mgr: tauri::State<'_, Arc<ProcessManager>>,
) -> Result<(), String> {
    process_mgr.logs.clear(&name);
    Ok(())
}

#[tauri::command]
pub async fn restart_process(
    name: String,
    app: tauri::AppHandle,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
    process_mgr: tauri::State<'_, Arc<ProcessManager>>,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
) -> Result<(), String> {
    process_mgr
        .restart(&name, &helpers::resolve_spawn_config(&settings_mgr)?, &registry)
        .await
        .map_err(|e| e.to_string())?;
    emit_supervisor(
        &app,
        "success",
        &name,
        "AgentScope Runtime restarted successfully".into(),
    );
    Ok(())
}

#[tauri::command]
pub async fn kill_process(
    name: String,
    app: tauri::AppHandle,
    process_mgr: tauri::State<'_, Arc<ProcessManager>>,
) -> Result<(), String> {
    process_mgr.kill(&name).map_err(|e| e.to_string())?;
    emit_supervisor(&app, "success", &name, "Process killed".into());
    Ok(())
}

#[tauri::command]
pub async fn update_process_config(
    name: String,
    max_memory_mb: u64,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<(), String> {
    let mut entry = registry
        .supervised
        .processes
        .get_mut(&name)
        .ok_or_else(|| format!("update_process_config: process '{name}' not registered"))?;
    entry.max_memory_mb = max_memory_mb;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn a014_commands_process_module_exports_restart_and_kill() {
        let _restart = super::restart_process;
        let _kill = super::kill_process;
        let _list = super::list_processes;
        let _logs = super::get_process_logs;
        let _clear = super::clear_process_logs;
        let _update = super::update_process_config;
    }
}
