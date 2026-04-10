use std::sync::Arc;
use std::time::Duration;

use snapfzz_kernel::budget::{metrics::ProcessStatus, BudgetRegistry};
use snapfzz_kernel::process::{ProcessFactoryRegistry, ProcessManager};
use tauri::Emitter;

use crate::helpers;

pub async fn run_metrics_loop(
    registry: Arc<BudgetRegistry>,
    _process_mgr: Arc<ProcessManager>,
    factory_registry: Arc<tokio::sync::Mutex<ProcessFactoryRegistry>>,
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
                helpers::emit_supervisor(
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
                        helpers::emit_supervisor(
                            &handle,
                            "warning",
                            name,
                            "Auto-restarting due to health failures".into(),
                        );
                        perform_restart(&handle, &factory_registry, name).await;
                    } else if restarts >= max_restarts {
                        helpers::emit_supervisor(
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

                helpers::emit_supervisor(
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
                        helpers::emit_supervisor(
                            &handle,
                            "warning",
                            &name,
                            "Auto-restarting largest process due to unified memory limit".into(),
                        );
                        perform_restart(&handle, &factory_registry, &name).await;
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
    factory_registry: &Arc<tokio::sync::Mutex<ProcessFactoryRegistry>>,
    name: &str,
) {
    let mut registry = factory_registry.lock().await;
    match registry.restart(name).await {
        Ok(()) => {
            helpers::emit_supervisor(
                handle,
                "success",
                name,
                format!("{} restarted successfully", name),
            );
        }
        Err(e) => {
            helpers::emit_supervisor(
                handle,
                "error",
                name,
                format!("Failed to restart {}: {}", name, e),
            );
        }
    }
}