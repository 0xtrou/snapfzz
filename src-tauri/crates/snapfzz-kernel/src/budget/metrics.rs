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
    /// Hard memory ceiling from the registered budget.
    pub max_memory_mb: u64,
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
    // Backward-compatible agentscope fields (derived from `processes`).
    pub agentscope_rss_mb: Option<f64>,
    pub agentscope_max_mb: u64,
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
