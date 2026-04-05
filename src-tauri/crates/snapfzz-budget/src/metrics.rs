use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetMetrics {
    pub preset_name: String,
    pub cpu_used: usize,
    pub cpu_total: usize,
    pub invoke_used: usize,
    pub invoke_total: usize,
    pub frame_target_ms: u64,
    pub batch_rate_ms: u64,
    pub agentscope_rss_mb: Option<f64>,
    pub agentscope_max_mb: u64,
    pub agentscope_status: ProcessStatus,
    pub storage_used_gb: u64,
    pub storage_max_gb: u64,
    pub disabled_plugins: Vec<String>,
    pub uptime_secs: u64,
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
