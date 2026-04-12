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

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use crate::budget::{
        metrics::ProcessStatus,
        preset::PresetName,
        supervised::{ProcessBudget, ProcessLocation},
        BudgetRegistry,
    };

    use super::{apply_health_check, wait_until_healthy};

    fn make_registry() -> BudgetRegistry {
        BudgetRegistry::with_preset_name(PresetName::Performance)
    }

    fn register_health_process(registry: &BudgetRegistry, name: &str, health_url: String) {
        registry.register_process(
            name,
            ProcessBudget {
                pid: None,
                health_url,
                health_interval_ms: 50,
                max_health_failures: 3,
                max_restarts: 3,
                location: ProcessLocation::Local,
                consecutive_failures: 0,
                restart_count: 0,
                status: ProcessStatus::Starting,
                started_at: None,
                owner: "system".to_string(),
            },
        );
    }

    async fn spawn_health_server(status_line: &str) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test health listener");
        let addr = listener.local_addr().expect("listener addr");
        let response = format!("HTTP/1.1 {status_line}\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK");

        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buf = [0_u8; 1024];
                let _ = socket.read(&mut buf).await;
                let _ = socket.write_all(response.as_bytes()).await;
                let _ = socket.shutdown().await;
            }
        });

        format!("http://{addr}/health")
    }

    #[tokio::test]
    async fn a014_process_health_wait_until_healthy_times_out_with_computed_timeout() {
        let registry = make_registry();
        register_health_process(
            &registry,
            "agentscope",
            "none://skip".to_string(),
        );

        let error = wait_until_healthy(&registry, "agentscope", 0, Duration::from_millis(7))
            .await
            .expect_err("should timeout when max_attempts is zero");

        match error {
            crate::process::ProcessError::HealthTimeout { name, timeout_ms } => {
                assert_eq!(name, "agentscope");
                assert_eq!(timeout_ms, 0);
            }
            other => panic!("unexpected error variant: {other:?}"),
        }
    }

    #[tokio::test]
    async fn a014_process_health_wait_until_healthy_sets_online_status() {
        let registry = make_registry();
        let url = spawn_health_server("200 OK").await;
        register_health_process(&registry, "agentscope", url);

        wait_until_healthy(&registry, "agentscope", 2, Duration::from_millis(1))
            .await
            .expect("health should become online");

        let entry = registry
            .supervised
            .processes
            .get("agentscope")
            .expect("process should exist");
        assert!(matches!(entry.status, ProcessStatus::Online));
        assert_eq!(entry.consecutive_failures, 0);
    }

    #[tokio::test]
    async fn a014_process_health_apply_health_check_increments_and_resets_failures() {
        let registry = make_registry();
        register_health_process(
            &registry,
            "agentscope",
            "none://skip".to_string(),
        );

        let failures = apply_health_check(&registry, "agentscope").await;
        assert_eq!(failures, Some(1));
        {
            let entry = registry.supervised.processes.get("agentscope").unwrap();
            assert!(matches!(entry.status, ProcessStatus::Unhealthy));
            assert_eq!(entry.consecutive_failures, 1);
        }

        let healthy_url = spawn_health_server("200 OK").await;
        if let Some(mut entry) = registry.supervised.processes.get_mut("agentscope") {
            entry.health_url = healthy_url;
            entry.consecutive_failures = 4;
        }

        let failures = apply_health_check(&registry, "agentscope").await;
        assert_eq!(failures, None);
        let entry = registry.supervised.processes.get("agentscope").unwrap();
        assert!(matches!(entry.status, ProcessStatus::Online));
        assert_eq!(entry.consecutive_failures, 0);
    }

    #[tokio::test]
    async fn a014_process_health_apply_health_check_unknown_process_returns_none() {
        let registry = make_registry();
        assert_eq!(apply_health_check(&registry, "missing").await, None);
    }
}
