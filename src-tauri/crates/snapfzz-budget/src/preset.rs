use serde::{Deserialize, Serialize};
use sysinfo::System;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryBudget {
    pub app_total_mb: u64,
    pub agentscope_max_mb: u64,
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

pub struct HardwareInfo {
    pub cores: usize,
    pub ram_gb: u64,
    pub on_battery: bool,
}

pub fn detect_hardware() -> HardwareInfo {
    let sys = System::new_all();
    let cores = sys.cpus().len();
    let ram_gb = sys.total_memory() / (1024 * 1024 * 1024);

    #[cfg(target_os = "macos")]
    let on_battery = detect_battery_macos();
    #[cfg(not(target_os = "macos"))]
    let on_battery = false;

    HardwareInfo {
        cores,
        ram_gb,
        on_battery,
    }
}

#[cfg(target_os = "macos")]
fn detect_battery_macos() -> bool {
    std::process::Command::new("pmset")
        .args(["-g", "batt"])
        .output()
        .map(|o| {
            let output = String::from_utf8_lossy(&o.stdout);
            output.contains("Battery Power")
        })
        .unwrap_or(false)
}

pub fn select_preset(hw: &HardwareInfo) -> PresetName {
    if hw.on_battery {
        return PresetName::Battery;
    }
    if hw.cores >= 8 && hw.ram_gb >= 16 {
        return PresetName::Performance;
    }
    if hw.cores >= 4 && hw.ram_gb >= 8 {
        return PresetName::Balanced;
    }
    PresetName::Battery
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
            // AgentScope gets 75% of the app total.
            let agentscope_max_mb = app_total_mb * 3 / 4;
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
                memory: MemoryBudget {
                    app_total_mb,
                    agentscope_max_mb,
                },
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
            memory: MemoryBudget {
                app_total_mb: 2048,
                agentscope_max_mb: 1024,
            },
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
            memory: MemoryBudget {
                app_total_mb: 1024,
                agentscope_max_mb: 512,
            },
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
