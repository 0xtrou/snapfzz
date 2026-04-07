use serde_json::{json, Value};
use snapfzz_kernel::budget::{self, BudgetRegistry};
use std::sync::Arc;

#[tauri::command]
pub async fn get_batch_interval(
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<u64, String> {
    Ok(registry.batch_interval())
}

#[tauri::command]
pub async fn get_startup_budget(
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<Value, String> {
    let (visible, interactive, timeout) = registry.startup_budget();
    Ok(json!({
        "visible_ms": visible,
        "interactive_ms": interactive,
        "activation_timeout_ms": timeout
    }))
}

#[tauri::command]
pub async fn budget_record_strike(
    plugin_id: String,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<bool, String> {
    registry.record_strike(&plugin_id);
    Ok(registry.is_plugin_disabled(&plugin_id))
}

#[tauri::command]
pub async fn budget_report_violation(
    class: String,
    metric: String,
    actual_ms: f64,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<(), String> {
    eprintln!(
        "[budget] violation: class={class} metric={metric} actual={actual_ms:.1}ms target={}ms",
        registry.batch_interval()
    );
    Ok(())
}

#[tauri::command]
pub async fn budget_snapshot(
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<Value, String> {
    serde_json::to_value(registry.snapshot()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_preset(
    preset_name: String,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<(), String> {
    let hw = budget::detect::detect_hardware();
    let name = match preset_name.as_str() {
        "performance" => budget::preset::PresetName::Performance,
        "balanced" => budget::preset::PresetName::Balanced,
        "battery" => budget::preset::PresetName::Battery,
        _ => return Err(format!("Unknown preset: {preset_name}")),
    };

    let new_preset = budget::preset::build_preset(name, &hw);
    let new_agentscope_max_mb = new_preset.memory.agentscope_max_mb;
    registry.swap_preset(new_preset);

    if let Some(mut entry) = registry.supervised.processes.get_mut("agentscope") {
        entry.max_memory_mb = new_agentscope_max_mb;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_hardware_info() -> Result<Value, String> {
    let hw = budget::detect::detect_hardware();
    Ok(json!({
        "cores": hw.cores,
        "ramGb": hw.ram_gb,
        "onBattery": hw.on_battery
    }))
}
