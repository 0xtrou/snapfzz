use serde::Serialize;
use serde_json::Value;
use snapfzz_kernel::budget::metrics::{ProcessSnapshot, ProcessStatus};
use snapfzz_kernel::process::{ProcessFactoryRegistry, ProcessManager};
use std::sync::Arc;
use tauri::Emitter;

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
    factory_registry: tauri::State<'_, Arc<tokio::sync::Mutex<ProcessFactoryRegistry>>>,
    postgres_runtime: tauri::State<'_, Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>>>,
) -> Result<Value, String> {
    // A039/PostgresSnapshot: Surface PostgreSQL in process list
    // A037/list_processes: Read from ProcessFactoryRegistry so all known services appear,
    // including those that are Stopped or failed to start — not just running ones.
    let mut processes = factory_registry.lock().await.list_snapshots();

    // A039/PostgresMetrics: Append PostgreSQL snapshot with real PID, memory, uptime, and health URL.
    let pg = postgres_runtime.lock().await;
    let pg_snapshot = if let Some(ref pg) = *pg {
        ProcessSnapshot {
            name: "postgresql".to_string(),
            pid: pg.pid(),
            status: if pg.is_ready() { ProcessStatus::Online } else { ProcessStatus::Stopped },
            rss_mb: pg.rss_mb(),
            cpu_pct: None,
            restart_count: 0,
            consecutive_failures: 0,
            uptime_secs: pg.uptime_secs(),
            location: "local".to_string(),
            health_url: pg.health_url().await,
            owner: "system".to_string(),
        }
    } else {
        ProcessSnapshot::stopped("postgresql", "system")
    };
    processes.push(pg_snapshot);

    serde_json::to_value(processes).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_process_logs(
    name: String,
    tail_n: usize,
    process_mgr: tauri::State<'_, Arc<ProcessManager>>,
    postgres_runtime: tauri::State<'_, Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>>>,
) -> Result<Vec<String>, String> {
    // A039/PostgresLogs: Read PostgreSQL logs from its log file, not the in-memory ring buffer.
    if name == "postgresql" {
        let pg = postgres_runtime.lock().await;
        if let Some(ref pg) = *pg {
            let log_path = pg.log_file_path();
            if log_path.exists() {
                let content = std::fs::read_to_string(&log_path).unwrap_or_default();
                let lines: Vec<String> = content.lines().map(String::from).collect();
                let start = lines.len().saturating_sub(tail_n);
                return Ok(lines[start..].to_vec());
            }
        }
        // Fallback: try the old start.log
        let start_log = std::path::PathBuf::from(
            std::env::var("HOME").unwrap_or_default()
        ).join(".snapfzz/data/postgres/start.log");
        if start_log.exists() {
            let content = std::fs::read_to_string(&start_log).unwrap_or_default();
            let lines: Vec<String> = content.lines().map(String::from).collect();
            let start = lines.len().saturating_sub(tail_n);
            return Ok(lines[start..].to_vec());
        }
        return Ok(vec![]);
    }
    Ok(process_mgr.logs.tail(&name, tail_n))
}

#[tauri::command]
pub async fn clear_process_logs(
    name: String,
    process_mgr: tauri::State<'_, Arc<ProcessManager>>,
    postgres_runtime: tauri::State<'_, Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>>>,
) -> Result<(), String> {
    // A039/PostgresLogs: Clear PostgreSQL log file directly.
    if name == "postgresql" {
        let pg = postgres_runtime.lock().await;
        if let Some(ref pg) = *pg {
            let _ = std::fs::write(pg.log_file_path(), "");
        }
        return Ok(());
    }
    process_mgr.logs.clear(&name);
    Ok(())
}

#[tauri::command]
pub async fn restart_process<R: tauri::Runtime>(
    name: String,
    app: tauri::AppHandle<R>,
    factory_registry: tauri::State<'_, Arc<tokio::sync::Mutex<ProcessFactoryRegistry>>>,
    postgres_runtime: tauri::State<'_, Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>>>,
) -> Result<(), String> {
    // A039/PostgresRestart: PostgreSQL is managed outside the factory registry.
    // Tolerates being called after kill — stop() errors are ignored since PG may already be down.
    if name == "postgresql" {
        let mut pg_guard = postgres_runtime.lock().await;
        if let Some(ref mut pg) = *pg_guard {
            // Stop gracefully — ignore errors (PG may already be stopped after kill)
            if let Err(e) = pg.stop().await {
                eprintln!("[postgres] stop on restart (ignored): {e}");
            }
            pg.start().await.map_err(|e| e.to_string())?;
            if let Err(e) = pg.create_database("litellm").await {
                eprintln!("[postgres] create litellm db on restart: {e}");
            }
            emit_supervisor(&app, "success", &name, "postgresql restarted successfully".into());
            return Ok(());
        }
        return Err("postgresql is not running".into());
    }

    let mut registry = factory_registry.lock().await;
    let result = registry.restart(&name).await;
    match result {
        Ok(()) => {
            emit_supervisor(&app, "success", &name, format!("{} restarted successfully", name));
            Ok(())
        }
        Err(e) => {
            emit_supervisor(&app, "error", &name, format!("Failed to restart {}: {}", name, e));
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn kill_process<R: tauri::Runtime>(
    name: String,
    app: tauri::AppHandle<R>,
    factory_registry: tauri::State<'_, Arc<tokio::sync::Mutex<ProcessFactoryRegistry>>>,
    postgres_runtime: tauri::State<'_, Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>>>,
) -> Result<(), String> {
    // A039/PostgresKill: PostgreSQL is managed outside the factory registry.
    if name == "postgresql" {
        let mut pg_guard = postgres_runtime.lock().await;
        if let Some(ref mut pg) = *pg_guard {
            if let Err(e) = pg.stop().await {
                eprintln!("[postgres] stop on kill (ignored): {e}");
            }
            emit_supervisor(&app, "success", &name, "postgresql killed".into());
            return Ok(());
        }
        return Err("postgresql is not running".into());
    }

    let mut registry = factory_registry.lock().await;
    let result = registry.kill(&name).await;
    match result {
        Ok(()) => {
            emit_supervisor(&app, "success", &name, format!("{} killed", name));
            Ok(())
        }
        Err(e) => {
            emit_supervisor(&app, "error", &name, format!("Failed to kill {}: {}", name, e));
            Err(e.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use snapfzz_kernel::budget::{preset::PresetName, BudgetRegistry};
    use snapfzz_kernel::process::{logs::ProcessLogs, runtime::RuntimeState, ProcessFactoryRegistry};

    fn do_kill_process(name: &str, process_mgr: &ProcessManager) -> Result<String, String> {
        process_mgr.kill(name).map_err(|e| e.to_string())?;
        Ok("Process killed".to_string())
    }
    use snapfzz_kernel::settings::SettingsManager;
    use snapfzz_packs::{detect_platform, runtime::python::PythonRuntime};
    use std::sync::Arc;
    use tauri::{
        test::{mock_builder, mock_context, noop_assets},
        Manager,
    };
    use tokio::sync::Mutex;

    fn make_factory_registry(
        data_dir: &std::path::Path,
    ) -> Arc<tokio::sync::Mutex<ProcessFactoryRegistry>> {
        let budget_registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Performance));
        let logs = Arc::new(ProcessLogs::with_max_lines(data_dir.to_path_buf(), 100));
        let settings_mgr = Arc::new(SettingsManager::new(data_dir.to_path_buf()));
        let platform = detect_platform().expect("platform");
        let python_runtime = Arc::new(PythonRuntime::new(data_dir.join("runtime"), platform));
        let process_mgr = Arc::new(ProcessManager::with_parts(
            Arc::new(tokio::sync::Mutex::new(RuntimeState::new())),
            logs,
        ));
        
        let master_key = snapfzz_vault::load_or_generate_master_key(data_dir).expect("master key");
        let vault = snapfzz_vault::SecretVault::open(&master_key, data_dir.join("vault.enc"))
            .unwrap_or_else(|_| snapfzz_vault::SecretVault::empty(data_dir.join("vault.enc")));
        let vault = Arc::new(std::sync::Mutex::new(vault));

        let mut registry = ProcessFactoryRegistry::new(
            budget_registry,
            process_mgr,
            settings_mgr,
            python_runtime.clone(),
        );
        registry.register(Arc::new(crate::factories::AgentScopeFactory::new(
            python_runtime.clone(),
            data_dir.to_path_buf(),
        )));
        registry.register(Arc::new(crate::factories::LiteLLMFactory::new(
            python_runtime,
            vault,
            data_dir.to_path_buf(),
        )));
        Arc::new(tokio::sync::Mutex::new(registry))
    }

    #[test]
    fn a014_process_list_processes_returns_registered_snapshots() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory_registry = make_factory_registry(temp.path());
        let postgres_runtime: Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>> =
            Arc::new(tokio::sync::Mutex::new(None));

        let app = mock_builder()
            .manage(factory_registry)
            .manage(postgres_runtime)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let result = tauri::async_runtime::block_on(super::list_processes(
            app.state::<Arc<tokio::sync::Mutex<ProcessFactoryRegistry>>>(),
            app.state::<Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>>>(),
        ))
        .expect("list processes");

        // Factory registry has agentscope + litellm registered; list_processes returns all known
        // services regardless of running state.
        let processes = result.as_array().expect("array response");
        assert!(
            processes
                .iter()
                .any(|entry| entry.get("name").and_then(|v| v.as_str()) == Some("litellm")),
            "litellm should appear in process list"
        );
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
        let postgres_runtime: Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>> =
            Arc::new(tokio::sync::Mutex::new(None));

        let app = mock_builder()
            .manage(process_mgr)
            .manage(postgres_runtime)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let pg_state = app.state::<Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>>>();

        let tailed = tauri::async_runtime::block_on(super::get_process_logs(
            "agentscope".to_string(),
            10,
            app.state::<Arc<ProcessManager>>(),
            pg_state.clone(),
        ))
        .expect("tail logs");
        assert_eq!(tailed, vec!["line-1".to_string(), "line-2".to_string()]);

        tauri::async_runtime::block_on(super::clear_process_logs(
            "agentscope".to_string(),
            app.state::<Arc<ProcessManager>>(),
            pg_state.clone(),
        ))
        .expect("clear logs");

        let tailed_after_clear = tauri::async_runtime::block_on(super::get_process_logs(
            "agentscope".to_string(),
            10,
            app.state::<Arc<ProcessManager>>(),
            pg_state,
        ))
        .expect("tail after clear");
        assert!(tailed_after_clear.is_empty());
    }

    #[test]
    fn a014_commands_process_do_kill_process_returns_runtime_not_running_error() {
        let process_mgr = ProcessManager::new();
        let err = do_kill_process("missing", &process_mgr)
            .expect_err("missing process should fail");
        assert!(err.contains("not running"));
    }

    #[test]
    fn a014_commands_process_kill_process_command_propagates_missing_runtime_error() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory_registry = make_factory_registry(temp.path());
        let postgres_runtime: Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>> =
            Arc::new(tokio::sync::Mutex::new(None));

        let app = mock_builder()
            .manage(factory_registry)
            .manage(postgres_runtime)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let err = tauri::async_runtime::block_on(super::kill_process(
            "missing".to_string(),
            app.handle().clone(),
            app.state::<Arc<tokio::sync::Mutex<ProcessFactoryRegistry>>>(),
            app.state::<Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>>>(),
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
    fn t37_restart_process_returns_error_for_unknown_service() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory_registry = make_factory_registry(temp.path());
        let postgres_runtime: Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>> =
            Arc::new(tokio::sync::Mutex::new(None));

        let app = mock_builder()
            .manage(factory_registry)
            .manage(postgres_runtime)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let err = tauri::async_runtime::block_on(super::restart_process(
            "unknown".to_string(),
            app.handle().clone(),
            app.state::<Arc<tokio::sync::Mutex<ProcessFactoryRegistry>>>(),
            app.state::<Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>>>(),
        ))
        .expect_err("unknown service should fail");

        assert!(err.contains("unknown process factory"));
    }

    #[test]
    fn a014_commands_process_do_kill_process_propagates_missing_runtime_error() {
        let process_mgr = ProcessManager::new();

        let err = do_kill_process("missing", &process_mgr)
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
