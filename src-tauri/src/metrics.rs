use std::sync::Arc;
use std::time::Duration;

use snapfzz_kernel::budget::BudgetRegistry;
use tauri::Emitter;

use crate::emit_supervisor;

pub async fn run_metrics_loop(registry: Arc<BudgetRegistry>, handle: tauri::AppHandle) {
    loop {
        tokio::time::sleep(Duration::from_millis(2000)).await;
        let names: Vec<String> = registry
            .supervised
            .processes
            .iter()
            .map(|entry| entry.key().clone())
            .collect();

        for name in &names {
            if let Some(failures) = snapfzz_kernel::process::health::apply_health_check(&registry, name).await {
                emit_supervisor(
                    &handle,
                    "error",
                    name,
                    format!("Health check failed ({failures} consecutive)"),
                );
            }
            if snapfzz_kernel::process::supervisor::apply_memory_limit(&registry, name) {
                let max = registry
                    .supervised
                    .processes
                    .get(name)
                    .map(|p| p.max_memory_mb)
                    .unwrap_or(0);
                let rss = registry.supervised.check_memory(name).unwrap_or(0.0);
                emit_supervisor(
                    &handle,
                    "error",
                    name,
                    format!("Memory exceeded: {rss:.0}MB > {max}MB limit"),
                );
            }
        }

        if let Err(error) = handle.emit("budget-metrics", &registry.snapshot()) {
            eprintln!("[budget] metrics emit error: {error}");
        }
    }
}
