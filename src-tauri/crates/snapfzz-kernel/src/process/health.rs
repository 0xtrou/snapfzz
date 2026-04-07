use std::time::Duration;

use crate::budget::{metrics::ProcessStatus, BudgetRegistry};
use crate::process::ProcessError;

pub async fn wait_until_healthy(
    registry: &BudgetRegistry,
    name: &str,
    max_attempts: u32,
    interval: Duration,
) -> Result<(), ProcessError> {
    for _ in 0..max_attempts {
        tokio::time::sleep(interval).await;
        if registry.supervised.check_health(name).await {
            if let Some(mut entry) = registry.supervised.processes.get_mut(name) {
                entry.status = ProcessStatus::Online;
                entry.consecutive_failures = 0;
            }
            return Ok(());
        }
    }

    Err(ProcessError::HealthTimeout {
        name: name.to_string(),
        timeout_ms: max_attempts as u64 * interval.as_millis() as u64,
    })
}

pub async fn apply_health_check(registry: &BudgetRegistry, name: &str) -> Option<u32> {
    let healthy = registry.supervised.check_health(name).await;
    let mut failures_to_emit = None;

    if let Some(mut proc) = registry.supervised.processes.get_mut(name) {
        if healthy {
            proc.status = ProcessStatus::Online;
            proc.consecutive_failures = 0;
        } else {
            proc.consecutive_failures += 1;
            proc.status = ProcessStatus::Unhealthy;
            failures_to_emit = Some(proc.consecutive_failures);
        }
    }

    failures_to_emit
}
