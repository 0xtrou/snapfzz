use std::path::PathBuf;
use std::time::Duration;

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use sysinfo::{Pid as SysPid, ProcessesToUpdate, System};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessLocation {
    Local,
    Cloud { endpoint: String },
}

#[derive(Debug, Clone)]
pub struct ProcessBudget {
    pub pid: Option<u32>,
    pub max_memory_mb: u64,
    pub health_url: String,
    pub health_interval_ms: u64,
    pub max_health_failures: u32,
    pub max_restarts: u32,
    pub location: ProcessLocation,
    pub consecutive_failures: u32,
    pub restart_count: u32,
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
                let mut sys = System::new();
                sys.refresh_processes(ProcessesToUpdate::Some(&[SysPid::from_u32(pid)]), true);
                sys.process(SysPid::from_u32(pid))
                    .map(|p| p.memory() as f64 / 1_048_576.0)
            }
            ProcessLocation::Cloud { .. } => None,
        }
    }

    pub fn is_memory_exceeded(&self, name: &str) -> bool {
        let max = self.processes.get(name).map(|p| p.max_memory_mb).unwrap_or(0);
        self.check_memory(name).map(|rss| rss > max as f64).unwrap_or(false)
    }

    pub async fn check_health(&self, name: &str) -> bool {
        let url = match self.processes.get(name) {
            Some(entry) => entry.health_url.clone(),
            None => return false,
        };

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
