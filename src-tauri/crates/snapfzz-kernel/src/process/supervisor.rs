use std::time::Duration;

use crate::budget::{metrics::ProcessStatus, BudgetRegistry};
use crate::process::{ProcessError, ProcessManager, SpawnConfig};

/// Restarts a runtime process using the legacy spawn pattern.
/// A033/supervisor: Deprecated - use service-specific restart logic instead
#[deprecated(note = "Use spawn_agentscope with shutdown for service-specific restart")]
pub async fn restart_runtime(
    manager: &ProcessManager,
    name: &str,
    config: &SpawnConfig,
    registry: &BudgetRegistry,
) -> Result<(), ProcessError> {
    manager.shutdown(name).await?;
    #[allow(deprecated)]
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

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use crate::budget::{
        metrics::ProcessStatus,
        preset::PresetName,
        supervised::{ProcessBudget, ProcessLocation},
        BudgetRegistry,
    };

    use super::{apply_memory_limit, wait_for_shutdown};
    use crate::process::ProcessManager;

    fn make_registry() -> BudgetRegistry {
        BudgetRegistry::with_preset_name(PresetName::Performance)
    }

    fn register_local_process(registry: &BudgetRegistry, name: &str, pid: u32, max_memory_mb: u64) {
        registry.register_process(
            name,
            ProcessBudget {
                pid: Some(pid),
                max_memory_mb,
                health_url: "http://127.0.0.1:1/health".to_string(),
                health_interval_ms: 1000,
                max_health_failures: 3,
                max_restarts: 3,
                location: ProcessLocation::Local,
                consecutive_failures: 0,
                restart_count: 0,
                status: ProcessStatus::Online,
                started_at: Some(Instant::now()),
                owner: "system".to_string(),
            },
        );
    }

    #[test]
    fn a014_process_supervisor_apply_memory_limit_marks_errored_when_exceeded() {
        let registry = make_registry();
        register_local_process(&registry, "agentscope", std::process::id(), 0);

        let exceeded = apply_memory_limit(&registry, "agentscope");
        assert!(exceeded);

        let entry = registry.supervised.processes.get("agentscope").unwrap();
        assert!(matches!(entry.status, ProcessStatus::Errored));
    }

    #[test]
    fn a014_process_supervisor_apply_memory_limit_returns_false_when_not_exceeded() {
        let registry = make_registry();
        register_local_process(&registry, "agentscope", std::process::id(), u64::MAX);

        let exceeded = apply_memory_limit(&registry, "agentscope");
        assert!(!exceeded);

        let entry = registry.supervised.processes.get("agentscope").unwrap();
        assert!(matches!(entry.status, ProcessStatus::Online));
    }

    #[test]
    fn a014_process_supervisor_apply_memory_limit_unknown_process_is_false() {
        let registry = make_registry();
        assert!(!apply_memory_limit(&registry, "missing"));
    }

    #[tokio::test]
    async fn a014_process_supervisor_wait_for_shutdown_handles_exited_child() {
        let mut child = tokio::process::Command::new("sh")
            .arg("-c")
            .arg("exit 0")
            .spawn()
            .expect("spawn shell child");

        wait_for_shutdown(&mut child).await;
    }

    #[tokio::test]
    async fn a014_process_supervisor_kill_runtime_unknown_process_is_noop() {
        let manager = ProcessManager::new();
        super::kill_runtime(&manager, "unknown")
            .await
            .expect("kill_runtime should no-op for missing process");
    }

}
