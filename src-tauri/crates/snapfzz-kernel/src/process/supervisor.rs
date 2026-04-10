use std::time::Duration;

use crate::budget::BudgetRegistry;
use crate::process::ProcessError;

pub async fn kill_runtime(manager: &crate::process::ProcessManager, name: &str) -> Result<(), ProcessError> {
    manager.shutdown(name).await
}

/// A008/UnifiedBudget: Check if total RSS exceeds the unified budget.
/// Returns true if the sum of all process RSS exceeds app_total_mb.
pub fn is_total_memory_exceeded(registry: &BudgetRegistry) -> bool {
    let app_total_mb = {
        let preset = registry.preset.read().unwrap();
        preset.memory.app_total_mb
    };
    registry.supervised.is_total_memory_exceeded(app_total_mb)
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

    use super::{is_total_memory_exceeded, wait_for_shutdown};
    use crate::process::ProcessManager;

    fn make_registry() -> BudgetRegistry {
        BudgetRegistry::with_preset_name(PresetName::Performance)
    }

    fn register_local_process(registry: &BudgetRegistry, name: &str, pid: u32) {
        registry.register_process(
            name,
            ProcessBudget {
                pid: Some(pid),
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
    fn a014_process_supervisor_is_total_memory_exceeded_returns_false_for_empty() {
        let registry = make_registry();
        assert!(!is_total_memory_exceeded(&registry));
    }

    #[test]
    fn a014_process_supervisor_is_total_memory_exceeded_with_process() {
        let registry = make_registry();
        register_local_process(&registry, "agentscope", std::process::id());
        // Just verify it doesn't crash - actual RSS depends on system
        let _result = is_total_memory_exceeded(&registry);
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
