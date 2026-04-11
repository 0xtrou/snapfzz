#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod boot;
mod commands;
mod factories;
mod fonts;
mod helpers;
mod menus;
mod metrics;

use snapfzz_cef::CefRuntime;
use snapfzz_packs::cef::download::CefDownloader;
use snapfzz_kernel::boot::PreflightService;
use snapfzz_kernel::process::{self, ProcessFactoryRegistry, ProcessManager};
use snapfzz_kernel::settings::SettingsManager;
use snapfzz_packs::{
    constants, detect_platform, runtime::python::PythonRuntime, ComponentRegistry, PythonDownloader,
    UvDownloader,
};
use snapfzz_vault::{load_or_generate_master_key, SecretVault};
use std::sync::{Arc, Mutex};
use tauri::RunEvent;

fn main() {
    let data_dir = helpers::resolve_data_dir();
    
    // A008/BootCleanup: Kill any orphan processes from previous runs before starting
    process::cleanup_all_orphan_processes(&data_dir);
    
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
    let settings_mgr = Arc::new(SettingsManager::new(data_dir.clone()));
    let platform = detect_platform().expect("unsupported platform");
    let runtime_dir = data_dir.join("runtime");
    let python_dir = runtime_dir.join("python");
    let python_bin_dir = python_dir.join("bin");
    let uv_bin = python_bin_dir.join(format!("uv{}", platform.exe_suffix));
    
    // A037/SingleProcessManager: Create ONE ProcessManager shared by all
    let process_mgr = Arc::new(ProcessManager::with_parts(
        Arc::new(tokio::sync::Mutex::new(process::runtime::RuntimeState::new())),
        Arc::new(process::logs::ProcessLogs::with_max_lines(data_dir.clone(), 1000)),
    ));
    
    let cef_runtime_downloader = Arc::new(CefDownloader::new(
        runtime_dir.join("cef"),
        device.platform.clone(),
    ));
    let cef_state = commands::cef::CefState {
        runtime: Arc::new(tauri::async_runtime::Mutex::new(CefRuntime::new(&data_dir))),
        downloader: cef_runtime_downloader.clone(),
        device: device.clone(),
    };
    let mut component_registry = ComponentRegistry::new();
    component_registry.register(Arc::new(UvDownloader::new(
        python_bin_dir.clone(),
        platform.clone(),
    )));
    component_registry.register(Arc::new(PythonDownloader::new(
        uv_bin.clone(),
        python_bin_dir.join("python"),
        platform.clone(),
        constants::versions::PYTHON.to_string(),
    )));
    component_registry.register(cef_runtime_downloader);
    let component_registry = Arc::new(component_registry);

    // A037/ProcessFactoryRegistry: Single source of truth for process lifecycle
    let python_runtime = Arc::new(PythonRuntime::new(runtime_dir, platform));
    let mut factory_registry = ProcessFactoryRegistry::new(
        registry.clone(),
        process_mgr.clone(),
        settings_mgr.clone(),
        python_runtime.clone(),
    );
    factory_registry.register(Arc::new(factories::AgentScopeFactory::new(
        python_runtime.clone(),
        data_dir.clone(),
    )));
    factory_registry.register(Arc::new(factories::LiteLLMFactory::new(
        python_runtime.clone(),
        vault.clone(),
        data_dir.clone(),
    )));
    let factory_registry = Arc::new(tokio::sync::Mutex::new(factory_registry));

    let postgres_runtime = Arc::new(tokio::sync::Mutex::new(None::<
        snapfzz_packs::runtime::postgres::PostgresRuntime,
    >));

    let (setup_registry, setup_factory_registry, setup_component_registry, setup_postgres_runtime) = (
        registry.clone(),
        factory_registry.clone(),
        component_registry.clone(),
        postgres_runtime.clone(),
    );

    tauri::Builder::default()
        .manage(registry)
        .manage(process_mgr)
        .manage(settings_mgr)
        .manage(vault)
        .manage(cef_state)
        .manage(component_registry)
        .manage(device)
        .manage(result.phase_timings_dto())
        .manage(factory_registry.clone())
        .manage(postgres_runtime.clone())
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::get_data_dir,
            commands::settings::set_data_dir,
            commands::vault::vault_store,
            commands::vault::vault_read,
            commands::vault::vault_delete,
            commands::vault::vault_list,
            commands::vault::vault_has,
            commands::process::restart_process,
            commands::process::kill_process,
            commands::process::list_processes,
            commands::process::get_process_logs,
            commands::process::clear_process_logs,
            commands::budget::budget_snapshot,
            commands::budget::set_preset,
            commands::budget::get_batch_interval,
            commands::budget::get_startup_budget,
            commands::budget::budget_record_strike,
            commands::budget::budget_report_violation,
            commands::budget::get_hardware_info,
            commands::stream::send_message,
            commands::stream::stop_generation,
            commands::stream::create_session,
            commands::stream::load_session,
            commands::system::agent_health,
            commands::system::open_preferences,
            commands::system::open_path,
            commands::system::pick_folder,
            commands::system::preflight_status,
            commands::cef::cef_download_start,
            commands::cef::cef_download_status,
            commands::cef::cef_download_cancel,
            commands::cef::cef_resolve_build,
            commands::cef::cef_is_ready,
            commands::cef::cef_open_window,
            commands::cef::cef_close_window,
            commands::cef::cef_navigate,
            commands::cef::cef_go_back,
            commands::cef::cef_reload,
            commands::cef::cef_devtools,
            commands::cef::cef_screenshot,
            commands::cef::cef_console_messages,
            commands::cef::cef_platform_info,
            commands::components::component_list,
            commands::components::component_info,
            commands::components::component_download,
            commands::components::component_download_cancel,
            commands::components::component_status,
            commands::components::component_verify,
            commands::components::component_uninstall,
            commands::components::python_pack_metadata,
            commands::pip::python_pack_install_all,
            commands::pip::python_pack_uninstall_all,
            commands::pip::python_runtime_status,
            commands::llm::llm_store_provider_key,
            commands::llm::llm_delete_provider_key,
            commands::llm::llm_list_provider_keys,
            commands::llm::llm_save_config,
            commands::llm::llm_get_config_path,
            commands::llm::llm_get_base_url,
            commands::llm::llm_generate_key,
            commands::llm::llm_list_keys,
            commands::llm::llm_delete_key,
            commands::llm::llm_get_key_info,
            commands::llm::llm_update_key,
            commands::llm::llm_get_spend_logs,
            commands::llm::llm_get_key_spend,
            commands::llm::llm_get_global_spend,
            commands::llm::llm_get_models,
            fonts::install_font_from_url,
            fonts::install_font_from_file,
            fonts::list_installed_fonts,
            fonts::remove_font,
        ])
        .setup(move |app| {
            menus::setup_menus(app)?;

            boot::spawn_boot_phases(
                data_dir.clone(),
                python_runtime.clone(),
                setup_component_registry,
                setup_postgres_runtime,
                setup_factory_registry.clone(),
                app.handle().clone(),
            );

            tauri::async_runtime::spawn(metrics::run_metrics_loop(
                setup_registry,
                setup_factory_registry,
                app.handle().clone(),
            ));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running snapfzz")
        .run(move |_app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                let factory_registry = factory_registry.clone();
                let postgres_runtime = postgres_runtime.clone();
                tauri::async_runtime::block_on(async move {
                    let registry = factory_registry.lock().await;
                    let process_mgr = registry.process_manager();
                    drop(registry);
                    let _ = process_mgr.shutdown("agentscope").await;
                    let _ = process_mgr.shutdown("litellm").await;

                    if let Some(pg) = postgres_runtime.lock().await.as_mut() {
                        if let Err(e) = pg.stop().await {
                            eprintln!("[postgres] stop failed: {e}");
                        }
                    }
                });
            }
        });
}