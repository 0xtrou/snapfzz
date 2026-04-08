use serde::Serialize;
use sysinfo::System;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub os: String,
    pub arch: String,
    pub platform: String,
    pub platform_display: String,
    pub cores: usize,
    pub ram_gb: u64,
    pub on_battery: bool,
}

pub fn detect_device() -> DeviceInfo {
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    let platform = platform_for(&os, &arch).to_string();
    let platform_display = platform_display_for(&platform).to_string();
    let sys = System::new_all();
    let cores = sys.cpus().len();
    let ram_gb = sys.total_memory() / (1024 * 1024 * 1024);

    #[cfg(target_os = "macos")]
    let on_battery = detect_battery_macos();
    #[cfg(not(target_os = "macos"))]
    let on_battery = false;

    DeviceInfo {
        os,
        arch,
        platform,
        platform_display,
        cores,
        ram_gb,
        on_battery,
    }
}

pub fn platform_for(os: &str, arch: &str) -> &'static str {
    match (os, arch) {
        ("macos", "aarch64") => "macos-arm64",
        ("macos", "x86_64") => "macos-x64",
        ("linux", "x86_64") => "linux-x64",
        ("windows", "x86_64") => "windows-x64",
        _ => "unknown",
    }
}

pub fn platform_display_for(platform: &str) -> &'static str {
    match platform {
        "macos-arm64" => "macOS (Apple Silicon)",
        "macos-x64" => "macOS (Intel)",
        "linux-x64" => "Linux (x86_64)",
        "windows-x64" => "Windows (x64)",
        _ => "Unknown platform",
    }
}

#[cfg(target_os = "macos")]
fn detect_battery_macos() -> bool {
    std::process::Command::new("pmset")
        .args(["-g", "batt"])
        .output()
        .map(|output| {
            let stdout = String::from_utf8_lossy(&output.stdout);
            stdout.contains("Battery Power")
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::{detect_device, platform_display_for, platform_for};

    #[test]
    fn a008_device_platform_helpers_map_supported_targets() {
        assert_eq!(platform_for("macos", "aarch64"), "macos-arm64");
        assert_eq!(platform_for("macos", "x86_64"), "macos-x64");
        assert_eq!(platform_for("linux", "x86_64"), "linux-x64");
        assert_eq!(platform_for("windows", "x86_64"), "windows-x64");
        assert_eq!(platform_for("linux", "aarch64"), "unknown");
    }

    #[test]
    fn a008_device_platform_display_helpers_map_supported_targets() {
        assert_eq!(platform_display_for("macos-arm64"), "macOS (Apple Silicon)");
        assert_eq!(platform_display_for("macos-x64"), "macOS (Intel)");
        assert_eq!(platform_display_for("linux-x64"), "Linux (x86_64)");
        assert_eq!(platform_display_for("windows-x64"), "Windows (x64)");
        assert_eq!(platform_display_for("unknown"), "Unknown platform");
    }

    #[test]
    fn a008_device_detect_device_returns_valid_fields_on_current_platform() {
        let device = detect_device();

        assert_eq!(device.os, std::env::consts::OS);
        assert_eq!(device.arch, std::env::consts::ARCH);
        assert_eq!(device.platform, platform_for(&device.os, &device.arch));
        assert_eq!(
            device.platform_display,
            platform_display_for(&device.platform)
        );
        assert!(device.cores >= 1);
        assert!(!device.platform.is_empty());
    }
}
