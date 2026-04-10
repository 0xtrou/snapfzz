use serde::{Deserialize, Serialize};

use crate::budget::detect::HardwareInfo;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub name: String,
    pub frame: FrameBudget,
    pub cpu: CpuBudget,
    pub memory: MemoryBudget,
    pub startup: StartupBudget,
    pub network: NetworkBudget,
    pub reliability: ReliabilityBudget,
    pub window: WindowBudget,
    pub storage: StorageBudget,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameBudget {
    pub target_ms: u64,
    pub violation_threshold_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuBudget {
    pub permits: usize,
    pub zone2_envelope: usize,
}

/// A008/MemoryBudget: Unified memory budget shared by all processes.
/// All supervised processes draw from this pool - no per-process limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryBudget {
    /// Total memory budget for all processes combined (MB)
    pub app_total_mb: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartupBudget {
    pub visible_ms: u64,
    pub interactive_ms: u64,
    pub activation_timeout_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkBudget {
    pub batch_rate_ms: u64,
    pub max_concurrent_invokes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReliabilityBudget {
    pub default_strikes: u32,
    pub strike_window_secs: u64,
    pub max_restarts: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowBudget {
    pub max_concurrent: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageBudget {
    pub max_gb: u64,
    pub cleanup_threshold_pct: u8,
    pub log_rotation_mb: u64,
    pub log_keep_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PresetName {
    Performance,
    Balanced,
    Battery,
}

// A008/BudgetRegistry: build_preset accepts HardwareInfo so the Performance preset
// can scale CPU and memory to ~90% of detected hardware rather than using fixed values.
pub fn build_preset(name: PresetName, hw: &HardwareInfo) -> Preset {
    match name {
        PresetName::Performance => {
            // 80% of cores, minimum 4 permits.
            let cpu_permits = std::cmp::max((hw.cores * 4 / 5) as usize, 4);
            // 80% of RAM in MB, capped at 16GB.
            let app_total_mb = std::cmp::min((hw.ram_gb as u64) * 1024 * 4 / 5, 16384);
            Preset {
                name: "performance".into(),
                frame: FrameBudget {
                    target_ms: 16,
                    violation_threshold_ms: 50,
                },
                cpu: CpuBudget {
                    permits: cpu_permits,
                    zone2_envelope: cpu_permits / 2,
                },
                memory: MemoryBudget { app_total_mb },
                startup: StartupBudget {
                    visible_ms: 200,
                    interactive_ms: 500,
                    activation_timeout_ms: 5000,
                },
                network: NetworkBudget {
                    batch_rate_ms: 16,
                    max_concurrent_invokes: 10,
                },
                reliability: ReliabilityBudget {
                    default_strikes: 3,
                    strike_window_secs: 300,
                    max_restarts: 15,
                },
                window: WindowBudget { max_concurrent: 5 },
                storage: StorageBudget {
                    max_gb: 10,
                    cleanup_threshold_pct: 90,
                    log_rotation_mb: 10,
                    log_keep_count: 5,
                },
            }
        }
        PresetName::Balanced => Preset {
            name: "balanced".into(),
            frame: FrameBudget {
                target_ms: 16,
                violation_threshold_ms: 50,
            },
            cpu: CpuBudget {
                permits: 4,
                zone2_envelope: 2,
            },
            memory: MemoryBudget { app_total_mb: 2048 },
            startup: StartupBudget {
                visible_ms: 200,
                interactive_ms: 500,
                activation_timeout_ms: 5000,
            },
            network: NetworkBudget {
                batch_rate_ms: 16,
                max_concurrent_invokes: 6,
            },
            reliability: ReliabilityBudget {
                default_strikes: 3,
                strike_window_secs: 300,
                max_restarts: 10,
            },
            window: WindowBudget { max_concurrent: 3 },
            storage: StorageBudget {
                max_gb: 5,
                cleanup_threshold_pct: 90,
                log_rotation_mb: 10,
                log_keep_count: 5,
            },
        },
        PresetName::Battery => Preset {
            name: "battery".into(),
            frame: FrameBudget {
                target_ms: 33,
                violation_threshold_ms: 66,
            },
            cpu: CpuBudget {
                permits: 2,
                zone2_envelope: 1,
            },
            memory: MemoryBudget { app_total_mb: 1024 },
            startup: StartupBudget {
                visible_ms: 200,
                interactive_ms: 500,
                activation_timeout_ms: 5000,
            },
            network: NetworkBudget {
                batch_rate_ms: 33,
                max_concurrent_invokes: 3,
            },
            reliability: ReliabilityBudget {
                default_strikes: 3,
                strike_window_secs: 300,
                max_restarts: 5,
            },
            window: WindowBudget { max_concurrent: 2 },
            storage: StorageBudget {
                max_gb: 5,
                cleanup_threshold_pct: 85,
                log_rotation_mb: 5,
                log_keep_count: 3,
            },
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::budget::detect::select_preset;

    #[test]
    fn a008_preset_detect_selects_performance_for_high_end_desktop() {
        let hw = HardwareInfo {
            cores: 10,
            ram_gb: 32,
            on_battery: false,
        };
        assert_eq!(select_preset(&hw), PresetName::Performance);
    }

    #[test]
    fn a008_preset_detect_selects_balanced_for_mid_range() {
        let hw = HardwareInfo {
            cores: 4,
            ram_gb: 8,
            on_battery: false,
        };
        assert_eq!(select_preset(&hw), PresetName::Balanced);
    }

    #[test]
    fn a008_preset_detect_selects_battery_when_on_battery() {
        let hw = HardwareInfo {
            cores: 10,
            ram_gb: 32,
            on_battery: true,
        };
        assert_eq!(select_preset(&hw), PresetName::Battery);
    }

    #[test]
    fn a008_preset_detect_selects_battery_for_low_end() {
        let hw = HardwareInfo {
            cores: 2,
            ram_gb: 4,
            on_battery: false,
        };
        assert_eq!(select_preset(&hw), PresetName::Battery);
    }

    #[test]
    fn a008_preset_performance_batch_interval_is_16ms() {
        let hw = HardwareInfo {
            cores: 8,
            ram_gb: 16,
            on_battery: false,
        };
        let preset = build_preset(PresetName::Performance, &hw);
        assert_eq!(preset.frame.target_ms, 16);
        assert_eq!(preset.network.batch_rate_ms, 16);
    }

    #[test]
    fn a008_preset_battery_batch_interval_is_33ms() {
        let hw = HardwareInfo {
            cores: 4,
            ram_gb: 8,
            on_battery: true,
        };
        let preset = build_preset(PresetName::Battery, &hw);
        assert_eq!(preset.frame.target_ms, 33);
        assert_eq!(preset.network.batch_rate_ms, 33);
    }

    #[test]
    fn a008_preset_battery_has_2_cpu_permits() {
        let hw = HardwareInfo {
            cores: 4,
            ram_gb: 8,
            on_battery: true,
        };
        let preset = build_preset(PresetName::Battery, &hw);
        assert_eq!(preset.cpu.permits, 2);
    }

    #[test]
    fn a008_preset_balanced_has_4_cpu_permits() {
        let hw = HardwareInfo {
            cores: 4,
            ram_gb: 8,
            on_battery: false,
        };
        let preset = build_preset(PresetName::Balanced, &hw);
        assert_eq!(preset.cpu.permits, 4);
    }

    #[test]
    fn a008_preset_performance_scales_with_8_core_16gb() {
        let hw = HardwareInfo {
            cores: 8,
            ram_gb: 16,
            on_battery: false,
        };
        let preset = build_preset(PresetName::Performance, &hw);
        assert_eq!(preset.cpu.permits, 6);
        assert_eq!(preset.memory.app_total_mb, 13107);
    }

    #[test]
    fn a008_preset_performance_scales_with_4_core_8gb() {
        let hw = HardwareInfo {
            cores: 4,
            ram_gb: 8,
            on_battery: false,
        };
        let preset = build_preset(PresetName::Performance, &hw);
        assert_eq!(preset.cpu.permits, 4);
        assert_eq!(preset.memory.app_total_mb, 6553);
    }

    #[test]
    fn a008_preset_performance_caps_memory_at_16384mb() {
        let hw = HardwareInfo {
            cores: 20,
            ram_gb: 64,
            on_battery: false,
        };
        let preset = build_preset(PresetName::Performance, &hw);
        assert_eq!(preset.memory.app_total_mb, 16384);
    }

    #[test]
    fn a008_preset_performance_guarantees_minimum_4_permits() {
        let hw = HardwareInfo {
            cores: 2,
            ram_gb: 4,
            on_battery: false,
        };
        let preset = build_preset(PresetName::Performance, &hw);
        assert_eq!(preset.cpu.permits, 4);
    }

    #[test]
    fn a008_preset_performance_has_more_permits_than_battery() {
        let hw = HardwareInfo {
            cores: 8,
            ram_gb: 16,
            on_battery: false,
        };
        let perf = build_preset(PresetName::Performance, &hw);
        let batt = build_preset(PresetName::Battery, &hw);
        assert!(perf.cpu.permits > batt.cpu.permits);
        assert!(perf.memory.app_total_mb > batt.memory.app_total_mb);
        assert!(perf.network.max_concurrent_invokes > batt.network.max_concurrent_invokes);
    }

    #[test]
    fn a008_preset_all_presets_share_startup_targets() {
        let hw = HardwareInfo {
            cores: 8,
            ram_gb: 16,
            on_battery: false,
        };
        for name in [
            PresetName::Performance,
            PresetName::Balanced,
            PresetName::Battery,
        ] {
            let preset = build_preset(name, &hw);
            assert_eq!(preset.startup.visible_ms, 200);
            assert_eq!(preset.startup.interactive_ms, 500);
            assert_eq!(preset.startup.activation_timeout_ms, 5000);
        }
    }

    #[test]
    fn a008_preset_battery_has_fewer_restarts() {
        let hw = HardwareInfo {
            cores: 8,
            ram_gb: 16,
            on_battery: false,
        };
        let perf = build_preset(PresetName::Performance, &hw);
        let batt = build_preset(PresetName::Battery, &hw);
        assert!(perf.reliability.max_restarts > batt.reliability.max_restarts);
    }
}
