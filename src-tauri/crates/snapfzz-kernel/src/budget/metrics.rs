use serde::Serialize;

/// A008/metrics: snapshot of a single supervised process at a point in time.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSnapshot {
    /// Registered name (e.g. "agentscope", "boxlite").
    pub name: String,
    /// OS PID if the process is local and running.
    pub pid: Option<u32>,
    /// Current lifecycle status.
    pub status: ProcessStatus,
    /// Resident-set size in MB for local processes; None for cloud.
    pub rss_mb: Option<f64>,
    /// CPU usage percentage sampled on the last enforce_loop tick.
    pub cpu_pct: Option<f32>,
    /// Number of times the process has been restarted.
    pub restart_count: u32,
    /// Consecutive health-check failures since the last success.
    pub consecutive_failures: u32,
    /// Seconds since the process was started (0 if not yet started).
    pub uptime_secs: u64,
    /// Human-readable location: "local" or the cloud endpoint URL.
    pub location: String,
    /// Health-check URL used by the enforce loop.
    pub health_url: String,
    /// Owner identifier: "system" or "plugin.<id>".
    pub owner: String,
}

impl ProcessSnapshot {
    // A037/list_snapshots: Synthetic Stopped snapshot for a registered but not-yet-spawned factory.
    pub fn stopped(name: &str, owner: &str) -> Self {
        Self {
            name: name.to_string(),
            pid: None,
            status: ProcessStatus::Stopped,
            rss_mb: None,
            cpu_pct: None,
            restart_count: 0,
            consecutive_failures: 0,
            uptime_secs: 0,
            location: "local".to_string(),
            health_url: String::new(),
            owner: owner.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ProcessSnapshot, ProcessStatus};

    #[test]
    fn t37_metrics_stopped_constructor_sets_all_fields() {
        // A037/list_snapshots: ProcessSnapshot::stopped must populate every field with
        // correct defaults so the UI can render an unspawned service without panicking.
        let snap = ProcessSnapshot::stopped("litellm", "snapfzz");

        assert_eq!(snap.name, "litellm");
        assert_eq!(snap.owner, "snapfzz");
        assert!(snap.pid.is_none());
        assert!(snap.rss_mb.is_none());
        assert!(snap.cpu_pct.is_none());
        assert_eq!(snap.restart_count, 0);
        assert_eq!(snap.consecutive_failures, 0);
        assert_eq!(snap.uptime_secs, 0);
        assert_eq!(snap.location, "local");
        assert_eq!(snap.health_url, "");
        assert!(matches!(snap.status, ProcessStatus::Stopped));
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetMetrics {
    pub preset_name: String,
    pub cpu_used: usize,
    pub cpu_total: usize,
    pub invoke_used: usize,
    pub invoke_total: usize,
    pub batch_interval_ms: u64,
    pub batch_rate_ms: u64,
    /// Unified memory budget shared by all processes (MB)
    pub app_total_mb: u64,
    /// Sum of RSS across all local processes (MB)
    pub total_rss_mb: f64,
    /// Backward-compatible agentscope fields (derived from `processes`).
    pub agentscope_rss_mb: Option<f64>,
    pub agentscope_status: ProcessStatus,
    pub storage_used_gb: u64,
    pub storage_max_gb: u64,
    pub disabled_plugins: Vec<String>,
    pub uptime_secs: u64,
    /// Full per-process snapshot list (A008: generic monitoring).
    pub processes: Vec<ProcessSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessStatus {
    Starting,
    Online,
    Unhealthy,
    Restarting,
    Stopped,
    Errored,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetViolation {
    pub class: String,
    pub metric: String,
    pub actual_ms: f64,
    pub target_ms: u64,
    pub timestamp_ms: u64,
}
