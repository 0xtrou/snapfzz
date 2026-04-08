use serde_json::{json, Value};
use snapfzz_kernel::budget::{self, preset::PresetName, BudgetRegistry};
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

pub(crate) fn hardware_info_value() -> Value {
    let hw = budget::detect::detect_hardware();
    json!({
        "cores": hw.cores,
        "ramGb": hw.ram_gb,
        "onBattery": hw.on_battery
    })
}

pub(crate) fn apply_preset(registry: &BudgetRegistry, preset_name: &str) -> Result<(), String> {
    let hw = budget::detect::detect_hardware();
    let name = preset_name_from_str(preset_name)?;

    let new_preset = budget::preset::build_preset(name, &hw);
    let new_agentscope_max_mb = new_preset.memory.agentscope_max_mb;
    registry.swap_preset(new_preset);

    if let Some(mut entry) = registry.supervised.processes.get_mut("agentscope") {
        entry.max_memory_mb = new_agentscope_max_mb;
    }

    Ok(())
}

pub(crate) fn do_budget_record_strike(registry: &BudgetRegistry, plugin_id: &str) -> bool {
    registry.record_strike(plugin_id);
    registry.is_plugin_disabled(plugin_id)
}

pub(crate) fn do_budget_snapshot(registry: &BudgetRegistry) -> Result<Value, String> {
    serde_json::to_value(registry.snapshot()).map_err(|e| e.to_string())
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
) -> Result<Value, String> {
    do_budget_snapshot(&registry)
}

#[tauri::command]
pub async fn set_preset(
    preset_name: String,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<(), String> {
    apply_preset(&registry, &preset_name)
}

#[tauri::command]
pub async fn get_hardware_info() -> Result<Value, String> {
    Ok(hardware_info_value())
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
    use std::sync::Arc;
    use tauri::{
        test::{mock_builder, mock_context, noop_assets},
        Manager,
    };

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
    fn a008_commands_budget_hardware_info_value_serializes_detected_shape() {
        let value = hardware_info_value();
        assert!(value.get("cores").and_then(|v| v.as_u64()).is_some());
        assert!(value.get("ramGb").and_then(|v| v.as_u64()).is_some());
        assert!(value.get("onBattery").and_then(|v| v.as_bool()).is_some());
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
        register_process(&registry, "agentscope", 1);

        apply_preset(&registry, "performance").expect("apply preset");

        let snapshot = registry.snapshot();
        assert_eq!(snapshot.preset_name, "performance");
        let entry = registry
            .supervised
            .processes
            .get("agentscope")
            .expect("agentscope process");
        assert_eq!(entry.max_memory_mb, snapshot.agentscope_max_mb);
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
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Balanced));
        let app = mock_builder()
            .manage(registry.clone())
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
        let value = tauri::async_runtime::block_on(get_hardware_info()).expect("hardware info");
        assert!(value.get("cores").and_then(|v| v.as_u64()).is_some());
        assert!(value.get("ramGb").and_then(|v| v.as_u64()).is_some());
        assert!(value.get("onBattery").and_then(|v| v.as_bool()).is_some());
    }
}
