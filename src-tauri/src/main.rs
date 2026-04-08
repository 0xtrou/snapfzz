#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod fonts;
mod helpers;
mod menus;
mod metrics;

use snapfzz_cef::download::CefDownloader;
use snapfzz_cef::runtime::CefRuntime;
use snapfzz_kernel::boot::PreflightService;
use snapfzz_kernel::budget::device::DeviceInfo;
use snapfzz_kernel::components::{ComponentError, ComponentRegistry};
use snapfzz_packs::{
    detect_platform, AgentScopeComponent, CefPackComponent, LiteLLMComponent, PlatformInfo,
    PythonComponent, UvComponent,
};
use snapfzz_kernel::process::{self, ProcessManager};
use snapfzz_kernel::settings::SettingsManager;
use snapfzz_vault::{load_or_generate_master_key, SecretVault};
use std::sync::{Arc, Mutex};
use tauri::RunEvent;

fn detect_platform_for_components(device: &DeviceInfo) -> Result<PlatformInfo, ComponentError> {
    detect_platform().or_else(|_| {
        let (display, archive_ext) = match device.platform.as_str() {
            "macos-arm64" => ("macOS (Apple Silicon)", ".tar.gz"),
            "macos-x64" => ("macOS (Intel)", ".tar.gz"),
            "linux-x64" => ("Linux (x86_64)", ".tar.gz"),
            "windows-x64" => ("Windows (x64)", ".zip"),
            _ => {
                return Err(ComponentError::UnsupportedPlatform(format!(
                    "{}-{}",
                    device.os, device.arch
                )));
            }
        };

        let os = match device.os.as_str() {
            "macos" => "macos",
            "linux" => "linux",
            "windows" => "windows",
            _ => {
                return Err(ComponentError::UnsupportedPlatform(format!(
                    "{}-{}",
                    device.os, device.arch
                )));
            }
        };

        let arch = match device.arch.as_str() {
            "aarch64" => "aarch64",
            "x86_64" => "x86_64",
            _ => {
                return Err(ComponentError::UnsupportedPlatform(format!(
                    "{}-{}",
                    device.os, device.arch
                )));
            }
        };

        Ok(PlatformInfo {
            os,
            arch,
            platform: device.platform.clone(),
            display,
            exe_suffix: if os == "windows" { ".exe" } else { "" },
            archive_ext,
        })
    })
}

fn main() {
    let data_dir = helpers::resolve_data_dir();
    let mut preflight = PreflightService::new(data_dir.clone());
    preflight.register_ready(Box::new(helpers::BootLogger));
    let result = preflight.run_sync().expect("[kernel] boot failed");

    let vault_path = data_dir.join("vault.enc");
    let vault: Arc<Mutex<SecretVault>> = match load_or_generate_master_key(&data_dir) {
        Ok(master_key) => match SecretVault::open(&master_key, vault_path.clone()) {
            Ok(v) => Arc::new(Mutex::new(v)),
            Err(_) => Arc::new(Mutex::new(SecretVault::empty(vault_path))),
        },
        Err(_) => Arc::new(Mutex::new(SecretVault::empty(vault_path))),
    };
    let registry = result.registry.clone();
    let device = Arc::new(result.context.device().clone());
    let process_mgr = Arc::new(ProcessManager::with_parts(
        Arc::new(tokio::sync::Mutex::new(process::runtime::RuntimeState::new())),
        Arc::new(process::logs::ProcessLogs::with_max_lines(data_dir.clone(), 1000)),
    ));
    let settings_mgr = Arc::new(SettingsManager::new(data_dir.clone()));
    let platform = detect_platform_for_components(&device).expect("unsupported platform");
    let runtime_dir = data_dir.join("runtime");
    let bin_dir = runtime_dir.join("bin");
    let processes_dir = runtime_dir.join("processes");
    let packages_dir = runtime_dir.join("packages");
    let uv_bin = bin_dir.join(format!("uv{}", platform.exe_suffix));
    let cef_runtime_downloader = Arc::new(CefDownloader::new(
        processes_dir.join("cef"),
        device.platform.clone(),
    ));
    let cef_state = commands::cef::CefState {
        runtime: Arc::new(tauri::async_runtime::Mutex::new(CefRuntime::new(&data_dir))),
        downloader: cef_runtime_downloader,
        device: device.clone(),
    };
    let mut component_registry = ComponentRegistry::new();
    component_registry.register(Arc::new(UvComponent::new(bin_dir.clone(), platform.clone())));
    component_registry.register(Arc::new(PythonComponent::new(
        uv_bin.clone(),
        bin_dir.join("python"),
        platform.clone(),
        "3.12".to_string(),
    )));
    component_registry.register(Arc::new(AgentScopeComponent::new(
        uv_bin.clone(),
        packages_dir.join("agentscope"),
        platform.clone(),
    )));
    component_registry.register(Arc::new(LiteLLMComponent::new(
        uv_bin.clone(),
        packages_dir.join("litellm"),
        platform.clone(),
    )));
    component_registry.register(Arc::new(CefPackComponent::new(
        processes_dir.join("cef"),
        platform,
    )));
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
        .manage(device)
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
            commands::components::component_uninstall,
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
