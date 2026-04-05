use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use dashmap::DashMap;
use tokio::sync::{OwnedSemaphorePermit, Semaphore, TryAcquireError};

use crate::preset::Preset;

pub struct ControlledBudgets {
    cpu_semaphore: Arc<Semaphore>,
    cpu_total: usize,
    invoke_semaphore: Arc<Semaphore>,
    invoke_total: usize,
    plugin_strikes: DashMap<String, StrikeState>,
    default_max_strikes: u32,
    strike_window_secs: u64,
    pub frame_target_ms: AtomicU64,
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
            frame_target_ms: AtomicU64::new(preset.frame.target_ms),
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

    pub fn frame_target(&self) -> u64 {
        self.frame_target_ms.load(Ordering::Relaxed)
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
