use sysinfo::System;

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

pub fn select_preset(hw: &HardwareInfo) -> crate::budget::preset::PresetName {
    if hw.on_battery {
        return crate::budget::preset::PresetName::Battery;
    }
    if hw.cores >= 8 && hw.ram_gb >= 16 {
        return crate::budget::preset::PresetName::Performance;
    }
    if hw.cores >= 4 && hw.ram_gb >= 8 {
        return crate::budget::preset::PresetName::Balanced;
    }
    crate::budget::preset::PresetName::Battery
}
