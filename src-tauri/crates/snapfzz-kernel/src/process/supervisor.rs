use std::time::Duration;

use crate::budget::{metrics::ProcessStatus, BudgetRegistry};
use crate::process::{ProcessError, ProcessManager, SpawnConfig};

pub async fn restart_runtime(
    manager: &ProcessManager,
    name: &str,
    config: &SpawnConfig,
    registry: &BudgetRegistry,
) -> Result<(), ProcessError> {
    manager.shutdown(name).await?;
    manager.spawn(name, config, registry).await?;
    Ok(())
}

pub async fn kill_runtime(manager: &ProcessManager, name: &str) -> Result<(), ProcessError> {
    manager.shutdown(name).await
}

pub fn apply_memory_limit(registry: &BudgetRegistry, name: &str) -> bool {
    let rss = registry.supervised.check_memory(name);
    let max = registry
        .supervised
        .processes
        .get(name)
        .map(|p| p.max_memory_mb)
        .unwrap_or(0);

    if rss.map(|value| value > max as f64).unwrap_or(false) {
        if let Some(mut proc) = registry.supervised.processes.get_mut(name) {
            proc.status = ProcessStatus::Errored;
        }
        return true;
    }

    false
}

pub async fn wait_for_shutdown(child: &mut tokio::process::Child) {
    let _ = tokio::time::timeout(Duration::from_secs(2), child.wait()).await;
}
