pub mod controlled;
pub mod metrics;
pub mod preset;
pub mod supervised;

#[cfg(test)]
mod preset_test;
#[cfg(test)]
mod controlled_test;
#[cfg(test)]
mod supervised_test;
#[cfg(test)]
mod registry_test;

use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::RwLock;
use std::time::{Duration, Instant};

use controlled::{ControlledBudgets, CpuPermit, InvokePermit};
use metrics::{BudgetMetrics, ProcessStatus};
use preset::{build_preset, detect_hardware, select_preset, Preset, PresetName};
use supervised::{ProcessBudget, StorageState, SupervisedBudgets};

pub struct BudgetRegistry {
    pub preset: RwLock<Preset>,
    pub controlled: ControlledBudgets,
    pub supervised: SupervisedBudgets,
    boot_time: Instant,
}

impl BudgetRegistry {
    pub fn from_hardware() -> Self {
        let hw = detect_hardware();
        let preset_name = select_preset(&hw);
        let preset = build_preset(preset_name, &hw);
        Self::with_preset(preset)
    }

    pub fn with_preset(preset: Preset) -> Self {
        let controlled = ControlledBudgets::from_preset(&preset);

        // A004: Storage budget monitors ~/.snapfzz/ (the canonical global data dir).
        let global_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".snapfzz");

        let supervised = SupervisedBudgets::new(StorageState {
            max_gb: preset.storage.max_gb,
            paths: vec![global_dir],
            cleanup_threshold_pct: preset.storage.cleanup_threshold_pct,
        });

        Self {
            preset: RwLock::new(preset),
            controlled,
            supervised,
            boot_time: Instant::now(),
        }
    }

    pub fn with_preset_name(name: PresetName) -> Self {
        let hw = detect_hardware();
        Self::with_preset(build_preset(name, &hw))
    }

    // A008: swap_preset updates both the atomics (hot path) and the stored
    // Preset (for snapshot() accuracy) atomically under the write lock.
    pub fn swap_preset(&self, new_preset: Preset) {
        self.controlled
            .batch_interval_ms
            .store(new_preset.frame.target_ms, Ordering::Relaxed);
        self.controlled
            .batch_rate_ms
            .store(new_preset.network.batch_rate_ms, Ordering::Relaxed);
        let mut guard = self.preset.write().unwrap();
        *guard = new_preset;
    }

    pub fn try_acquire_cpu(&self) -> Option<CpuPermit> {
        self.controlled.try_acquire_cpu()
    }

    pub fn try_acquire_invoke(&self, plugin_id: &str) -> Option<InvokePermit> {
        self.controlled.try_acquire_invoke(plugin_id)
    }

    pub fn record_strike(&self, plugin_id: &str) {
        self.controlled.record_strike(plugin_id);
    }

    pub fn is_plugin_disabled(&self, plugin_id: &str) -> bool {
        self.controlled.is_plugin_disabled(plugin_id)
    }

    pub fn enable_plugin(&self, plugin_id: &str) {
        self.controlled.enable_plugin(plugin_id);
    }

    pub fn register_process(&self, name: &str, budget: ProcessBudget) {
        self.supervised.register_process(name, budget);
    }

    pub fn update_process_pid(&self, name: &str, pid: u32) {
        self.supervised.update_pid(name, pid);
    }

    pub fn batch_interval(&self) -> u64 {
        self.controlled.batch_interval()
    }

    pub fn batch_rate(&self) -> u64 {
        self.controlled.batch_rate()
    }

    pub fn startup_budget(&self) -> (u64, u64, u64) {
        (
            self.controlled.startup_visible_ms,
            self.controlled.startup_interactive_ms,
            self.controlled.activation_timeout_ms,
        )
    }

    pub async fn enforce_loop<F>(&self, interval_ms: u64, mut on_metrics: F)
    where
        F: FnMut(&BudgetMetrics),
    {
        loop {
            tokio::time::sleep(Duration::from_millis(interval_ms)).await;

            for entry in self.supervised.processes.iter() {
                let name = entry.key();

                if self.supervised.is_memory_exceeded(name) {
                    eprintln!("[budget] process '{name}' exceeded memory limit — should be killed");
                }

                let healthy = self.supervised.check_health(name).await;
                if healthy {
                    self.supervised.reset_health_failures(name);
                } else {
                    let threshold_exceeded = self.supervised.record_health_failure(name);
                    if threshold_exceeded {
                        eprintln!("[budget] process '{name}' failed health check threshold — should be restarted");
                    }
                }
            }

            if self.supervised.is_storage_exceeded() {
                eprintln!("[budget] storage exceeded cleanup threshold");
            }

            let metrics = self.snapshot();
            on_metrics(&metrics);
        }
    }

    pub fn snapshot(&self) -> BudgetMetrics {
        let processes = self.supervised.list_snapshots();

        let agentscope_snapshot = processes.iter().find(|p| p.name == "agentscope");
        let agentscope_rss_mb = agentscope_snapshot.and_then(|p| p.rss_mb);
        let agentscope_status = agentscope_snapshot
            .map(|p| p.status.clone())
            .unwrap_or(ProcessStatus::Stopped);

        let disabled_plugins: Vec<String> = self.controlled.disabled_plugin_ids();

        let preset = self.preset.read().unwrap();
        BudgetMetrics {
            preset_name: preset.name.clone(),
            cpu_used: self.controlled.cpu_total() - self.controlled.cpu_available(),
            cpu_total: self.controlled.cpu_total(),
            invoke_used: self.controlled.invoke_total() - self.controlled.invoke_available(),
            invoke_total: self.controlled.invoke_total(),
            batch_interval_ms: self.controlled.batch_interval_ms.load(Ordering::Relaxed),
            batch_rate_ms: self.controlled.batch_rate_ms.load(Ordering::Relaxed),
            agentscope_rss_mb,
            agentscope_max_mb: preset.memory.agentscope_max_mb,
            agentscope_status,
            storage_used_gb: self.supervised.measure_storage(),
            storage_max_gb: preset.storage.max_gb,
            disabled_plugins,
            uptime_secs: self.boot_time.elapsed().as_secs(),
            processes,
        }
    }
}
