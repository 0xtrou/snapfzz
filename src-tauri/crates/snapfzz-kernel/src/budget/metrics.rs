use serde::Serialize;

use crate::constants::status;

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
            location: status::LOCATION_LOCAL.to_string(),
            health_url: String::new(),
            owner: owner.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{BudgetMetrics, BudgetViolation, ProcessSnapshot, ProcessStatus};
    use serde_json::Value;

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

    // --- ProcessSnapshot serialization ---

    #[test]
    fn a008_metrics_process_snapshot_serializes_camel_case_keys() {
        // A008/metrics: ProcessSnapshot has #[serde(rename_all = "camelCase")] — all JSON
        // keys must be camelCase so the frontend TypeScript types align.
        let snap = ProcessSnapshot::stopped("agentscope", "system");
        let v: Value = serde_json::to_value(&snap).expect("serialization must not fail");

        // Verify camelCase key names are present (not their snake_case equivalents).
        assert!(v.get("restartCount").is_some(), "expected restartCount key");
        assert!(v.get("consecutiveFailures").is_some(), "expected consecutiveFailures key");
        assert!(v.get("uptimeSecs").is_some(), "expected uptimeSecs key");
        assert!(v.get("healthUrl").is_some(), "expected healthUrl key");

        // Confirm snake_case variants are absent.
        assert!(v.get("restart_count").is_none(), "snake_case key must not appear");
        assert!(v.get("consecutive_failures").is_none(), "snake_case key must not appear");
    }

    #[test]
    fn a008_metrics_process_snapshot_stopped_serializes_null_optionals() {
        // A008/metrics: Optional fields on a stopped snapshot must serialize as JSON null,
        // not be omitted, so the frontend can unconditionally access them.
        let snap = ProcessSnapshot::stopped("boxlite", "system");
        let v: Value = serde_json::to_value(&snap).expect("serialization must not fail");

        assert!(v["pid"].is_null(), "pid must be null for a stopped process");
        assert!(v["rssMb"].is_null(), "rssMb must be null for a stopped process");
        assert!(v["cpuPct"].is_null(), "cpuPct must be null for a stopped process");
    }

    #[test]
    fn a008_metrics_process_snapshot_stopped_status_string() {
        // A008/metrics: ProcessStatus variants are serialized as lowercase strings per
        // #[serde(rename_all = "lowercase")] — Stopped must round-trip as "stopped".
        let snap = ProcessSnapshot::stopped("svc", "system");
        let v: Value = serde_json::to_value(&snap).expect("serialization must not fail");

        assert_eq!(v["status"], Value::String("stopped".into()));
    }

    #[test]
    fn a008_metrics_process_snapshot_online_status_string() {
        // A008/metrics: ProcessStatus::Online must serialize as the lowercase string "online".
        let v: Value =
            serde_json::to_value(ProcessStatus::Online).expect("serialization must not fail");
        assert_eq!(v, Value::String("online".into()));
    }

    #[test]
    fn a008_metrics_process_status_all_variants_serialize_lowercase() {
        // A008/metrics: Every ProcessStatus variant must produce a lowercase JSON string —
        // no upper-case characters allowed (guards against future variant additions missing
        // the serde attribute).
        let variants: &[(ProcessStatus, &str)] = &[
            (ProcessStatus::Starting, "starting"),
            (ProcessStatus::Online, "online"),
            (ProcessStatus::Unhealthy, "unhealthy"),
            (ProcessStatus::Restarting, "restarting"),
            (ProcessStatus::Stopped, "stopped"),
            (ProcessStatus::Errored, "errored"),
        ];
        for (variant, expected) in variants {
            let v: Value =
                serde_json::to_value(variant).expect("serialization must not fail");
            assert_eq!(
                v,
                Value::String((*expected).into()),
                "variant serialized incorrectly"
            );
        }
    }

    // --- BudgetMetrics construction and serialization ---

    fn sample_budget_metrics() -> BudgetMetrics {
        // A008/metrics: Helper that constructs a fully populated BudgetMetrics so multiple
        // tests can reuse the same baseline without duplicating field assignments.
        BudgetMetrics {
            preset_name: "default".to_string(),
            cpu_used: 2,
            cpu_total: 8,
            invoke_used: 10,
            invoke_total: 100,
            batch_interval_ms: 500,
            batch_rate_ms: 250,
            app_total_mb: 4096,
            total_rss_mb: 512.0,
            agentscope_rss_mb: Some(256.0),
            agentscope_status: ProcessStatus::Online,
            storage_used_gb: 20,
            storage_max_gb: 500,
            disabled_plugins: vec!["plugin-a".to_string()],
            uptime_secs: 3600,
            processes: vec![ProcessSnapshot::stopped("agentscope", "system")],
        }
    }

    #[test]
    fn a008_metrics_budget_metrics_construction_fields_round_trip() {
        // A008/metrics: BudgetMetrics fields must survive a struct->JSON->Value round trip
        // with correct values so the budget command response is trustworthy.
        let m = sample_budget_metrics();

        assert_eq!(m.preset_name, "default");
        assert_eq!(m.cpu_used, 2);
        assert_eq!(m.cpu_total, 8);
        assert_eq!(m.invoke_used, 10);
        assert_eq!(m.invoke_total, 100);
        assert_eq!(m.batch_interval_ms, 500);
        assert_eq!(m.batch_rate_ms, 250);
        assert_eq!(m.app_total_mb, 4096);
        assert_eq!(m.total_rss_mb, 512.0);
        assert_eq!(m.storage_used_gb, 20);
        assert_eq!(m.storage_max_gb, 500);
        assert_eq!(m.uptime_secs, 3600);
        assert_eq!(m.disabled_plugins, vec!["plugin-a"]);
        assert_eq!(m.processes.len(), 1);
    }

    #[test]
    fn a008_metrics_budget_metrics_serializes_camel_case_keys() {
        // A008/metrics: BudgetMetrics has #[serde(rename_all = "camelCase")] — all top-level
        // JSON keys must be camelCase for the frontend budget hook.
        let v: Value =
            serde_json::to_value(sample_budget_metrics()).expect("serialization must not fail");

        let expected_keys = [
            "presetName",
            "cpuUsed",
            "cpuTotal",
            "invokeUsed",
            "invokeTotal",
            "batchIntervalMs",
            "batchRateMs",
            "appTotalMb",
            "totalRssMb",
            "agentscopeRssMb",
            "agentscopeStatus",
            "storageUsedGb",
            "storageMaxGb",
            "disabledPlugins",
            "uptimeSecs",
            "processes",
        ];
        for key in &expected_keys {
            assert!(
                v.get(key).is_some(),
                "expected camelCase key '{}' in BudgetMetrics JSON",
                key
            );
        }
    }

    #[test]
    fn a008_metrics_budget_metrics_agentscope_backward_compat_some() {
        // A008/metrics: agentscope_rss_mb is a backward-compat field — when Some it must
        // serialize as a JSON number (not null) so older clients reading the field still work.
        let v: Value =
            serde_json::to_value(sample_budget_metrics()).expect("serialization must not fail");

        assert!(
            v["agentscopeRssMb"].is_number(),
            "agentscopeRssMb must be a number when Some"
        );
        assert_eq!(v["agentscopeRssMb"].as_f64().unwrap(), 256.0);
        assert_eq!(v["agentscopeStatus"], Value::String("online".into()));
    }

    #[test]
    fn a008_metrics_budget_metrics_agentscope_backward_compat_none() {
        // A008/metrics: agentscope_rss_mb serializes as JSON null when None — field is always
        // present in the payload (not omitted) to keep the frontend schema stable.
        let mut m = sample_budget_metrics();
        m.agentscope_rss_mb = None;
        m.agentscope_status = ProcessStatus::Stopped;

        let v: Value = serde_json::to_value(m).expect("serialization must not fail");

        assert!(v["agentscopeRssMb"].is_null(), "agentscopeRssMb must be null when None");
        assert_eq!(v["agentscopeStatus"], Value::String("stopped".into()));
    }

    #[test]
    fn a008_metrics_budget_metrics_processes_array_serialized() {
        // A008/metrics: The processes field must serialize as a JSON array; its inner
        // ProcessSnapshot items use the same camelCase schema.
        let v: Value =
            serde_json::to_value(sample_budget_metrics()).expect("serialization must not fail");

        let processes = v["processes"].as_array().expect("processes must be an array");
        assert_eq!(processes.len(), 1);
        assert_eq!(processes[0]["name"], Value::String("agentscope".into()));
        assert_eq!(processes[0]["status"], Value::String("stopped".into()));
    }

    #[test]
    fn a008_metrics_budget_metrics_disabled_plugins_empty_array() {
        // A008/metrics: disabledPlugins with no entries must serialize as an empty JSON
        // array [], not null, so the frontend can iterate without a null-check.
        let mut m = sample_budget_metrics();
        m.disabled_plugins = vec![];

        let v: Value = serde_json::to_value(m).expect("serialization must not fail");

        let arr = v["disabledPlugins"].as_array().expect("disabledPlugins must be an array");
        assert!(arr.is_empty(), "disabledPlugins must be [] when no plugins are disabled");
    }

    // --- BudgetViolation serialization ---

    #[test]
    fn a008_metrics_budget_violation_serializes_camel_case_keys() {
        // A008/metrics: BudgetViolation is surfaced to the frontend via the budget command —
        // keys must be camelCase and values must round-trip without loss.
        let v = BudgetViolation {
            class: "memory".to_string(),
            metric: "rss_mb".to_string(),
            actual_ms: 1234.5,
            target_ms: 1000,
            timestamp_ms: 9999999,
        };
        let json: Value = serde_json::to_value(&v).expect("serialization must not fail");

        assert!(json.get("actualMs").is_some(), "expected actualMs key");
        assert!(json.get("targetMs").is_some(), "expected targetMs key");
        assert!(json.get("timestampMs").is_some(), "expected timestampMs key");
        assert!(json.get("actual_ms").is_none(), "snake_case must not appear");

        assert_eq!(json["class"], Value::String("memory".into()));
        assert_eq!(json["metric"], Value::String("rss_mb".into()));
        assert_eq!(json["actualMs"].as_f64().unwrap(), 1234.5);
        assert_eq!(json["targetMs"].as_u64().unwrap(), 1000);
        assert_eq!(json["timestampMs"].as_u64().unwrap(), 9999999);
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
