use serde_json::{json, Value};
use snapfzz_kernel::budget::{self, device::DeviceInfo, metrics::{ProcessSnapshot, ProcessStatus}, preset::PresetName, BudgetRegistry};
use snapfzz_kernel::process::ProcessFactoryRegistry;
use std::sync::Arc;

pub(crate) fn preset_name_from_str(preset_name: &str) -> Result<PresetName, String> {
    match preset_name {
        "performance" => Ok(PresetName::Performance),
        "balanced" => Ok(PresetName::Balanced),
        "battery" => Ok(PresetName::Battery),
        _ => Err(format!("Unknown preset: {preset_name}")),
    }
}

pub(crate) fn startup_budget_value(registry: &BudgetRegistry) -> Value {
    let (visible, interactive, timeout) = registry.startup_budget();
    json!({
        "visible_ms": visible,
        "interactive_ms": interactive,
        "activation_timeout_ms": timeout
    })
}

pub(crate) fn hardware_info_value_from_device(device: &DeviceInfo) -> Value {
    json!({
        "os": device.os,
        "arch": device.arch,
        "platform": device.platform,
        "platformDisplay": device.platform_display,
        "cores": device.cores,
        "ramGb": device.ram_gb,
        "onBattery": device.on_battery
    })
}

pub(crate) fn apply_preset(registry: &BudgetRegistry, preset_name: &str) -> Result<(), String> {
    let device = budget::device::detect_device();
    apply_preset_with_device(registry, preset_name, &device)
}

pub(crate) fn apply_preset_with_device(
    registry: &BudgetRegistry,
    preset_name: &str,
    device: &DeviceInfo,
) -> Result<(), String> {
    let hw = budget::detect::HardwareInfo::from(device);
    let name = preset_name_from_str(preset_name)?;

    let new_preset = budget::preset::build_preset(name, &hw);
    registry.swap_preset(new_preset);

    Ok(())
}

pub(crate) fn do_budget_record_strike(registry: &BudgetRegistry, plugin_id: &str) -> bool {
    registry.record_strike(plugin_id);
    registry.is_plugin_disabled(plugin_id)
}

pub(crate) fn do_budget_report_violation(
    class: String,
    metric: String,
    actual_ms: f64,
    registry: &BudgetRegistry,
) {
    eprintln!(
        "[budget] violation: class={class} metric={metric} actual={actual_ms:.1}ms target={}ms",
        registry.batch_interval()
    );
}

pub(crate) fn batch_interval(registry: &BudgetRegistry) -> u64 {
    registry.batch_interval()
}

