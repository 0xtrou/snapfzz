#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod fonts;
mod menus;
mod metrics;
mod open_path;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use snapfzz_kernel::boot::{
    OnPreflightInit, OnPreflightReady, Phase, PhaseTimingDto, PreflightContext, PreflightError,
    PreflightService,
};
use snapfzz_kernel::budget::{self, BudgetRegistry};
use snapfzz_kernel::process::{self, ProcessManager, SpawnConfig};
use snapfzz_kernel::settings::{Settings, SettingsManager};
use snapfzz_stream::{send_and_consume, ContentBlockBatch, MessageResult, StreamError};
use snapfzz_vault::{load_or_generate_master_key, SecretVault};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::{Emitter, Manager, RunEvent};

const AGENTSCOPE_PORT: u16 = 8090;
const PROCESS_LOG_MAX_LINES: usize = 1000;

#[derive(Serialize, Debug)]
struct HealthStatus {
    status: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SessionInfo {
    #[serde(alias = "session_id", alias = "sessionId")]
    session_id: String,
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

fn spawn_failure(err: impl ToString) -> String {
    format!("Failed to start AgentScope Runtime: {}", err.to_string())
}

fn agentscope_base_url(settings_mgr: &SettingsManager) -> String {
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
    for c in [
        cwd.join("intelligence"),
        cwd.join("..").join("intelligence"),
        cwd.join("../..").join("intelligence"),
    ] {
        if c.join("pyproject.toml").exists() {
            return Ok(c);
        }
    }
    Err("Unable to find intelligence/ directory".to_string())
}

fn resolve_spawn_config(settings_mgr: &SettingsManager) -> Result<SpawnConfig, String> {
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

fn emit_supervisor(app: &tauri::AppHandle, event_type: &str, process: &str, message: String) {
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

fn ensure_system_vault_caller(plugin_id: Option<&str>) -> Result<(), String> {
    if plugin_id.is_some() {
        return Err("Vault access denied: plugins cannot access the system vault".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn send_message(text: String, session_id: String, plugin_id: Option<String>, on_token: Channel<ContentBlockBatch>, registry: tauri::State<'_, Arc<BudgetRegistry>>, settings_mgr: tauri::State<'_, Arc<SettingsManager>>) -> Result<MessageResult, String> {
    let caller = plugin_id.as_deref().unwrap_or("unknown");
    let _invoke = registry.try_acquire_invoke(caller).ok_or_else(|| format!("Budget exhausted: plugin '{caller}' invoke denied"))?;
    let _cpu = registry.try_acquire_cpu().ok_or_else(|| "Budget exhausted: CPU permits unavailable for SSE parsing".to_string())?;
    send_and_consume(&format!("{}/process", agentscope_base_url(&settings_mgr)), &text, &session_id, registry.batch_rate(), |batch| {
        on_token.send(batch).map_err(|e| StreamError::ChannelSend(e.to_string()))
    }).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_generation(session_id: String, settings_mgr: tauri::State<'_, Arc<SettingsManager>>) -> Result<(), String> {
    reqwest::Client::new().post(format!("{}/stop", agentscope_base_url(&settings_mgr))).json(&json!({"session_id": session_id}))
        .send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn create_session(template_id: Option<String>, settings_mgr: tauri::State<'_, Arc<SettingsManager>>) -> Result<SessionInfo, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/session", agentscope_base_url(&settings_mgr));
    let req = match template_id { Some(tid) => client.post(&url).json(&json!({"template_id": tid})), None => client.post(&url) };
    req.send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.json::<SessionInfo>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_session(session_id: String, settings_mgr: tauri::State<'_, Arc<SettingsManager>>) -> Result<Value, String> {
    reqwest::Client::new().get(format!("{}/session/{session_id}", agentscope_base_url(&settings_mgr)))
        .send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn agent_health(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<HealthStatus, String> { Ok(HealthStatus { status: if registry.supervised.check_health("agentscope").await { "connected" } else { "disconnected" }.into() }) }
#[tauri::command]
async fn get_settings(settings_mgr: tauri::State<'_, Arc<SettingsManager>>) -> Result<Settings, String> { settings_mgr.load().map_err(|e| e.to_string()) }
#[tauri::command]
async fn save_settings(app: tauri::AppHandle, settings_mgr: tauri::State<'_, Arc<SettingsManager>>, settings: Settings) -> Result<(), String> { settings_mgr.save(&settings).map_err(|e| e.to_string())?; let _ = app.emit("settings-changed", ()); Ok(()) }
#[tauri::command]
async fn vault_store(vault: tauri::State<'_, Arc<Mutex<SecretVault>>>, key: String, value: String, plugin_id: Option<String>) -> Result<(), String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let mut guard = vault.lock().unwrap();
    if !guard.is_initialized() {
        return Err("Vault not initialized — restart the app to regenerate the master key".to_string());
    }
    guard.store(&key, value.as_bytes()).map_err(|e| e.to_string())
}
#[tauri::command]
async fn vault_read(vault: tauri::State<'_, Arc<Mutex<SecretVault>>>, key: String, plugin_id: Option<String>) -> Result<String, String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let mut guard = vault.lock().unwrap();
    if !guard.is_initialized() {
        return Err("Vault not initialized — restart the app to regenerate the master key".to_string());
    }
    let bytes = guard.read(&key).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}
#[tauri::command]
async fn vault_delete(vault: tauri::State<'_, Arc<Mutex<SecretVault>>>, key: String, plugin_id: Option<String>) -> Result<(), String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let mut guard = vault.lock().unwrap();
    if !guard.is_initialized() {
        return Err("Vault not initialized — restart the app to regenerate the master key".to_string());
    }
    guard.delete(&key).map_err(|e| e.to_string())
}
#[tauri::command]
async fn vault_list(vault: tauri::State<'_, Arc<Mutex<SecretVault>>>, plugin_id: Option<String>) -> Result<Vec<String>, String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let mut guard = vault.lock().unwrap();
    if !guard.is_initialized() {
        return Err("Vault not initialized — restart the app to regenerate the master key".to_string());
    }
    guard.list().map_err(|e| e.to_string())
}
#[tauri::command]
async fn vault_has(vault: tauri::State<'_, Arc<Mutex<SecretVault>>>, key: String, plugin_id: Option<String>) -> Result<bool, String> {
    ensure_system_vault_caller(plugin_id.as_deref())?;
    let guard = vault.lock().unwrap();
    if !guard.is_initialized() {
        return Err("Vault not initialized — restart the app to regenerate the master key".to_string());
    }
    Ok(guard.has(&key))
}
#[tauri::command]
async fn get_batch_interval(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<u64, String> { Ok(registry.batch_interval()) }
#[tauri::command]
async fn get_startup_budget(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<Value, String> { let (visible, interactive, timeout) = registry.startup_budget(); Ok(json!({"visible_ms": visible, "interactive_ms": interactive, "activation_timeout_ms": timeout})) }
#[tauri::command]
async fn budget_record_strike(plugin_id: String, registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<bool, String> { registry.record_strike(&plugin_id); Ok(registry.is_plugin_disabled(&plugin_id)) }
#[tauri::command]
async fn budget_report_violation(class: String, metric: String, actual_ms: f64, registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<(), String> { eprintln!("[budget] violation: class={class} metric={metric} actual={actual_ms:.1}ms target={}ms", registry.batch_interval()); Ok(()) }
#[tauri::command]
async fn budget_snapshot(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<Value, String> { serde_json::to_value(registry.snapshot()).map_err(|e| e.to_string()) }

#[tauri::command]
async fn set_preset(preset_name: String, registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<(), String> {
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
    if let Some(mut entry) = registry.supervised.processes.get_mut("agentscope") { entry.max_memory_mb = new_agentscope_max_mb; }
    Ok(())
}

#[tauri::command]
async fn pick_folder(default_path: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(path) = default_path { dialog = dialog.set_directory(path); }
    Ok(dialog.pick_folder().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
async fn open_path(path: String) -> Result<(), String> {
    open_path::validate_open_path_target(&path)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_data_dir() -> Result<String, String> { Ok(fonts::resolve_data_dir().to_string_lossy().to_string()) }
#[tauri::command]
async fn set_data_dir(new_path: String) -> Result<(), String> { std::fs::create_dir_all(PathBuf::from(&new_path)).map_err(|e| e.to_string())?; let pointer_path = dirs::home_dir().unwrap_or_default().join(".snapfzz").join("pointer.json"); if let Some(parent) = pointer_path.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; } std::fs::write(pointer_path, serde_json::to_string_pretty(&json!({"dataDir": new_path})).map_err(|e| e.to_string())?).map_err(|e| e.to_string()) }
#[tauri::command]
async fn open_preferences(app: tauri::AppHandle) -> Result<(), String> { use tauri::{WebviewUrl, WebviewWindowBuilder}; if let Some(window) = app.get_webview_window("preferences") { window.show().map_err(|e: tauri::Error| e.to_string())?; window.set_focus().map_err(|e: tauri::Error| e.to_string())?; return Ok(()); } let url = if cfg!(debug_assertions) { WebviewUrl::External("http://localhost:5175".parse().unwrap()) } else { WebviewUrl::App("preferences.html".into()) }; WebviewWindowBuilder::new(&app, "preferences", url).title("Snapfzz Preferences").inner_size(1280.0, 800.0).min_inner_size(800.0, 600.0).title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true).center().build().map_err(|e| e.to_string())?; Ok(()) }
#[tauri::command]
async fn list_processes(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<Value, String> { serde_json::to_value(registry.snapshot().processes).map_err(|e| e.to_string()) }
#[tauri::command]
async fn get_process_logs(name: String, tail_n: usize, process_mgr: tauri::State<'_, Arc<ProcessManager>>) -> Result<Vec<String>, String> { Ok(process_mgr.logs.tail(&name, tail_n)) }
#[tauri::command]
async fn clear_process_logs(name: String, process_mgr: tauri::State<'_, Arc<ProcessManager>>) -> Result<(), String> { process_mgr.logs.clear(&name); Ok(()) }
#[tauri::command]
async fn restart_process(name: String, app: tauri::AppHandle, registry: tauri::State<'_, Arc<BudgetRegistry>>, process_mgr: tauri::State<'_, Arc<ProcessManager>>, settings_mgr: tauri::State<'_, Arc<SettingsManager>>) -> Result<(), String> { process_mgr.restart(&name, &resolve_spawn_config(&settings_mgr)?, &registry).await.map_err(|e| e.to_string())?; emit_supervisor(&app, "success", &name, "AgentScope Runtime restarted successfully".into()); Ok(()) }
#[tauri::command]
async fn kill_process(name: String, app: tauri::AppHandle, process_mgr: tauri::State<'_, Arc<ProcessManager>>) -> Result<(), String> { process_mgr.kill(&name).map_err(|e| e.to_string())?; emit_supervisor(&app, "success", &name, "Process killed".into()); Ok(()) }
#[tauri::command]
async fn update_process_config(name: String, max_memory_mb: u64, registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<(), String> { let mut entry = registry.supervised.processes.get_mut(&name).ok_or_else(|| format!("update_process_config: process '{name}' not registered"))?; entry.max_memory_mb = max_memory_mb; Ok(()) }
#[tauri::command]
async fn get_hardware_info() -> Result<Value, String> { let hw = budget::detect::detect_hardware(); Ok(json!({"cores": hw.cores, "ramGb": hw.ram_gb, "onBattery": hw.on_battery})) }
#[tauri::command]
async fn preflight_status(timings: tauri::State<'_, Vec<PhaseTimingDto>>) -> Result<Vec<PhaseTimingDto>, String> { Ok(timings.inner().clone()) }

struct VaultInitializer;
impl OnPreflightInit for VaultInitializer {
    fn on_preflight_init(&self, ctx: &mut PreflightContext) -> Result<(), PreflightError> {
        let master_key = load_or_generate_master_key(&ctx.data_dir).map_err(|e| PreflightError::HookFailed { phase: Phase::Vault, detail: format!("vault key: {e}") })?;
        let vault = SecretVault::open(&master_key, ctx.data_dir.join("vault.enc")).map_err(|e| PreflightError::HookFailed { phase: Phase::Vault, detail: format!("vault open: {e}") })?;
        ctx.set_extension("vault", Arc::new(Mutex::new(vault)));
        Ok(())
    }
}

struct BootLogger;
impl OnPreflightReady for BootLogger {
    fn on_preflight_ready(&self, ctx: &PreflightContext) -> Result<(), PreflightError> {
        let preset = ctx.registry().preset.read().unwrap();
        eprintln!("[preflight] Ready: preset={}, data_dir={}", preset.name, ctx.data_dir.display());
        Ok(())
    }
}

async fn spawn_agentscope(handle: tauri::AppHandle, registry: Arc<BudgetRegistry>, process_mgr: Arc<ProcessManager>, settings_mgr: Arc<SettingsManager>) {
    match resolve_spawn_config(&settings_mgr) {
        Ok(config) => match process_mgr.spawn("agentscope", &config, &registry).await {
            Ok(_) => { let _ = handle.emit("agent-status", "online"); emit_supervisor(&handle, "success", "agentscope", "AgentScope Runtime started successfully".into()); }
            Err(err) => { let msg = spawn_failure(err); emit_supervisor(&handle, "error", "agentscope", msg); }
        },
        Err(err) => { let msg = spawn_failure(err); emit_supervisor(&handle, "error", "agentscope", msg); }
    }
}

fn main() {
    let data_dir = fonts::resolve_data_dir();
    let mut preflight = PreflightService::new(data_dir.clone());
    preflight.register_init(Phase::Vault, Box::new(VaultInitializer));
    preflight.register_ready(Box::new(BootLogger));
    let result = preflight.run_sync().expect("[kernel] boot failed");
    let vault = result.context.get_extension::<Arc<Mutex<SecretVault>>>("vault").cloned().unwrap_or_else(|| Arc::new(Mutex::new(SecretVault::empty(data_dir.join("vault.enc")))));

    let registry = result.registry.clone();
    let process_mgr = Arc::new(ProcessManager::with_parts(
        Arc::new(tokio::sync::Mutex::new(process::runtime::RuntimeState::new())),
        Arc::new(process::logs::ProcessLogs::with_max_lines(data_dir.clone(), PROCESS_LOG_MAX_LINES)),
    ));
    let settings_mgr = Arc::new(SettingsManager::new(data_dir));
    let (setup_registry, setup_process_mgr, run_process_mgr, setup_settings_mgr) = (registry.clone(), process_mgr.clone(), process_mgr.clone(), settings_mgr.clone());

    tauri::Builder::default()
        .manage(registry).manage(process_mgr).manage(settings_mgr).manage(vault).manage(result.phase_timings_dto())
        .invoke_handler(tauri::generate_handler![
            send_message, stop_generation, create_session, load_session, agent_health, get_settings,
            vault_store, vault_read, vault_delete, vault_list, vault_has, save_settings,
            get_data_dir, open_path, pick_folder, set_data_dir, get_batch_interval, get_startup_budget,
            budget_record_strike, budget_report_violation, budget_snapshot, set_preset, open_preferences,
            list_processes, get_process_logs, clear_process_logs, restart_process, kill_process, update_process_config,
            get_hardware_info, fonts::install_font_from_url, fonts::install_font_from_file, fonts::list_installed_fonts, fonts::remove_font, preflight_status,
        ])
        .setup(move |app| {
            menus::setup_menus(app)?;
            tauri::async_runtime::spawn(spawn_agentscope(app.handle().clone(), setup_registry.clone(), setup_process_mgr.clone(), setup_settings_mgr.clone()));
            tauri::async_runtime::spawn(metrics::run_metrics_loop(setup_registry.clone(), app.handle().clone()));
            Ok(())
        })
        .build(tauri::generate_context!()).expect("error while running snapfzz")
        .run(move |_app_handle, event| if let RunEvent::ExitRequested { .. } = event {
            let mgr = run_process_mgr.clone();
            tauri::async_runtime::block_on(async move { let _ = mgr.shutdown("agentscope").await; });
        });
}
