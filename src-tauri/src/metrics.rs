use std::sync::Arc;
use std::time::Duration;

use snapfzz_kernel::budget::{metrics::ProcessStatus, BudgetRegistry};
use snapfzz_kernel::process::ProcessManager;
use snapfzz_kernel::settings::SettingsManager;
use tauri::Emitter;

use crate::commands::process::emit_supervisor;
use crate::helpers;

pub async fn run_metrics_loop(
    registry: Arc<BudgetRegistry>,
    process_mgr: Arc<ProcessManager>,
    settings_mgr: Arc<SettingsManager>,
    handle: tauri::AppHandle,
) {
    loop {
        tokio::time::sleep(Duration::from_millis(2000)).await;
        let names: Vec<String> = registry
            .supervised
            .processes
            .iter()
            .map(|entry| entry.key().clone())
            .collect();

        for name in &names {
            if let Some(failures) =
                snapfzz_kernel::process::health::apply_health_check(&registry, name).await
            {
                emit_supervisor(
                    &handle,
                    "error",
                    name,
                    format!("Health check failed ({failures} consecutive)"),
                );

                if let Some(entry) = registry.supervised.processes.get(name) {
                    let threshold = entry.max_health_failures;
                    let restarts = entry.restart_count;
                    let max_restarts = entry.max_restarts;
                    drop(entry);

                    if failures >= threshold && restarts < max_restarts {
                        emit_supervisor(
                            &handle,
                            "warning",
                            name,
                            "Auto-restarting due to health failures".into(),
                        );
                        perform_restart(&handle, &registry, &process_mgr, &settings_mgr, name).await;
                    } else if restarts >= max_restarts {
                        emit_supervisor(
                            &handle,
                            "error",
                            name,
                            format!("Max restarts ({max_restarts}) exceeded, giving up"),
                        );
                        if let Some(mut entry) = registry.supervised.processes.get_mut(name) {
                            entry.status = ProcessStatus::Errored;
                        }
                    }
                }
            }

            if snapfzz_kernel::process::supervisor::is_total_memory_exceeded(&registry) {
                let total_rss = registry.supervised.total_rss_mb();
                let app_total_mb = {
                    let preset = registry.preset.read().unwrap();
                    preset.memory.app_total_mb
                };

                emit_supervisor(
                    &handle,
                    "error",
                    "system",
                    format!("Total memory exceeded: {total_rss:.0}MB > {app_total_mb}MB unified limit"),
                );

                // A008/UnifiedBudget: Consider restarting the largest process
                let largest_process = registry
                    .supervised
                    .processes
                    .iter()
                    .max_by(|a, b| {
                        let rss_a = registry.supervised.check_memory(a.key()).unwrap_or(0.0);
                        let rss_b = registry.supervised.check_memory(b.key()).unwrap_or(0.0);
                        rss_a.partial_cmp(&rss_b).unwrap_or(std::cmp::Ordering::Equal)
                    });

                if let Some(entry) = largest_process {
                    let name = entry.key().clone();
                    let restarts = entry.restart_count;
                    let max_restarts = entry.max_restarts;
                    drop(entry);

                    if restarts < max_restarts {
                        emit_supervisor(
                            &handle,
                            "warning",
                            &name,
                            "Auto-restarting largest process due to unified memory limit".into(),
                        );
                        perform_restart(&handle, &registry, &process_mgr, &settings_mgr, &name)
                            .await;
                    }
                }
            }
        }

        if let Err(error) = handle.emit("budget-metrics", &registry.snapshot()) {
            eprintln!("[budget] metrics emit error: {error}");
        }
    }
}

async fn perform_restart(
    handle: &tauri::AppHandle,
    registry: &Arc<BudgetRegistry>,
    process_mgr: &Arc<ProcessManager>,
    settings_mgr: &Arc<SettingsManager>,
    name: &str,
) {
    let _ = process_mgr.shutdown(name).await;

    match name {
        "agentscope" => {
            helpers::spawn_agentscope(
                handle.clone(),
                registry.clone(),
                process_mgr.clone(),
                settings_mgr.clone(),
            )
            .await;
        }
        "litellm" => {
            helpers::spawn_litellm(
                handle.clone(),
                registry.clone(),
                process_mgr.clone(),
                settings_mgr.clone(),
            )
            .await;
        }
        _ => {
            emit_supervisor(handle, "error", name, format!("Unknown service: {name}"));
        }
    }
}
