use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use dashmap::DashMap;
use tokio::sync::{OwnedSemaphorePermit, Semaphore, TryAcquireError};

use crate::budget::preset::Preset;

pub struct ControlledBudgets {
    cpu_semaphore: Arc<Semaphore>,
    cpu_total: usize,
    invoke_semaphore: Arc<Semaphore>,
    invoke_total: usize,
    plugin_strikes: DashMap<String, StrikeState>,
    default_max_strikes: u32,
    strike_window_secs: u64,
    pub batch_interval_ms: AtomicU64,
    pub batch_rate_ms: AtomicU64,
    pub startup_visible_ms: u64,
    pub startup_interactive_ms: u64,
    pub activation_timeout_ms: u64,
}

pub struct StrikeState {
    pub timestamps: Vec<Instant>,
    pub max_strikes: u32,
    pub disabled: bool,
}

pub struct CpuPermit {
    _permit: OwnedSemaphorePermit,
}

pub struct InvokePermit {
    _permit: OwnedSemaphorePermit,
}

impl ControlledBudgets {
    pub fn from_preset(preset: &Preset) -> Self {
        Self {
            cpu_semaphore: Arc::new(Semaphore::new(preset.cpu.permits)),
            cpu_total: preset.cpu.permits,
            invoke_semaphore: Arc::new(Semaphore::new(preset.network.max_concurrent_invokes)),
            invoke_total: preset.network.max_concurrent_invokes,
            plugin_strikes: DashMap::new(),
            default_max_strikes: preset.reliability.default_strikes,
            strike_window_secs: preset.reliability.strike_window_secs,
            batch_interval_ms: AtomicU64::new(preset.frame.target_ms),
            batch_rate_ms: AtomicU64::new(preset.network.batch_rate_ms),
            startup_visible_ms: preset.startup.visible_ms,
            startup_interactive_ms: preset.startup.interactive_ms,
            activation_timeout_ms: preset.startup.activation_timeout_ms,
        }
    }

    pub fn try_acquire_cpu(&self) -> Option<CpuPermit> {
        match Semaphore::try_acquire_owned(self.cpu_semaphore.clone()) {
            Ok(permit) => Some(CpuPermit { _permit: permit }),
            Err(TryAcquireError::NoPermits) => None,
            Err(TryAcquireError::Closed) => None,
        }
    }

    pub fn try_acquire_invoke(&self, plugin_id: &str) -> Option<InvokePermit> {
        if self.is_plugin_disabled(plugin_id) {
            return None;
        }
        match Semaphore::try_acquire_owned(self.invoke_semaphore.clone()) {
            Ok(permit) => Some(InvokePermit { _permit: permit }),
            Err(TryAcquireError::NoPermits) => None,
            Err(TryAcquireError::Closed) => None,
        }
    }

    pub fn record_strike(&self, plugin_id: &str) {
        let mut entry = self
            .plugin_strikes
            .entry(plugin_id.to_string())
            .or_insert_with(|| StrikeState {
                timestamps: Vec::new(),
                max_strikes: self.default_max_strikes,
                disabled: false,
            });

        let now = Instant::now();
        let window = std::time::Duration::from_secs(self.strike_window_secs);
        entry
            .timestamps
            .retain(|ts| now.duration_since(*ts) < window);
        entry.timestamps.push(now);

        if entry.timestamps.len() >= entry.max_strikes as usize {
            entry.disabled = true;
        }
    }

    pub fn is_plugin_disabled(&self, plugin_id: &str) -> bool {
        self.plugin_strikes
            .get(plugin_id)
            .map(|s| s.disabled)
            .unwrap_or(false)
    }

    pub fn enable_plugin(&self, plugin_id: &str) {
        if let Some(mut entry) = self.plugin_strikes.get_mut(plugin_id) {
            entry.disabled = false;
            entry.timestamps.clear();
        }
    }

    pub fn cpu_available(&self) -> usize {
        self.cpu_semaphore.available_permits()
    }

    pub fn cpu_total(&self) -> usize {
        self.cpu_total
    }

    pub fn invoke_available(&self) -> usize {
        self.invoke_semaphore.available_permits()
    }

    pub fn invoke_total(&self) -> usize {
        self.invoke_total
    }

    pub fn batch_interval(&self) -> u64 {
        self.batch_interval_ms.load(Ordering::Relaxed)
    }

    pub fn batch_rate(&self) -> u64 {
        self.batch_rate_ms.load(Ordering::Relaxed)
    }

    pub fn plugin_strike_count(&self, plugin_id: &str) -> u32 {
        self.plugin_strikes
            .get(plugin_id)
            .map(|s| s.timestamps.len() as u32)
            .unwrap_or(0)
    }