#[tauri::command]
pub async fn get_batch_interval(
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<u64, String> {
    Ok(batch_interval(&registry))
}

#[tauri::command]
pub async fn get_startup_budget(
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<Value, String> {
    Ok(startup_budget_value(&registry))
}

#[tauri::command]
pub async fn budget_record_strike(
    plugin_id: String,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<bool, String> {
    Ok(do_budget_record_strike(&registry, &plugin_id))
}

#[tauri::command]
pub async fn budget_report_violation(
    class: String,
    metric: String,
    actual_ms: f64,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<(), String> {
    do_budget_report_violation(class, metric, actual_ms, &registry);
    Ok(())
}

#[tauri::command]
pub async fn budget_snapshot(
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
    factory_registry: tauri::State<'_, Arc<tokio::sync::Mutex<ProcessFactoryRegistry>>>,
    postgres_runtime: tauri::State<'_, Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>>>,
) -> Result<Value, String> {
    // A039/PostgresSnapshot: Surface PostgreSQL in process list
    let mut metrics = registry.snapshot();
    // A037/budget_snapshot: Override processes with ProcessFactoryRegistry so all known
    // services appear (including Stopped/not-yet-spawned), not just ones in supervised domain.
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

    metrics.processes = processes;
    serde_json::to_value(metrics).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_preset(
    preset_name: String,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<(), String> {
    apply_preset(&registry, &preset_name)
}

#[tauri::command]
pub async fn get_hardware_info(
    device: tauri::State<'_, Arc<DeviceInfo>>,
) -> Result<Value, String> {
    Ok(hardware_info_value_from_device(&device))
}

#[cfg(test)]
mod tests {
    use super::*;
    use snapfzz_kernel::budget::{
        metrics::ProcessStatus,
        preset::PresetName,
        supervised::{ProcessBudget, ProcessLocation},
        BudgetRegistry,
    };
    use snapfzz_kernel::process::{logs::ProcessLogs, runtime::RuntimeState, ProcessFactoryRegistry, ProcessManager};
    use snapfzz_kernel::settings::SettingsManager;
    use snapfzz_packs::{detect_platform, runtime::python::PythonRuntime};
    use std::sync::Arc;
    use tauri::{
        test::{mock_builder, mock_context, noop_assets},
        Manager,
    };

    fn empty_postgres_runtime() -> Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>> {
        Arc::new(tokio::sync::Mutex::new(None))
    }

    fn empty_factory_registry(data_dir: &std::path::Path) -> Arc<tokio::sync::Mutex<ProcessFactoryRegistry>> {
        let logs = Arc::new(ProcessLogs::with_max_lines(data_dir.to_path_buf(), 100));
        let process_mgr = Arc::new(ProcessManager::with_parts(
            Arc::new(tokio::sync::Mutex::new(RuntimeState::new())),
            logs,
        ));
        let platform = detect_platform().expect("platform");
        let python_runtime = Arc::new(PythonRuntime::new(data_dir.join("runtime"), platform));
        Arc::new(tokio::sync::Mutex::new(ProcessFactoryRegistry::new(
            Arc::new(BudgetRegistry::from_hardware()),
            process_mgr,
            Arc::new(SettingsManager::new(data_dir.to_path_buf())),
            python_runtime,
        )))
    }

    fn do_budget_snapshot(registry: &BudgetRegistry) -> Result<Value, String> {
        serde_json::to_value(registry.snapshot()).map_err(|e| e.to_string())
    }

    fn register_process(registry: &Arc<BudgetRegistry>, name: &str) {
        registry.register_process(
            name,
            ProcessBudget {
                pid: None,
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
    fn a008_commands_budget_preset_name_from_str_accepts_all_known_presets() {
        assert!(matches!(preset_name_from_str("performance"), Ok(PresetName::Performance)));
        assert!(matches!(preset_name_from_str("balanced"), Ok(PresetName::Balanced)));
        assert!(matches!(preset_name_from_str("battery"), Ok(PresetName::Battery)));
    }

    #[test]
    fn a008_commands_budget_preset_name_from_str_rejects_unknown_preset() {
        let err = preset_name_from_str("turbo").expect_err("unknown preset must fail");
        assert!(err.contains("Unknown preset: turbo"));
    }

    #[test]
    fn a008_commands_budget_startup_budget_value_serializes_expected_fields() {
        let registry = BudgetRegistry::with_preset_name(PresetName::Performance);
        let value = startup_budget_value(&registry);

        assert_eq!(value["visible_ms"], 200);
        assert_eq!(value["interactive_ms"], 500);
        assert_eq!(value["activation_timeout_ms"], 5000);
    }

    #[test]
    fn a008_commands_budget_hardware_info_value_from_device_serializes_all_device_fields() {
        let device = DeviceInfo {
            os: "linux".to_string(),
            arch: "x86_64".to_string(),
            platform: "linux-x64".to_string(),
            platform_display: "Linux (x86_64)".to_string(),
            cores: 12,
            ram_gb: 32,
            on_battery: false,
        };

        let value = hardware_info_value_from_device(&device);

        assert_eq!(value["os"], "linux");
        assert_eq!(value["arch"], "x86_64");
        assert_eq!(value["platform"], "linux-x64");
        assert_eq!(value["platformDisplay"], "Linux (x86_64)");
        assert_eq!(value["cores"], 12);
        assert_eq!(value["ramGb"], 32);
        assert_eq!(value["onBattery"], false);
    }

    #[test]
    fn a008_commands_budget_do_budget_record_strike_disables_after_three_strikes() {
        let registry = BudgetRegistry::with_preset_name(PresetName::Performance);
        assert!(!do_budget_record_strike(&registry, "plugin.test"));
        assert!(!do_budget_record_strike(&registry, "plugin.test"));
        assert!(do_budget_record_strike(&registry, "plugin.test"));
        assert!(registry.is_plugin_disabled("plugin.test"));
    }

    #[test]
    fn a008_commands_budget_do_budget_snapshot_serializes_registry_metrics() {
        let registry = BudgetRegistry::with_preset_name(PresetName::Balanced);
        let value = do_budget_snapshot(&registry).expect("snapshot value");
        assert_eq!(value["presetName"], "balanced");
        assert!(value["processes"].is_array());
    }

    #[test]
    fn a008_commands_budget_apply_preset_updates_registry_and_agentscope_budget() {
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Battery));
        register_process(&registry, "agentscope");

        apply_preset(&registry, "performance").expect("apply preset");

        let snapshot = registry.snapshot();
        assert_eq!(snapshot.preset_name, "performance");
        assert!(snapshot.app_total_mb > 0);
    }

    #[test]
    fn a008_commands_budget_apply_preset_with_device_uses_device_derived_hardware() {
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Battery));
        register_process(&registry, "agentscope");
        let device = DeviceInfo {
            os: "linux".to_string(),
            arch: "x86_64".to_string(),
            platform: "linux-x64".to_string(),
            platform_display: "Linux (x86_64)".to_string(),
            cores: 16,
            ram_gb: 64,
            on_battery: false,
        };

        apply_preset_with_device(&registry, "performance", &device)
            .expect("apply preset with explicit device");

        let snapshot = registry.snapshot();
        assert_eq!(snapshot.preset_name, "performance");
    }

    #[test]
    fn a008_commands_budget_apply_preset_rejects_unknown_name() {
        let registry = BudgetRegistry::with_preset_name(PresetName::Performance);
        let err = apply_preset(&registry, "turbo").expect_err("unknown preset");
        assert!(err.contains("Unknown preset: turbo"));
    }

    #[test]
    fn a008_commands_budget_batch_interval_reads_from_registry() {
        let registry = BudgetRegistry::with_preset_name(PresetName::Battery);
        assert_eq!(batch_interval(&registry), 33);
    }

    #[test]
    fn a008_commands_budget_ipc_commands_return_expected_values() {
        let temp = tempfile::tempdir().expect("tempdir");
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Balanced));
        let factory_registry = empty_factory_registry(temp.path());
        let postgres_runtime = empty_postgres_runtime();
        let app = mock_builder()
            .manage(registry.clone())
            .manage(factory_registry)
            .manage(postgres_runtime)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let interval = tauri::async_runtime::block_on(get_batch_interval(
            app.state::<Arc<BudgetRegistry>>(),
        ))
        .expect("batch interval");
        assert_eq!(interval, 16);

        let startup = tauri::async_runtime::block_on(get_startup_budget(
            app.state::<Arc<BudgetRegistry>>(),
        ))
        .expect("startup budget");
        assert_eq!(startup["visible_ms"], 200);

        let snapshot = tauri::async_runtime::block_on(budget_snapshot(
            app.state::<Arc<BudgetRegistry>>(),
            app.state::<Arc<tokio::sync::Mutex<ProcessFactoryRegistry>>>(),
            app.state::<Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>>>(),
        ))
        .expect("budget snapshot");
        assert_eq!(snapshot["presetName"], "balanced");

        let disabled = tauri::async_runtime::block_on(budget_record_strike(
            "plugin.ipc".to_string(),
            app.state::<Arc<BudgetRegistry>>(),
        ))
        .expect("record strike");
        assert!(!disabled);

        tauri::async_runtime::block_on(set_preset(
            "battery".to_string(),
            app.state::<Arc<BudgetRegistry>>(),
        ))
        .expect("set preset");
        assert_eq!(registry.snapshot().preset_name, "battery");
    }

    #[test]
    fn a008_commands_budget_ipc_budget_report_violation_returns_ok() {
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Balanced));
        let app = mock_builder()
            .manage(registry)
            .build(mock_context(noop_assets()))
            .expect("build app");

        tauri::async_runtime::block_on(budget_report_violation(
            "frame".to_string(),
            "render".to_string(),
            20.5,
            app.state::<Arc<BudgetRegistry>>(),
        ))
        .expect("violation logging should succeed");
    }

    #[test]
    fn a008_commands_budget_get_hardware_info_returns_shape() {
        let app = mock_builder()
            .manage(Arc::new(DeviceInfo {
                os: "linux".to_string(),
                arch: "x86_64".to_string(),
                platform: "linux-x64".to_string(),
                platform_display: "Linux (x86_64)".to_string(),
                cores: 12,
                ram_gb: 32,
                on_battery: false,
            }))
            .build(mock_context(noop_assets()))
            .expect("build app");

        let value = tauri::async_runtime::block_on(get_hardware_info(
            app.state::<Arc<DeviceInfo>>(),
        ))
        .expect("hardware info");
        assert!(value.get("os").and_then(|v| v.as_str()).is_some());
        assert!(value.get("arch").and_then(|v| v.as_str()).is_some());
        assert!(value.get("platform").and_then(|v| v.as_str()).is_some());
        assert!(value.get("platformDisplay").and_then(|v| v.as_str()).is_some());
        assert!(value.get("cores").and_then(|v| v.as_u64()).is_some());
        assert!(value.get("ramGb").and_then(|v| v.as_u64()).is_some());
        assert!(value.get("onBattery").and_then(|v| v.as_bool()).is_some());
    }
}
