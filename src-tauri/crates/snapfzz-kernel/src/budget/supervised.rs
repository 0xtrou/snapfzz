use std::path::PathBuf;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use sysinfo::{Pid as SysPid, ProcessesToUpdate, System};

use crate::budget::metrics::{ProcessSnapshot, ProcessStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessLocation {
    Local,
    Cloud { endpoint: String },
}

#[derive(Debug, Clone)]
pub struct ProcessBudget {
    pub pid: Option<u32>,
    pub health_url: String,
    pub health_interval_ms: u64,
    pub max_health_failures: u32,
    pub max_restarts: u32,
    pub location: ProcessLocation,
    pub consecutive_failures: u32,
    pub restart_count: u32,
    pub status: ProcessStatus,
    pub started_at: Option<Instant>,
    pub owner: String,
}

#[derive(Debug, Clone)]
pub struct StorageState {
    pub max_gb: u64,
    pub paths: Vec<PathBuf>,
    pub cleanup_threshold_pct: u8,
}

pub struct SupervisedBudgets {
    pub processes: DashMap<String, ProcessBudget>,
    pub storage: StorageState,
    http_client: reqwest::Client,
}

impl SupervisedBudgets {
    pub fn new(storage: StorageState) -> Self {
        Self {
            processes: DashMap::new(),
            storage,
            http_client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(2))
                .timeout(Duration::from_secs(2))
                .build()
                .unwrap_or_default(),
        }
    }

    pub fn register_process(&self, name: &str, budget: ProcessBudget) {
        self.processes.insert(name.to_string(), budget);
    }

    pub fn unregister_process(&self, name: &str) {
        self.processes.remove(name);
    }

    pub fn update_pid(&self, name: &str, pid: u32) {
        if let Some(mut entry) = self.processes.get_mut(name) {
            entry.pid = Some(pid);
        }
    }

    pub fn check_memory(&self, name: &str) -> Option<f64> {
        let entry = self.processes.get(name)?;
        let pid = entry.pid?;

        match &entry.location {
            ProcessLocation::Local => {
                let mut sys = System::new_all();
                sys.refresh_processes(ProcessesToUpdate::Some(&[SysPid::from_u32(pid)]), true);
                sys.process(SysPid::from_u32(pid))
                    .map(|p| p.memory() as f64 / 1_048_576.0)
            }
            ProcessLocation::Cloud { .. } => None,
        }
    }

    /// A008/CPU: Get CPU percentage for a process by name.
    pub fn check_cpu(&self, name: &str) -> Option<f32> {
        let entry = self.processes.get(name)?;
        let pid = entry.pid?;

        match &entry.location {
            ProcessLocation::Local => {
                let mut sys = System::new_all();
                sys.refresh_processes(ProcessesToUpdate::Some(&[SysPid::from_u32(pid)]), true);
                sys.process(SysPid::from_u32(pid))
                    .map(|p| p.cpu_usage() as f32)
            }
            ProcessLocation::Cloud { .. } => None,
        }
    }

    pub async fn check_health(&self, name: &str) -> bool {
        let url = match self.processes.get(name) {
            Some(entry) => entry.health_url.clone(),
            None => return false,
        };

        if url.is_empty() || !url.starts_with("http") {
            return false;
        }

        self.http_client
            .get(&url)
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    pub fn record_health_failure(&self, name: &str) -> bool {
        if let Some(mut entry) = self.processes.get_mut(name) {
            entry.consecutive_failures += 1;
            return entry.consecutive_failures >= entry.max_health_failures;
        }
        false
    }

    pub fn reset_health_failures(&self, name: &str) {
        if let Some(mut entry) = self.processes.get_mut(name) {
            entry.consecutive_failures = 0;
        }
    }

    pub fn record_restart(&self, name: &str) -> bool {
        if let Some(mut entry) = self.processes.get_mut(name) {
            entry.restart_count += 1;
            return entry.restart_count > entry.max_restarts;
        }
        false
    }

    pub fn list_snapshots(&self) -> Vec<ProcessSnapshot> {
        self.processes
            .iter()
            .map(|entry| {
                let name = entry.key().clone();
                let budget = entry.value();

                let (rss_mb, cpu_pct) = budget.pid.and_then(|pid| match &budget.location {
                    ProcessLocation::Local => {
                        let mut sys = System::new_all();
                        sys.refresh_processes(
                            ProcessesToUpdate::Some(&[SysPid::from_u32(pid)]),
                            true,
                        );
                        sys.process(SysPid::from_u32(pid)).map(|p| {
                            let rss = p.memory() as f64 / 1_048_576.0;
                            let cpu = p.cpu_usage() as f32;
                            (Some(rss), Some(cpu))
                        })
                    }
                    ProcessLocation::Cloud { .. } => None,
                }).unwrap_or((None, None));

                let location = match &budget.location {
                    ProcessLocation::Local => "local".to_string(),
                    ProcessLocation::Cloud { endpoint } => endpoint.clone(),
                };

                let uptime_secs = budget.started_at.map(|t| t.elapsed().as_secs()).unwrap_or(0);

                ProcessSnapshot {
                    name,
                    pid: budget.pid,
                    status: budget.status.clone(),
                    rss_mb,
                    cpu_pct,
                    restart_count: budget.restart_count,
                    consecutive_failures: budget.consecutive_failures,
                    uptime_secs,
                    location,
                    health_url: budget.health_url.clone(),
                    owner: budget.owner.clone(),
                }
            })
            .collect()
    }

    /// A008/UnifiedBudget: Sum of RSS across all local processes.
    pub fn total_rss_mb(&self) -> f64 {
        self.processes
            .iter()
            .filter_map(|entry| {
                let budget = entry.value();
                let pid = budget.pid?;
                match &budget.location {
                    ProcessLocation::Local => {
                        let mut sys = System::new_all();
                        sys.refresh_processes(
                            ProcessesToUpdate::Some(&[SysPid::from_u32(pid)]),
                            true,
                        );
                        sys.process(SysPid::from_u32(pid))
                            .map(|p| p.memory() as f64 / 1_048_576.0)
                    }
                    ProcessLocation::Cloud { .. } => None,
                }
            })
            .sum()
    }

    /// A008/UnifiedBudget: Check if total RSS exceeds the unified budget limit.
    pub fn is_total_memory_exceeded(&self, app_total_mb: u64) -> bool {
        let total_rss = self.total_rss_mb();
        total_rss > app_total_mb as f64
    }

    pub fn measure_storage(&self) -> u64 {
        let mut total_bytes: u64 = 0;
        for path in &self.storage.paths {
            if path.exists() {
                total_bytes += dir_size(path);
            }
        }
        total_bytes / (1024 * 1024 * 1024)
    }

    pub fn is_storage_exceeded(&self) -> bool {
        let used_gb = self.measure_storage();
        let threshold_gb = self.storage.max_gb * self.storage.cleanup_threshold_pct as u64 / 100;
        used_gb >= threshold_gb
    }
}

fn dir_size(path: &PathBuf) -> u64 {
    std::fs::read_dir(path)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .map(|e| {
                    let meta = e.metadata().ok();
                    if e.path().is_dir() {
                        dir_size(&e.path())
                    } else {
                        meta.map(|m| m.len()).unwrap_or(0)
                    }
                })
                .sum()
        })
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::budget::metrics::ProcessStatus;
    use std::path::PathBuf;

    fn make_supervised() -> SupervisedBudgets {
        SupervisedBudgets::new(StorageState {
            max_gb: 10,
            paths: vec![PathBuf::from("/tmp/snapfzz-test-nonexistent")],
            cleanup_threshold_pct: 90,
        })
    }

    fn make_budget(name_hint: &str) -> ProcessBudget {
        ProcessBudget {
            pid: Some(1),
            health_url: "http://127.0.0.1:9999/health".into(),
            health_interval_ms: 2000,
            max_health_failures: 3,
            max_restarts: 10,
            location: ProcessLocation::Local,
            consecutive_failures: 0,
            restart_count: 0,
            status: ProcessStatus::Starting,
            started_at: None,
            owner: format!("system.{name_hint}"),
        }
    }

    #[test]
    fn a008_supervised_register_process_stores_budget() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));
        assert!(sup.processes.contains_key("test"));
    }

    #[test]
    fn a008_supervised_unregister_removes_process() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));
        sup.unregister_process("test");
        assert!(!sup.processes.contains_key("test"));
    }

    #[test]
    fn a008_supervised_update_pid() {
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                pid: None,
                ..make_budget("test")
            },
        );
        sup.update_pid("test", 42);
        assert_eq!(sup.processes.get("test").unwrap().pid, Some(42));
    }

    #[test]
    fn a008_supervised_health_failure_tracking() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));
        assert!(!sup.record_health_failure("test"));
        assert!(!sup.record_health_failure("test"));
        assert!(sup.record_health_failure("test"));
    }

    #[test]
    fn a008_supervised_reset_health_failures() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));
        sup.record_health_failure("test");
        sup.record_health_failure("test");
        sup.reset_health_failures("test");
        assert!(!sup.record_health_failure("test"));
    }

    #[test]
    fn a008_supervised_restart_count_exceeds_max() {
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                max_restarts: 2,
                ..make_budget("test")
            },
        );
        assert!(!sup.record_restart("test"));
        assert!(!sup.record_restart("test"));
        assert!(sup.record_restart("test"));
    }

    #[test]
    fn a008_supervised_storage_nonexistent_path_returns_zero() {
        let sup = make_supervised();
        assert_eq!(sup.measure_storage(), 0);
    }

    #[test]
    fn a008_supervised_memory_check_returns_none_for_invalid_pid() {
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                pid: Some(999999999),
                ..make_budget("test")
            },
        );
        assert!(sup.check_memory("test").is_none());
    }

    #[test]
    fn a008_supervised_cloud_process_memory_returns_none() {
        let sup = make_supervised();
        sup.register_process(
            "cloud",
            ProcessBudget {
                pid: Some(1),
                health_url: "http://cloud.example.com:8090/health".into(),
                health_interval_ms: 5000,
                max_health_failures: 5,
                max_restarts: 20,
                location: ProcessLocation::Cloud {
                    endpoint: "cloud.example.com".into(),
                },
                consecutive_failures: 0,
                restart_count: 0,
                status: ProcessStatus::Starting,
                started_at: None,
                owner: "system.cloud".into(),
            },
        );
        assert!(sup.check_memory("cloud").is_none());
    }

    #[test]
    fn a008_supervised_list_snapshots_returns_all_processes() {
        let sup = make_supervised();
        sup.register_process("alpha", make_budget("alpha"));
        sup.register_process("beta", make_budget("beta"));

        let mut snapshots = sup.list_snapshots();
        snapshots.sort_by(|a, b| a.name.cmp(&b.name));

        assert_eq!(snapshots.len(), 2);
        assert_eq!(snapshots[0].name, "alpha");
        assert_eq!(snapshots[0].owner, "system.alpha");
        assert_eq!(snapshots[1].name, "beta");
        assert_eq!(snapshots[1].owner, "system.beta");
    }

    #[test]
    fn a008_supervised_status_starts_as_starting() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));

        let entry = sup.processes.get("test").unwrap();
        assert!(matches!(entry.status, ProcessStatus::Starting));
    }

    #[test]
    fn a008_supervised_status_transitions_to_online() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));

        {
            let mut entry = sup.processes.get_mut("test").unwrap();
            entry.status = ProcessStatus::Online;
        }

        let entry = sup.processes.get("test").unwrap();
        assert!(matches!(entry.status, ProcessStatus::Online));
    }

    #[test]
    fn a008_supervised_status_tracks_consecutive_failures() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));

        sup.record_health_failure("test");
        sup.record_health_failure("test");
        sup.record_health_failure("test");

        let entry = sup.processes.get("test").unwrap();
        assert_eq!(entry.consecutive_failures, 3);
    }

    #[test]
    fn a008_supervised_list_snapshots_includes_status_online() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));

        {
            let mut entry = sup.processes.get_mut("test").unwrap();
            entry.status = ProcessStatus::Online;
        }

        let snapshots = sup.list_snapshots();
        let snap = snapshots.iter().find(|s| s.name == "test").unwrap();
        assert!(matches!(snap.status, ProcessStatus::Online));
    }

    #[test]
    fn a008_supervised_list_snapshots_includes_owner() {
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                owner: "system".to_string(),
                ..make_budget("test")
            },
        );

        let snapshots = sup.list_snapshots();
        let snap = snapshots.iter().find(|s| s.name == "test").unwrap();
        assert_eq!(snap.owner, "system");
    }

    #[test]
    fn a008_supervised_list_snapshots_includes_uptime() {
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                started_at: Some(std::time::Instant::now() - std::time::Duration::from_secs(5)),
                ..make_budget("test")
            },
        );

        let snapshots = sup.list_snapshots();
        let snap = snapshots.iter().find(|s| s.name == "test").unwrap();
        assert!(
            snap.uptime_secs >= 5,
            "uptime_secs should be at least 5, got {}",
            snap.uptime_secs
        );
    }

    #[test]
    fn a008_supervised_register_preserves_started_at() {
        let now = std::time::Instant::now();
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                started_at: Some(now),
                ..make_budget("test")
            },
        );

        let entry = sup.processes.get("test").unwrap();
        assert!(entry.started_at.is_some());
    }

    // --- check_memory / check_cpu: missing pid returns None ---

    #[test]
    fn a008_supervised_check_memory_returns_none_for_missing_name() {
        let sup = make_supervised();
        assert!(sup.check_memory("nonexistent").is_none());
    }

    #[test]
    fn a008_supervised_check_cpu_returns_none_for_missing_name() {
        let sup = make_supervised();
        assert!(sup.check_cpu("nonexistent").is_none());
    }

    #[test]
    fn a008_supervised_check_memory_returns_none_when_pid_is_none() {
        let sup = make_supervised();
        sup.register_process(
            "no-pid",
            ProcessBudget {
                pid: None,
                ..make_budget("no-pid")
            },
        );
        assert!(sup.check_memory("no-pid").is_none());
    }

    #[test]
    fn a008_supervised_check_cpu_returns_none_when_pid_is_none() {
        let sup = make_supervised();
        sup.register_process(
            "no-pid-cpu",
            ProcessBudget {
                pid: None,
                ..make_budget("no-pid-cpu")
            },
        );
        assert!(sup.check_cpu("no-pid-cpu").is_none());
    }

    // --- Cloud process: check_memory and check_cpu return None ---

    fn make_cloud_budget(name: &str) -> ProcessBudget {
        ProcessBudget {
            pid: Some(1234),
            health_url: "http://cloud.example.com:8090/health".into(),
            health_interval_ms: 5000,
            max_health_failures: 5,
            max_restarts: 20,
            location: ProcessLocation::Cloud {
                endpoint: "cloud.example.com".into(),
            },
            consecutive_failures: 0,
            restart_count: 0,
            status: ProcessStatus::Online,
            started_at: None,
            owner: format!("system.{name}"),
        }
    }

    #[test]
    fn a008_supervised_cloud_process_cpu_returns_none() {
        let sup = make_supervised();
        sup.register_process("cloud-cpu", make_cloud_budget("cloud-cpu"));
        assert!(sup.check_cpu("cloud-cpu").is_none());
    }

    // --- total_rss_mb: cloud processes excluded ---

    #[test]
    fn a008_supervised_total_rss_mb_excludes_cloud_processes() {
        let sup = make_supervised();
        sup.register_process("cloud-rss", make_cloud_budget("cloud-rss"));
        // Cloud processes contribute no RSS, so total must be 0.0
        assert_eq!(sup.total_rss_mb(), 0.0);
    }

    #[test]
    fn a008_supervised_total_rss_mb_excludes_processes_without_pid() {
        let sup = make_supervised();
        sup.register_process(
            "no-pid-rss",
            ProcessBudget {
                pid: None,
                ..make_budget("no-pid-rss")
            },
        );
        assert_eq!(sup.total_rss_mb(), 0.0);
    }

    // --- is_total_memory_exceeded ---

    #[test]
    fn a008_supervised_is_total_memory_not_exceeded_with_no_processes() {
        let sup = make_supervised();
        assert!(!sup.is_total_memory_exceeded(0));
    }

    #[test]
    fn a008_supervised_is_total_memory_not_exceeded_with_large_budget() {
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                pid: Some(std::process::id()),
                ..make_budget("test")
            },
        );
        // u64::MAX budget cannot be exceeded
        assert!(!sup.is_total_memory_exceeded(u64::MAX));
    }

    // --- Cloud process in list_snapshots ---

    #[test]
    fn a008_supervised_list_snapshots_cloud_location_uses_endpoint_string() {
        let sup = make_supervised();
        sup.register_process("cloud-snap", make_cloud_budget("cloud-snap"));
        let snapshots = sup.list_snapshots();
        let snap = snapshots.iter().find(|s| s.name == "cloud-snap").unwrap();
        assert_eq!(snap.location, "cloud.example.com");
        assert!(snap.rss_mb.is_none());
        assert!(snap.cpu_pct.is_none());
    }

    #[test]
    fn a008_supervised_list_snapshots_local_location_is_local_string() {
        let sup = make_supervised();
        sup.register_process("local-snap", make_budget("local-snap"));
        let snapshots = sup.list_snapshots();
        let snap = snapshots.iter().find(|s| s.name == "local-snap").unwrap();
        assert_eq!(snap.location, "local");
    }

    // --- is_storage_exceeded ---

    #[test]
    fn a008_supervised_is_storage_not_exceeded_for_nonexistent_path() {
        // storage.paths points at a non-existent dir, so used is 0 GB.
        // threshold = 10 * 90 / 100 = 9 GB. 0 < 9, not exceeded.
        let sup = make_supervised();
        assert!(!sup.is_storage_exceeded());
    }

    #[test]
    fn a008_supervised_is_storage_exceeded_when_threshold_is_zero() {
        // max_gb=0 → threshold = 0*90/100 = 0 GB. used_gb(0) >= 0 → exceeded.
        let sup = SupervisedBudgets::new(StorageState {
            max_gb: 0,
            paths: vec![PathBuf::from("/tmp/snapfzz-test-nonexistent")],
            cleanup_threshold_pct: 90,
        });
        assert!(sup.is_storage_exceeded());
    }

    // --- dir_size via measure_storage with real files ---

    #[test]
    fn a008_supervised_measure_storage_counts_real_files() {
        let tmp = tempfile::tempdir().expect("tempdir");
        // Write a non-trivial file to ensure dir_size recurses.
        let nested = tmp.path().join("nested");
        std::fs::create_dir_all(&nested).expect("create nested dir");
        std::fs::write(nested.join("data.bin"), vec![0u8; 1024]).expect("write test file");
        std::fs::write(tmp.path().join("top.bin"), vec![0u8; 512]).expect("write top file");

        let sup = SupervisedBudgets::new(StorageState {
            max_gb: 100,
            paths: vec![tmp.path().to_path_buf()],
            cleanup_threshold_pct: 90,
        });

        // measure_storage returns GB, so for tiny test data this is still 0 GB.
        // The important thing: no panic and dir_size is executed.
        let used = sup.measure_storage();
        assert_eq!(used, 0); // 1536 bytes << 1 GB
    }

    // --- record_restart edge case: unknown process ---

    #[test]
    fn a008_supervised_record_restart_unknown_process_returns_false() {
        let sup = make_supervised();
        assert!(!sup.record_restart("nonexistent"));
    }

    // --- record_health_failure: unknown process returns false ---

    #[test]
    fn a008_supervised_record_health_failure_unknown_process_returns_false() {
        let sup = make_supervised();
        assert!(!sup.record_health_failure("nonexistent"));
    }

    // --- reset_health_failures: unknown process is noop ---

    #[test]
    fn a008_supervised_reset_health_failures_unknown_process_is_noop() {
        let sup = make_supervised();
        // Should not panic on unknown process
        sup.reset_health_failures("nonexistent");
    }

    // --- update_pid: unknown process is noop ---

    #[test]
    fn a008_supervised_update_pid_unknown_process_is_noop() {
        let sup = make_supervised();
        // Should not panic on unknown process
        sup.update_pid("nonexistent", 99);
    }

    // --- list_snapshots: no started_at gives 0 uptime ---

    #[test]
    fn a008_supervised_list_snapshots_no_started_at_gives_zero_uptime() {
        let sup = make_supervised();
        sup.register_process(
            "no-start",
            ProcessBudget {
                started_at: None,
                ..make_budget("no-start")
            },
        );
        let snapshots = sup.list_snapshots();
        let snap = snapshots.iter().find(|s| s.name == "no-start").unwrap();
        assert_eq!(snap.uptime_secs, 0);
    }
}