    pub fn disabled_plugin_ids(&self) -> Vec<String> {
        self.plugin_strikes
            .iter()
            .filter(|entry| entry.disabled)
            .map(|entry| entry.key().clone())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::ControlledBudgets;
    use crate::budget::detect::HardwareInfo;
    use crate::budget::preset::{build_preset, PresetName};

    fn make_controlled(name: PresetName) -> ControlledBudgets {
        let hw = HardwareInfo {
            cores: 8,
            ram_gb: 16,
            on_battery: false,
        };
        ControlledBudgets::from_preset(&build_preset(name, &hw))
    }

    #[test]
    fn a008_controlled_cpu_acquire_returns_permit_when_available() {
        let ctrl = make_controlled(PresetName::Performance);
        let permit = ctrl.try_acquire_cpu();
        assert!(permit.is_some());
    }

    #[test]
    fn a008_controlled_cpu_acquire_returns_none_when_exhausted() {
        let ctrl = make_controlled(PresetName::Battery);
        assert_eq!(ctrl.cpu_total(), 2);
        let _p1 = ctrl.try_acquire_cpu().unwrap();
        let _p2 = ctrl.try_acquire_cpu().unwrap();
        assert!(ctrl.try_acquire_cpu().is_none());
    }

    #[test]
    fn a008_controlled_cpu_permit_released_on_drop() {
        let ctrl = make_controlled(PresetName::Battery);
        {
            let _p1 = ctrl.try_acquire_cpu().unwrap();
            let _p2 = ctrl.try_acquire_cpu().unwrap();
            assert_eq!(ctrl.cpu_available(), 0);
        }
        assert_eq!(ctrl.cpu_available(), 2);
    }

    #[test]
    fn a008_controlled_invoke_gated_by_plugin_disabled() {
        let ctrl = make_controlled(PresetName::Performance);
        ctrl.record_strike("bad.plugin");
        ctrl.record_strike("bad.plugin");
        ctrl.record_strike("bad.plugin");
        assert!(ctrl.is_plugin_disabled("bad.plugin"));
        assert!(ctrl.try_acquire_invoke("bad.plugin").is_none());
    }

    #[test]
    fn a008_controlled_invoke_allowed_for_healthy_plugin() {
        let ctrl = make_controlled(PresetName::Performance);
        let permit = ctrl.try_acquire_invoke("good.plugin");
        assert!(permit.is_some());
    }

    #[test]
    fn a008_controlled_strike_counter_3_strikes_disables() {
        let ctrl = make_controlled(PresetName::Performance);
        assert!(!ctrl.is_plugin_disabled("p"));
        ctrl.record_strike("p");
        assert!(!ctrl.is_plugin_disabled("p"));
        ctrl.record_strike("p");
        assert!(!ctrl.is_plugin_disabled("p"));
        ctrl.record_strike("p");
        assert!(ctrl.is_plugin_disabled("p"));
    }

    #[test]
    fn a008_controlled_enable_plugin_resets_strikes() {
        let ctrl = make_controlled(PresetName::Performance);
        ctrl.record_strike("p");
        ctrl.record_strike("p");
        ctrl.record_strike("p");
        assert!(ctrl.is_plugin_disabled("p"));
        ctrl.enable_plugin("p");
        assert!(!ctrl.is_plugin_disabled("p"));
        assert_eq!(ctrl.plugin_strike_count("p"), 0);
    }

    #[test]
    fn a008_controlled_batch_interval_reads_from_preset() {
        let perf = make_controlled(PresetName::Performance);
        assert_eq!(perf.batch_interval(), 16);

        let batt = make_controlled(PresetName::Battery);
        assert_eq!(batt.batch_interval(), 33);
    }

    #[test]
    fn a008_controlled_batch_rate_reads_from_preset() {
        let perf = make_controlled(PresetName::Performance);
        assert_eq!(perf.batch_rate(), 16);

        let batt = make_controlled(PresetName::Battery);
        assert_eq!(batt.batch_rate(), 33);
    }

    #[test]
    fn a008_controlled_invoke_returns_none_when_exhausted() {
        let ctrl = make_controlled(PresetName::Battery);
        assert_eq!(ctrl.invoke_total(), 3);
        let _p1 = ctrl.try_acquire_invoke("a").unwrap();
        let _p2 = ctrl.try_acquire_invoke("b").unwrap();
        let _p3 = ctrl.try_acquire_invoke("c").unwrap();
        assert!(ctrl.try_acquire_invoke("d").is_none());
    }

    #[test]
    fn a008_controlled_invoke_released_on_drop() {
        let ctrl = make_controlled(PresetName::Battery);
        {
            let _p1 = ctrl.try_acquire_invoke("a").unwrap();
            let _p2 = ctrl.try_acquire_invoke("b").unwrap();
            let _p3 = ctrl.try_acquire_invoke("c").unwrap();
            assert_eq!(ctrl.invoke_available(), 0);
        }
        assert_eq!(ctrl.invoke_available(), 3);
    }
}
