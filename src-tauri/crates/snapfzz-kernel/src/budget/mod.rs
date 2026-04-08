pub mod controlled;
pub mod detect;
pub mod device;
pub mod metrics;
pub mod preset;
pub mod supervised;

use std::path::PathBuf;
use std::sync::RwLock;
use std::time::{Duration, Instant};

use crate::budget::controlled::{ControlledBudgets, CpuPermit, InvokePermit};
use crate::budget::detect::{HardwareInfo, select_preset};
use crate::budget::device::detect_device;
use crate::budget::metrics::{BudgetMetrics, ProcessStatus};
use crate::budget::preset::{Preset, PresetName, build_preset};
use crate::budget::supervised::{ProcessBudget, StorageState, SupervisedBudgets};

pub struct BudgetRegistry {
    pub preset: RwLock<Preset>,
    pub controlled: RwLock<ControlledBudgets>,
    pub supervised: SupervisedBudgets,
    boot_time: Instant,
}

impl BudgetRegistry {
    pub fn from_hardware() -> Self {
        let device = detect_device();
        let hw = HardwareInfo::from(&device);
        let preset_name = select_preset(&hw);
        let preset = build_preset(preset_name, &hw);
        Self::with_preset(preset)
    }

    pub fn with_preset(preset: Preset) -> Self {
        let controlled = ControlledBudgets::from_preset(&preset);

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
            controlled: RwLock::new(controlled),
            supervised,
            boot_time: Instant::now(),
        }
    }

    pub fn with_preset_name(name: PresetName) -> Self {
        let device = detect_device();
        let hw = HardwareInfo::from(&device);
        Self::with_preset(build_preset(name, &hw))
    }

    pub fn swap_preset(&self, new_preset: Preset) {
        let new_controlled = ControlledBudgets::from_preset(&new_preset);
        {
            let mut guard = self.controlled.write().unwrap();
            *guard = new_controlled;
        }
        let mut preset_guard = self.preset.write().unwrap();
        *preset_guard = new_preset;
    }

    pub fn try_acquire_cpu(&self) -> Option<CpuPermit> {
        self.controlled.read().unwrap().try_acquire_cpu()
    }

    pub fn try_acquire_invoke(&self, plugin_id: &str) -> Option<InvokePermit> {
        self.controlled.read().unwrap().try_acquire_invoke(plugin_id)
    }

    pub fn record_strike(&self, plugin_id: &str) {
        self.controlled.read().unwrap().record_strike(plugin_id);
    }

    pub fn is_plugin_disabled(&self, plugin_id: &str) -> bool {
        self.controlled.read().unwrap().is_plugin_disabled(plugin_id)
    }

    pub fn enable_plugin(&self, plugin_id: &str) {
        self.controlled.read().unwrap().enable_plugin(plugin_id);
    }

    pub fn register_process(&self, name: &str, budget: ProcessBudget) {
        self.supervised.register_process(name, budget);
    }

    pub fn update_process_pid(&self, name: &str, pid: u32) {
        self.supervised.update_pid(name, pid);
    }

    pub fn batch_interval(&self) -> u64 {
        self.controlled.read().unwrap().batch_interval()
    }

    pub fn batch_rate(&self) -> u64 {
        self.controlled.read().unwrap().batch_rate()
    }

    pub fn startup_budget(&self) -> (u64, u64, u64) {
        let ctrl = self.controlled.read().unwrap();
        (
            ctrl.startup_visible_ms,
            ctrl.startup_interactive_ms,
            ctrl.activation_timeout_ms,
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
                        eprintln!(
                            "[budget] process '{name}' failed health check threshold — should be restarted"
                        );
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

        let ctrl = self.controlled.read().unwrap();
        let disabled_plugins: Vec<String> = ctrl.disabled_plugin_ids();

        let preset = self.preset.read().unwrap();
        BudgetMetrics {
            preset_name: preset.name.clone(),
            cpu_used: ctrl.cpu_total() - ctrl.cpu_available(),
            cpu_total: ctrl.cpu_total(),
            invoke_used: ctrl.invoke_total() - ctrl.invoke_available(),
            invoke_total: ctrl.invoke_total(),
            batch_interval_ms: ctrl.batch_interval(),
            batch_rate_ms: ctrl.batch_rate(),
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

#[cfg(test)]
mod tests {
    use super::BudgetRegistry;
    use crate::budget::detect::HardwareInfo;
    use crate::budget::metrics::ProcessStatus;
    use crate::budget::preset::{PresetName, build_preset};
    use crate::budget::supervised::{ProcessBudget, ProcessLocation};

    fn make_budget() -> ProcessBudget {
        ProcessBudget {
            pid: None,
            max_memory_mb: 256,
            health_url: "http://127.0.0.1:9999/health".into(),
            health_interval_ms: 2000,
            max_health_failures: 3,
            max_restarts: 5,
            location: ProcessLocation::Local,
            consecutive_failures: 0,
            restart_count: 0,
            status: ProcessStatus::Starting,
            started_at: None,
            owner: "system".into(),
        }
    }

    #[test]
    fn a008_registry_from_preset_creates_valid_registry() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        assert_eq!(reg.batch_interval(), 16);
        assert_eq!(reg.batch_rate(), 16);
    }

    #[test]
    fn a008_registry_battery_preset_uses_33ms_batch_interval() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Battery);
        assert_eq!(reg.batch_interval(), 33);
        assert_eq!(reg.batch_rate(), 33);
    }

    #[test]
    fn a008_registry_try_acquire_cpu_respects_preset_limit() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Battery);
        let _p1 = reg.try_acquire_cpu().unwrap();
        let _p2 = reg.try_acquire_cpu().unwrap();
        assert!(reg.try_acquire_cpu().is_none());
    }

    #[test]
    fn a008_registry_try_acquire_invoke_gates_disabled_plugin() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.record_strike("bad");
        reg.record_strike("bad");
        reg.record_strike("bad");
        assert!(reg.try_acquire_invoke("bad").is_none());
        assert!(reg.try_acquire_invoke("good").is_some());
    }

    #[test]
    fn a008_registry_enable_plugin_re_allows_invoke() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.record_strike("p");
        reg.record_strike("p");
        reg.record_strike("p");
        assert!(reg.is_plugin_disabled("p"));
        reg.enable_plugin("p");
        assert!(!reg.is_plugin_disabled("p"));
        assert!(reg.try_acquire_invoke("p").is_some());
    }

    #[test]
    fn a008_registry_startup_budget_returns_preset_values() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        let (visible, interactive, timeout) = reg.startup_budget();
        assert_eq!(visible, 200);
        assert_eq!(interactive, 500);
        assert_eq!(timeout, 5000);
    }

    #[test]
    fn a008_registry_snapshot_returns_complete_metrics() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Balanced);
        let snap = reg.snapshot();
        assert_eq!(snap.preset_name, "balanced");
        assert_eq!(snap.cpu_total, 4);
        assert_eq!(snap.invoke_total, 6);
        assert_eq!(snap.batch_interval_ms, 16);
        assert_eq!(snap.agentscope_max_mb, 1024);
    }

    #[test]
    fn a008_registry_register_process_appears_in_supervised() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.register_process(
            "test-proc",
            ProcessBudget {
                pid: Some(12345),
                ..make_budget()
            },
        );
        assert!(reg.supervised.processes.contains_key("test-proc"));
    }

    #[test]
    fn a008_registry_update_process_pid() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.register_process("proc", make_budget());
        reg.update_process_pid("proc", 99);
        assert_eq!(reg.supervised.processes.get("proc").unwrap().pid, Some(99));
    }

    #[test]
    fn a008_supervised_snapshot_includes_processes_vec() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.register_process(
            "svc-a",
            ProcessBudget {
                owner: "system.svc-a".into(),
                ..make_budget()
            },
        );
        reg.register_process(
            "svc-b",
            ProcessBudget {
                owner: "system.svc-b".into(),
                ..make_budget()
            },
        );
        let snap = reg.snapshot();
        assert_eq!(snap.processes.len(), 2);
    }

    #[test]
    fn a008_registry_backward_compat_agentscope_fields() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Balanced);
        let snap = reg.snapshot();
        assert_eq!(snap.agentscope_max_mb, 1024);
        assert!(snap.agentscope_rss_mb.is_none());
        assert!(matches!(
            snap.agentscope_status,
            crate::budget::metrics::ProcessStatus::Stopped
        ));
    }

    #[test]
    fn a008_registry_snapshot_processes_empty_when_none_registered() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        let snap = reg.snapshot();
        assert!(snap.processes.is_empty());
    }

    #[test]
    fn a008_registry_snapshot_processes_contains_registered() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.register_process("test", make_budget());
        let snap = reg.snapshot();
        assert!(snap.processes.iter().any(|p| p.name == "test"));
    }

    #[test]
    fn a008_registry_snapshot_agentscope_status_stopped_when_not_registered() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        let snap = reg.snapshot();
        assert!(matches!(snap.agentscope_status, ProcessStatus::Stopped));
    }

    #[test]
    fn a008_registry_swap_preset_changes_snapshot_name() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Battery);
        assert_eq!(reg.snapshot().preset_name, "battery");

        let hw = HardwareInfo {
            cores: 8,
            ram_gb: 16,
            on_battery: false,
        };
        let perf = build_preset(PresetName::Performance, &hw);
        reg.swap_preset(perf);

        assert_eq!(reg.snapshot().preset_name, "performance");
    }

    #[test]
    fn a008_registry_swap_preset_updates_batch_interval() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        assert_eq!(reg.batch_interval(), 16);

        let hw = HardwareInfo {
            cores: 4,
            ram_gb: 8,
            on_battery: true,
        };
        let batt = build_preset(PresetName::Battery, &hw);
        reg.swap_preset(batt);

        assert_eq!(reg.batch_interval(), 33);
        assert_eq!(reg.snapshot().preset_name, "battery");
    }

    #[test]
    fn a008_registry_swap_preset_updates_memory_limit() {
        let hw = HardwareInfo {
            cores: 8,
            ram_gb: 16,
            on_battery: false,
        };
        let reg = BudgetRegistry::with_preset(build_preset(PresetName::Battery, &hw));
        assert_eq!(reg.snapshot().agentscope_max_mb, 512);

        let perf = build_preset(PresetName::Performance, &hw);
        reg.swap_preset(perf);

        assert!(reg.snapshot().agentscope_max_mb > 512);
    }
}
