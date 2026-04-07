#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
use std::{fs, path::PathBuf, sync::{Arc, Mutex}, time::Duration};
use tauri::ipc::Channel;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, RunEvent};

const AGENTSCOPE_PORT: u16 = 8090;
const PROCESS_LOG_MAX_LINES: usize = 1000;

#[derive(Serialize, Debug)]
struct HealthStatus { status: String }
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SessionInfo { #[serde(alias = "session_id", alias = "sessionId")] session_id: String }
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SupervisorEvent { event_type: String, process: String, message: String, timestamp: u64 }
fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
fn snapfzz_home() -> PathBuf { dirs::home_dir().unwrap_or_default().join(".snapfzz") }
fn resolve_data_dir() -> PathBuf { resolve_data_dir_from(snapfzz_home()) }
fn spawn_failure(err: impl ToString) -> String { format!("Failed to start AgentScope Runtime: {}", err.to_string()) }

fn resolve_data_dir_from(home: PathBuf) -> PathBuf {
    let pointer_path = home.join("pointer.json");
    if !pointer_path.exists() { return home; }
    if let Ok(content) = fs::read_to_string(&pointer_path) {
        if let Ok(pointer) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(dir) = pointer.get("dataDir").and_then(|v| v.as_str()) {
                let custom = PathBuf::from(dir);
                if custom.exists() { return custom; }
            }
        }
    }
    home
}
fn agentscope_base_url() -> String {
    let settings = SettingsManager::new(resolve_data_dir()).load().unwrap_or_default();
    let host = if settings.agentscope_host.is_empty() { "127.0.0.1".to_string() } else { settings.agentscope_host };
    let port: u16 = settings.agentscope_port.parse().unwrap_or(AGENTSCOPE_PORT);
    format!("http://{host}:{port}")
}
fn resolve_intelligence_dir() -> Result<PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    for c in [cwd.join("intelligence"), cwd.join("..").join("intelligence"), cwd.join("../..").join("intelligence")] {
        if c.join("pyproject.toml").exists() { return Ok(c); }
    }
    Err("Unable to find intelligence/ directory".to_string())
}
fn resolve_spawn_config(settings_mgr: &SettingsManager) -> Result<SpawnConfig, String> {
    let settings = settings_mgr.load().unwrap_or_default();
    let host = if settings.agentscope_host.is_empty() { "127.0.0.1".to_string() } else { settings.agentscope_host };
    Ok(SpawnConfig {
        host,
        port: settings.agentscope_port.parse().unwrap_or(AGENTSCOPE_PORT),
        working_dir: resolve_intelligence_dir()?,
    })
}
fn emit_supervisor(app: &tauri::AppHandle, event_type: &str, process: &str, message: String) {
    let _ = app.emit("supervisor-event", SupervisorEvent {
        event_type: event_type.into(), process: process.into(), message, timestamp: now_ms(),
    });
}
#[tauri::command]
async fn send_message(text: String, session_id: String, plugin_id: Option<String>, on_token: Channel<ContentBlockBatch>, registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<MessageResult, String> {
    let caller = plugin_id.as_deref().unwrap_or("unknown");
    let _invoke = registry.try_acquire_invoke(caller).ok_or_else(|| format!("Budget exhausted: plugin '{caller}' invoke denied"))?;
    let _cpu = registry.try_acquire_cpu().ok_or_else(|| "Budget exhausted: CPU permits unavailable for SSE parsing".to_string())?;
    send_and_consume(&format!("{}/process", agentscope_base_url()), &text, &session_id, registry.batch_rate(), |batch| {
        on_token.send(batch).map_err(|e| StreamError::ChannelSend(e.to_string()))
    }).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_generation(session_id: String) -> Result<(), String> {
    reqwest::Client::new().post(format!("{}/stop", agentscope_base_url())).json(&json!({"session_id": session_id}))
        .send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn create_session(template_id: Option<String>) -> Result<SessionInfo, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/session", agentscope_base_url());
    let req = match template_id { Some(tid) => client.post(&url).json(&json!({"template_id": tid})), None => client.post(&url) };
    req.send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.json::<SessionInfo>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_session(session_id: String) -> Result<Value, String> {
    reqwest::Client::new().get(format!("{}/session/{session_id}", agentscope_base_url()))
        .send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn agent_health(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<HealthStatus, String> {
    Ok(HealthStatus { status: if registry.supervised.check_health("agentscope").await { "connected" } else { "disconnected" }.into() })
}
#[tauri::command]
async fn get_settings(settings_mgr: tauri::State<'_, Arc<SettingsManager>>) -> Result<Settings, String> { settings_mgr.load().map_err(|e| e.to_string()) }
#[tauri::command]
async fn vault_store(vault: tauri::State<'_, Arc<Mutex<SecretVault>>>, key: String, value: String) -> Result<(), String> {
    vault.lock().unwrap().store(&key, value.as_bytes()).map_err(|e| e.to_string())
}
#[tauri::command]
async fn vault_read(vault: tauri::State<'_, Arc<Mutex<SecretVault>>>, key: String) -> Result<String, String> {
    let bytes = vault.lock().unwrap().read(&key).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}
#[tauri::command]
async fn vault_delete(vault: tauri::State<'_, Arc<Mutex<SecretVault>>>, key: String) -> Result<(), String> {
    vault.lock().unwrap().delete(&key).map_err(|e| e.to_string())
}
#[tauri::command]
async fn vault_list(vault: tauri::State<'_, Arc<Mutex<SecretVault>>>) -> Result<Vec<String>, String> {
    Ok(vault.lock().unwrap().list())
}
#[tauri::command]
async fn vault_has(vault: tauri::State<'_, Arc<Mutex<SecretVault>>>, key: String) -> Result<bool, String> {
    Ok(vault.lock().unwrap().has(&key))
}
#[tauri::command]
async fn save_settings(app: tauri::AppHandle, settings_mgr: tauri::State<'_, Arc<SettingsManager>>, settings: Settings) -> Result<(), String> {
    settings_mgr.save(&settings).map_err(|e| e.to_string())?;
    let _ = app.emit("settings-changed", ());
    Ok(())
}
#[tauri::command]
async fn get_batch_interval(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<u64, String> { Ok(registry.batch_interval()) }
#[tauri::command]
async fn get_startup_budget(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<Value, String> {
    let (visible, interactive, timeout) = registry.startup_budget();
    Ok(json!({"visible_ms": visible, "interactive_ms": interactive, "activation_timeout_ms": timeout}))
}
#[tauri::command]
async fn budget_record_strike(plugin_id: String, registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<bool, String> {
    registry.record_strike(&plugin_id);
    Ok(registry.is_plugin_disabled(&plugin_id))
}
#[tauri::command]
async fn budget_report_violation(class: String, metric: String, actual_ms: f64, registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<(), String> {
    eprintln!("[budget] violation: class={class} metric={metric} actual={actual_ms:.1}ms target={}ms", registry.batch_interval());
    Ok(())
}
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
    eprintln!("[budget] preset swapped to: {preset_name}");
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
    #[cfg(target_os = "macos")] std::process::Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")] std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")] std::process::Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
async fn get_data_dir() -> Result<String, String> { Ok(resolve_data_dir().to_string_lossy().to_string()) }
#[tauri::command]
async fn set_data_dir(new_path: String) -> Result<(), String> {
    fs::create_dir_all(PathBuf::from(&new_path)).map_err(|e| e.to_string())?;
    let pointer_path = snapfzz_home().join("pointer.json");
    if let Some(parent) = pointer_path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    fs::write(pointer_path, serde_json::to_string_pretty(&json!({"dataDir": new_path})).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_preferences(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    if let Some(window) = app.get_webview_window("preferences") {
        window.show().map_err(|e: tauri::Error| e.to_string())?;
        window.set_focus().map_err(|e: tauri::Error| e.to_string())?;
        return Ok(());
    }
    let url = if cfg!(debug_assertions) { WebviewUrl::External("http://localhost:5175".parse().unwrap()) } else { WebviewUrl::App("preferences.html".into()) };
    WebviewWindowBuilder::new(&app, "preferences", url)
        .title("Snapfzz Preferences").inner_size(1280.0, 800.0).min_inner_size(800.0, 600.0)
        .title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true).center().build().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn list_processes(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<Value, String> { serde_json::to_value(registry.snapshot().processes).map_err(|e| e.to_string()) }
#[tauri::command]
async fn get_process_logs(name: String, tail_n: usize, process_mgr: tauri::State<'_, Arc<ProcessManager>>) -> Result<Vec<String>, String> { Ok(process_mgr.logs.tail(&name, tail_n)) }
#[tauri::command]
async fn clear_process_logs(name: String, process_mgr: tauri::State<'_, Arc<ProcessManager>>) -> Result<(), String> { process_mgr.logs.clear(&name); Ok(()) }
#[tauri::command]
async fn restart_process(name: String, app: tauri::AppHandle, registry: tauri::State<'_, Arc<BudgetRegistry>>, process_mgr: tauri::State<'_, Arc<ProcessManager>>, settings_mgr: tauri::State<'_, Arc<SettingsManager>>) -> Result<(), String> {
    process_mgr.restart(&name, &resolve_spawn_config(&settings_mgr)?, &registry).await.map_err(|e| e.to_string())?;
    emit_supervisor(&app, "success", &name, "AgentScope Runtime restarted successfully".into());
    Ok(())
}
#[tauri::command]
async fn kill_process(name: String, app: tauri::AppHandle, process_mgr: tauri::State<'_, Arc<ProcessManager>>) -> Result<(), String> {
    process_mgr.kill(&name).map_err(|e| e.to_string())?;
    emit_supervisor(&app, "success", &name, "Process killed".into());
    Ok(())
}
#[tauri::command]
async fn update_process_config(name: String, max_memory_mb: u64, registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<(), String> {
    let mut entry = registry.supervised.processes.get_mut(&name).ok_or_else(|| format!("update_process_config: process '{name}' not registered"))?;
    entry.max_memory_mb = max_memory_mb;
    Ok(())
}
#[tauri::command]
async fn get_hardware_info() -> Result<Value, String> {
    let hw = budget::detect::detect_hardware();
    Ok(json!({"cores": hw.cores, "ramGb": hw.ram_gb, "onBattery": hw.on_battery}))
}

fn fonts_dir() -> PathBuf { resolve_data_dir().join("fonts") }

#[tauri::command]
async fn install_font_from_url(url: String, name: String) -> Result<String, String> {
    fs::create_dir_all(fonts_dir()).map_err(|e| e.to_string())?;
    let bytes = reqwest::get(&url).await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
    let ext = if url.contains(".woff2") { "woff2" } else if url.contains(".woff") { "woff" } else if url.contains(".otf") { "otf" } else { "ttf" };
    let path = fonts_dir().join(format!("{name}.{ext}"));
    fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
#[tauri::command]
async fn install_font_from_file(source_path: String, name: String) -> Result<String, String> {
    fs::create_dir_all(fonts_dir()).map_err(|e| e.to_string())?;
    let source = PathBuf::from(source_path);
    let dest = fonts_dir().join(format!("{name}.{}", source.extension().and_then(|e| e.to_str()).unwrap_or("ttf")));
    fs::copy(&source, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}
#[tauri::command]
async fn list_installed_fonts() -> Result<Vec<String>, String> {
    let dir = fonts_dir();
    if !dir.exists() { return Ok(vec![]); }
    let mut names = vec![];
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let name = entry.map_err(|e| e.to_string())?.file_name().to_string_lossy().to_string();
        if let Some(stem) = name.split('.').next() { if !stem.is_empty() { names.push(stem.to_string()); } }
    }
    Ok(names)
}
#[tauri::command]
async fn remove_font(name: String) -> Result<(), String> {
    let dir = fonts_dir();
    if !dir.exists() { return Err("Fonts directory does not exist".to_string()); }
    let mut removed_any = false;
    for ext in ["ttf", "otf", "woff", "woff2"] {
        let path = dir.join(format!("{name}.{ext}"));
        if path.exists() { fs::remove_file(path).map_err(|e| e.to_string())?; removed_any = true; }
    }
    if !removed_any { return Err(format!("No font found with name '{name}'")); }
    Ok(())
}
#[tauri::command]
async fn preflight_status(timings: tauri::State<'_, Vec<PhaseTimingDto>>) -> Result<Vec<PhaseTimingDto>, String> { Ok(timings.inner().clone()) }

fn setup_menus(app: &mut tauri::App) -> Result<(), tauri::Error> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    let preferences_item = MenuItemBuilder::with_id("preferences", "Preferences…").accelerator("CmdOrCtrl+,").build(app)?;
    let about_item = MenuItemBuilder::with_id("about", "About Snapfzz").build(app)?;
    let app_menu = SubmenuBuilder::new(app, "Snapfzz").item(&about_item).separator().item(&preferences_item).separator().hide().hide_others().show_all().separator().quit().build()?;
    let edit_menu = SubmenuBuilder::new(app, "Edit").undo().redo().separator().cut().copy().paste().select_all().build()?;
    let view_menu = SubmenuBuilder::new(app, "View").fullscreen().build()?;
    let window_menu = SubmenuBuilder::new(app, "Window").minimize().close_window().build()?;
    app.set_menu(MenuBuilder::new(app).item(&app_menu).item(&edit_menu).item(&view_menu).item(&window_menu).build()?)?;
    let menu_handle = app.handle().clone();
    app.on_menu_event(move |_app, event| match event.id().as_ref() {
        "preferences" => { let handle = menu_handle.clone(); tauri::async_runtime::spawn(async move { let _ = open_preferences(handle).await; }); }
        "about" => {
            let handle = menu_handle.clone();
            if let Some(window) = handle.get_webview_window("about") { let _ = window.set_focus(); return; }
            let url = if cfg!(debug_assertions) { WebviewUrl::External("http://localhost:5174/about.html".parse().unwrap()) } else { WebviewUrl::App("about.html".into()) };
            let _ = WebviewWindowBuilder::new(&handle, "about", url).title("About").inner_size(420.0, 520.0).resizable(false).maximizable(false).minimizable(false).center().build();
        }
        _ => {}
    });
    Ok(())
}

async fn run_metrics_loop(registry: Arc<BudgetRegistry>, handle: tauri::AppHandle) {
    loop {
        tokio::time::sleep(Duration::from_millis(2000)).await;
        let names: Vec<String> = registry.supervised.processes.iter().map(|entry| entry.key().clone()).collect();
        for name in &names {
            if let Some(failures) = process::health::apply_health_check(&registry, name).await {
                emit_supervisor(&handle, "error", name, format!("Health check failed ({failures} consecutive)"));
            }
            if process::supervisor::apply_memory_limit(&registry, name) {
                let max = registry.supervised.processes.get(name).map(|p| p.max_memory_mb).unwrap_or(0);
                let rss = registry.supervised.check_memory(name).unwrap_or(0.0);
                emit_supervisor(&handle, "error", name, format!("Memory exceeded: {rss:.0}MB > {max}MB limit"));
            }
        }
        if let Err(error) = handle.emit("budget-metrics", &registry.snapshot()) { eprintln!("[budget] metrics emit error: {error}"); }
    }
}

struct VaultInitializer;

impl OnPreflightInit for VaultInitializer {
    fn on_preflight_init(&self, ctx: &mut PreflightContext) -> Result<(), PreflightError> {
        // Per A011/KeyManagement: load from OS keychain first with local keyfile fallback.
        let master_key = load_or_generate_master_key(&ctx.data_dir).map_err(|e| PreflightError::HookFailed {
            phase: Phase::Vault,
            detail: format!("vault key: {e}"),
        })?;

        // Per A011/FileFormat: vault ciphertext is persisted in data_dir/vault.enc.
        let vault_path = ctx.data_dir.join("vault.enc");
        let vault = SecretVault::open(&master_key, vault_path).map_err(|e| PreflightError::HookFailed {
            phase: Phase::Vault,
            detail: format!("vault open: {e}"),
        })?;

        ctx.set_extension("vault", Mutex::new(vault));
        eprintln!("[preflight] Phase 2: vault — initialized");
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
            Err(err) => { let msg = spawn_failure(err); eprintln!("[preflight] Phase 5: processes — {msg}"); emit_supervisor(&handle, "error", "agentscope", msg); }
        },
        Err(err) => { let msg = spawn_failure(err); eprintln!("[preflight] Phase 5: processes — {msg}"); emit_supervisor(&handle, "error", "agentscope", msg); }
    }
}

fn main() {
    let data_dir = resolve_data_dir();
    let mut preflight = PreflightService::new(data_dir.clone());
    preflight.register_ready(Box::new(BootLogger));
    let result = preflight.run_sync().expect("[kernel] boot failed");
    let registry = result.registry.clone();
    let process_mgr = Arc::new(ProcessManager::with_parts(
        Arc::new(tokio::sync::Mutex::new(process::runtime::RuntimeState::new())),
        Arc::new(process::logs::ProcessLogs::with_max_lines(data_dir.clone(), PROCESS_LOG_MAX_LINES)),
    ));
    let settings_mgr = Arc::new(SettingsManager::new(data_dir));
    let (setup_registry, setup_process_mgr, run_process_mgr, setup_settings_mgr) = (registry.clone(), process_mgr.clone(), process_mgr.clone(), settings_mgr.clone());

    tauri::Builder::default()
        .manage(registry).manage(process_mgr).manage(settings_mgr).manage(result.phase_timings_dto())
        .invoke_handler(tauri::generate_handler![
            send_message, stop_generation, create_session, load_session, agent_health, get_settings, save_settings,
            get_data_dir, open_path, pick_folder, set_data_dir, get_batch_interval, get_startup_budget,
            budget_record_strike, budget_report_violation, budget_snapshot, set_preset, open_preferences,
            list_processes, get_process_logs, clear_process_logs, restart_process, kill_process, update_process_config,
            get_hardware_info, install_font_from_url, install_font_from_file, list_installed_fonts, remove_font, preflight_status,
        ])
        .setup(move |app| {
            setup_menus(app)?;
            tauri::async_runtime::spawn(spawn_agentscope(app.handle().clone(), setup_registry.clone(), setup_process_mgr.clone(), setup_settings_mgr.clone()));
            tauri::async_runtime::spawn(run_metrics_loop(setup_registry.clone(), app.handle().clone()));
            Ok(())
        })
        .build(tauri::generate_context!()).expect("error while running snapfzz")
        .run(move |_app_handle, event| if let RunEvent::ExitRequested { .. } = event {
            let mgr = run_process_mgr.clone();
            tauri::async_runtime::block_on(async move { let _ = mgr.shutdown("agentscope").await; });
            eprintln!("[budget] shutdown complete");
        });
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
        fs::write(home.join("pointer.json"), serde_json::to_string(&serde_json::json!({"dataDir": custom.to_str().unwrap()})).unwrap()).unwrap();
        assert_eq!(resolve_data_dir_from(home), custom);
    }

    #[test]
    fn a004_persistence_resolve_data_dir_falls_back_to_default_when_pointer_path_does_not_exist() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        fs::write(home.join("pointer.json"), serde_json::to_string(&serde_json::json!({"dataDir": "/this/path/does/not/exist/xyz"})).unwrap()).unwrap();
        assert_eq!(resolve_data_dir_from(home.clone()), home);
    }

    #[test]
    fn a004_persistence_resolve_data_dir_falls_back_to_default_when_pointer_is_corrupt() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        fs::write(home.join("pointer.json"), "not { valid json").unwrap();
        assert_eq!(resolve_data_dir_from(home.clone()), home);
    }
}
