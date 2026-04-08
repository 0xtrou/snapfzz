#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod fonts;
mod helpers;
mod menus;
mod metrics;

use snapfzz_cef::download::CefDownloader;
use snapfzz_cef::runtime::CefRuntime;
use snapfzz_kernel::boot::{OnPreflightInit, Phase, PreflightContext, PreflightError, PreflightService};
use snapfzz_kernel::components::ComponentRegistry;
use snapfzz_kernel::process::{self, ProcessManager};
use snapfzz_kernel::settings::SettingsManager;
use snapfzz_vault::{load_or_generate_master_key, SecretVault};
use std::sync::{Arc, Mutex};
use tauri::RunEvent;

struct VaultInitializer;

impl OnPreflightInit for VaultInitializer {
    fn on_preflight_init(&self, ctx: &mut PreflightContext) -> Result<(), PreflightError> {
        let master_key = load_or_generate_master_key(&ctx.data_dir)
            .map_err(|e| PreflightError::HookFailed { phase: Phase::Vault, detail: format!("vault key: {e}") })?;
        let vault = SecretVault::open(&master_key, ctx.data_dir.join("vault.enc"))
            .map_err(|e| PreflightError::HookFailed { phase: Phase::Vault, detail: format!("vault open: {e}") })?;
        ctx.set_extension("vault", Arc::new(Mutex::new(vault)));
        Ok(())
    }
}

fn main() {
    let data_dir = helpers::resolve_data_dir();
    let mut preflight = PreflightService::new(data_dir.clone());
    preflight.register_init(Phase::Vault, Box::new(VaultInitializer));
    preflight.register_ready(Box::new(helpers::BootLogger));
    let result = preflight.run_sync().expect("[kernel] boot failed");

    let vault = result.context.get_extension::<Arc<Mutex<SecretVault>>>("vault").cloned()
        .unwrap_or_else(|| Arc::new(Mutex::new(SecretVault::empty(data_dir.join("vault.enc")))));
    let registry = result.registry.clone();
    let process_mgr = Arc::new(ProcessManager::with_parts(
        Arc::new(tokio::sync::Mutex::new(process::runtime::RuntimeState::new())),
        Arc::new(process::logs::ProcessLogs::with_max_lines(data_dir.clone(), 1000)),
    ));
    let settings_mgr = Arc::new(SettingsManager::new(data_dir.clone()));
    let cef_state = commands::cef::CefState {
        runtime: Arc::new(tauri::async_runtime::Mutex::new(CefRuntime::new(&data_dir))),
        downloader: Arc::new(
            CefDownloader::from_current_platform(data_dir.join("runtime").join("cef"))
                .unwrap_or_else(|_| CefDownloader::new(data_dir.join("runtime").join("cef"), "macos-arm64".to_string())),
        ),
    };
    let mut component_registry = ComponentRegistry::new();
    component_registry.register(cef_state.downloader.clone());
    let component_registry = Arc::new(component_registry);

    let (setup_registry, setup_process_mgr, run_process_mgr, setup_settings_mgr) =
        (registry.clone(), process_mgr.clone(), process_mgr.clone(), settings_mgr.clone());

    tauri::Builder::default()
        .manage(registry)
        .manage(process_mgr)
        .manage(settings_mgr)
        .manage(vault)
        .manage(cef_state)
        .manage(component_registry)
        .manage(result.phase_timings_dto())
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_settings, commands::settings::save_settings, commands::settings::get_data_dir, commands::settings::set_data_dir,
            commands::vault::vault_store, commands::vault::vault_read, commands::vault::vault_delete, commands::vault::vault_list, commands::vault::vault_has,
            commands::process::restart_process, commands::process::kill_process, commands::process::list_processes, commands::process::get_process_logs,
            commands::process::clear_process_logs, commands::process::update_process_config,
            commands::budget::budget_snapshot, commands::budget::set_preset, commands::budget::get_batch_interval, commands::budget::get_startup_budget,
            commands::budget::budget_record_strike, commands::budget::budget_report_violation, commands::budget::get_hardware_info,
            commands::stream::send_message, commands::stream::stop_generation, commands::stream::create_session, commands::stream::load_session,
            commands::system::agent_health, commands::system::open_preferences, commands::system::open_path, commands::system::pick_folder, commands::system::preflight_status,
            commands::cef::cef_download_start, commands::cef::cef_download_status, commands::cef::cef_download_cancel, commands::cef::cef_resolve_build, commands::cef::cef_is_ready,
            commands::cef::cef_open_window, commands::cef::cef_close_window,
            commands::cef::cef_navigate, commands::cef::cef_go_back, commands::cef::cef_reload,
            commands::cef::cef_devtools, commands::cef::cef_screenshot, commands::cef::cef_console_messages, commands::cef::cef_platform_info,
            commands::components::component_list, commands::components::component_info, commands::components::component_download,
            commands::components::component_download_cancel, commands::components::component_status, commands::components::component_verify,
            fonts::install_font_from_url, fonts::install_font_from_file, fonts::list_installed_fonts, fonts::remove_font,
        ])
        .setup(move |app| {
            menus::setup_menus(app)?;
            tauri::async_runtime::spawn(helpers::spawn_agentscope(app.handle().clone(), setup_registry.clone(), setup_process_mgr.clone(), setup_settings_mgr.clone()));
            tauri::async_runtime::spawn(metrics::run_metrics_loop(setup_registry.clone(), app.handle().clone()));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running snapfzz")
        .run(move |_app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                let mgr = run_process_mgr.clone();
                tauri::async_runtime::block_on(async move {
                    let _ = mgr.shutdown("agentscope").await;
                });
            }
        });
}
