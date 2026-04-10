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

pub(crate) fn emit_supervisor<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
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

pub(crate) fn do_kill_process(name: &str, process_mgr: &ProcessManager) -> Result<String, String> {
    process_mgr.kill(name).map_err(|e| e.to_string())?;
    Ok("Process killed".to_string())
}

#[tauri::command]
pub async fn restart_process<R: tauri::Runtime>(
    name: String,
    app: tauri::AppHandle<R>,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
    process_mgr: tauri::State<'_, Arc<ProcessManager>>,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
) -> Result<(), String> {
    process_mgr
        .shutdown(&name)
        .await
        .map_err(|e| e.to_string())?;

    // A033/restart_process: Dispatch managed service restart by service id
    match name.as_str() {
        "agentscope" => {
            helpers::spawn_agentscope(
                app.clone(),
                registry.inner().clone(),
                process_mgr.inner().clone(),
                settings_mgr.inner().clone(),
            )
            .await;
        }
        "litellm" => {
            helpers::spawn_litellm(
                app.clone(),
                registry.inner().clone(),
                process_mgr.inner().clone(),
                settings_mgr.inner().clone(),
            )
            .await;
        }
        _ => return Err(format!("Unknown service: {name}")),
    }

    Ok(())
}

#[tauri::command]
pub async fn kill_process<R: tauri::Runtime>(
    name: String,
    app: tauri::AppHandle<R>,
    process_mgr: tauri::State<'_, Arc<ProcessManager>>,
) -> Result<(), String> {
    let process_mgr = process_mgr.inner().clone();
    let name_for_kill = name.clone();
    let message =
        tokio::task::spawn_blocking(move || do_kill_process(&name_for_kill, &process_mgr))
            .await
            .map_err(|e| e.to_string())??;

    emit_supervisor(&app, "success", &name, message);
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
    use super::*;
    use snapfzz_kernel::budget::{
        metrics::ProcessStatus,
        preset::PresetName,
        supervised::{ProcessBudget, ProcessLocation},
    };
    use snapfzz_kernel::process::{logs::ProcessLogs, runtime::RuntimeState};
    use snapfzz_kernel::settings::Settings;
    use std::sync::{Arc, Mutex as StdMutex, OnceLock};
    use tauri::{
        test::{mock_builder, mock_context, noop_assets},
        Manager,
    };
    use tokio::sync::Mutex;

    fn cwd_lock() -> &'static StdMutex<()> {
        static LOCK: OnceLock<StdMutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| StdMutex::new(()))
    }

    fn register_process(registry: &Arc<BudgetRegistry>, name: &str, max_memory_mb: u64) {
        registry.register_process(
            name,
            ProcessBudget {
                pid: None,
                max_memory_mb,
                health_url: "http://127.0.0.1:1/health".to_string(),
                health_interval_ms: 1000,
                max_health_failures: 3,
                max_restarts: 3,
                location: ProcessLocation::Local,
                consecutive_failures: 0,
                restart_count: 0,
                status: ProcessStatus::Starting,
                started_at: None,
                owner: "system".to_string(),
            },
        );
    }

    #[test]
    fn a014_process_list_processes_returns_registered_snapshots() {
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Performance));
        register_process(&registry, "agentscope", 512);

        let app = mock_builder()
            .manage(registry)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let result = tauri::async_runtime::block_on(super::list_processes(
            app.state::<Arc<BudgetRegistry>>(),
        ))
        .expect("list processes");

        let processes = result.as_array().expect("array response");
        assert!(processes
            .iter()
            .any(|entry| entry.get("name").and_then(|v| v.as_str()) == Some("agentscope")));
    }

    #[test]
    fn a014_commands_process_logs_direct_tail_and_clear_paths() {
        let temp = tempfile::tempdir().expect("tempdir");
        let logs = Arc::new(ProcessLogs::with_max_lines(temp.path().to_path_buf(), 50));
        logs.push("agentscope", "line-1".to_string());
        logs.push("agentscope", "line-2".to_string());

        let process_mgr = Arc::new(ProcessManager::with_parts(
            Arc::new(Mutex::new(RuntimeState::new())),
            logs,
        ));

        let app = mock_builder()
            .manage(process_mgr)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let tailed = tauri::async_runtime::block_on(super::get_process_logs(
            "agentscope".to_string(),
            10,
            app.state::<Arc<ProcessManager>>(),
        ))
        .expect("tail logs");
        assert_eq!(tailed, vec!["line-1".to_string(), "line-2".to_string()]);

        tauri::async_runtime::block_on(super::clear_process_logs(
            "agentscope".to_string(),
            app.state::<Arc<ProcessManager>>(),
        ))
        .expect("clear logs");

        let tailed_after_clear = tauri::async_runtime::block_on(super::get_process_logs(
            "agentscope".to_string(),
            10,
            app.state::<Arc<ProcessManager>>(),
        ))
        .expect("tail after clear");
        assert!(tailed_after_clear.is_empty());
    }

    #[test]
    fn a014_commands_process_update_config_direct_success_and_missing_error() {
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Performance));
        register_process(&registry, "agentscope", 512);

        let app = mock_builder()
            .manage(registry.clone())
            .build(mock_context(noop_assets()))
            .expect("build app");

        tauri::async_runtime::block_on(super::update_process_config(
            "agentscope".to_string(),
            2048,
            app.state::<Arc<BudgetRegistry>>(),
        ))
        .expect("update config");

        let max_memory = registry
            .supervised
            .processes
            .get("agentscope")
            .expect("process exists")
            .max_memory_mb;
        assert_eq!(max_memory, 2048);

        let err = tauri::async_runtime::block_on(super::update_process_config(
            "missing".to_string(),
            1024,
            app.state::<Arc<BudgetRegistry>>(),
        ))
        .expect_err("missing process should fail");
        assert!(err.contains("not registered"));
    }

    #[test]
    fn a014_commands_process_do_kill_process_returns_runtime_not_running_error() {
        let process_mgr = ProcessManager::new();
        let err = super::do_kill_process("missing", &process_mgr)
            .expect_err("missing process should fail");
        assert!(err.contains("not running"));
    }

    #[test]
    fn a014_commands_process_kill_process_command_propagates_missing_runtime_error() {
        let process_mgr = Arc::new(ProcessManager::new());
        let app = mock_builder()
            .manage(process_mgr)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let err = tauri::async_runtime::block_on(super::kill_process(
            "missing".to_string(),
            app.handle().clone(),
            app.state::<Arc<ProcessManager>>(),
        ))
        .expect_err("missing runtime should fail");
        assert!(err.contains("not running"));
    }

    #[test]
    fn a014_commands_process_supervisor_event_serializes() {
        let event = super::SupervisorEvent {
            event_type: "success".to_string(),
            process: "test-process".to_string(),
            message: "test message".to_string(),
            timestamp: 1234567890,
        };

        let json = serde_json::to_value(&event).expect("serialize event");
        assert_eq!(json["eventType"], "success");
        assert_eq!(json["process"], "test-process");
        assert_eq!(json["message"], "test message");
        assert_eq!(json["timestamp"], 1234567890);
    }

    #[test]
    fn a014_commands_process_emit_supervisor_emits_without_panicking() {
        let app = mock_builder()
            .build(mock_context(noop_assets()))
            .expect("build app");

        super::emit_supervisor(
            app.handle(),
            "success",
            "agentscope",
            "Process killed".to_string(),
        );
    }

    #[test]
    fn t34_restart_process_dispatch_agentscope_returns_ok() {
        let _guard = cwd_lock()
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        let original_cwd = std::env::current_dir().expect("current dir");
        let temp = tempfile::tempdir().expect("tempdir");
        std::env::set_current_dir(temp.path()).expect("set current dir");

        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Performance));
        let process_mgr = Arc::new(ProcessManager::new());
        let settings_dir = tempfile::tempdir().expect("settings temp");
        let settings_mgr = Arc::new(SettingsManager::new(settings_dir.path().to_path_buf()));
        settings_mgr
            .save(&Settings::default())
            .expect("save default settings");

        let app = mock_builder()
            .manage(registry)
            .manage(process_mgr)
            .manage(settings_mgr)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let result = tauri::async_runtime::block_on(super::restart_process(
            "agentscope".to_string(),
            app.handle().clone(),
            app.state::<Arc<BudgetRegistry>>(),
            app.state::<Arc<ProcessManager>>(),
            app.state::<Arc<SettingsManager>>(),
        ));

        std::env::set_current_dir(&original_cwd).expect("restore cwd");

        assert!(result.is_ok());
    }

    #[test]
    fn t34_restart_process_dispatch_litellm_returns_ok() {
        let _guard = cwd_lock()
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        let original_cwd = std::env::current_dir().expect("current dir");
        let temp = tempfile::tempdir().expect("tempdir");
        std::env::set_current_dir(temp.path()).expect("set current dir");

        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Performance));
        let process_mgr = Arc::new(ProcessManager::new());
        let settings_dir = tempfile::tempdir().expect("settings temp");
        let settings_mgr = Arc::new(SettingsManager::new(settings_dir.path().to_path_buf()));
        settings_mgr
            .save(&Settings::default())
            .expect("save default settings");

        let app = mock_builder()
            .manage(registry)
            .manage(process_mgr)
            .manage(settings_mgr)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let result = tauri::async_runtime::block_on(super::restart_process(
            "litellm".to_string(),
            app.handle().clone(),
            app.state::<Arc<BudgetRegistry>>(),
            app.state::<Arc<ProcessManager>>(),
            app.state::<Arc<SettingsManager>>(),
        ));

        std::env::set_current_dir(&original_cwd).expect("restore cwd");

        assert!(result.is_ok());
    }

    #[test]
    fn t34_restart_process_dispatch_returns_error_for_unknown_service() {
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Performance));
        let process_mgr = Arc::new(ProcessManager::new());
        let settings_dir = tempfile::tempdir().expect("settings temp");
        let settings_mgr = Arc::new(SettingsManager::new(settings_dir.path().to_path_buf()));
        settings_mgr
            .save(&Settings::default())
            .expect("save default settings");

        let app = mock_builder()
            .manage(registry)
            .manage(process_mgr)
            .manage(settings_mgr)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let err = tauri::async_runtime::block_on(super::restart_process(
            "unknown".to_string(),
            app.handle().clone(),
            app.state::<Arc<BudgetRegistry>>(),
            app.state::<Arc<ProcessManager>>(),
            app.state::<Arc<SettingsManager>>(),
        ))
        .expect_err("unknown service should fail");

        assert_eq!(err, "Unknown service: unknown");
    }

    #[test]
    fn a014_commands_process_do_kill_process_propagates_missing_runtime_error() {
        let process_mgr = ProcessManager::new();

        let err = super::do_kill_process("missing", &process_mgr)
            .expect_err("missing runtime should fail");
        assert!(err.contains("not running"));
    }

    #[test]
    fn a014_commands_process_now_ms_is_positive_and_monotonic() {
        let t1 = super::now_ms();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let t2 = super::now_ms();

        assert!(t1 > 0);
        assert!(t2 >= t1);
    }
}
