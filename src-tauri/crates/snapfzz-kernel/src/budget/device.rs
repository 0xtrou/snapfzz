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
    use super::{detect_device, platform_display_for, platform_for, DeviceInfo};
    use serde_json::Value;

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

    // --- DeviceInfo construction and PartialEq ---

    #[test]
    fn a008_device_info_construction_and_equality() {
        // A008/device: DeviceInfo derives PartialEq — two structs with identical fields
        // must compare equal so callers can cache and compare device fingerprints.
        let a = DeviceInfo {
            os: "macos".to_string(),
            arch: "aarch64".to_string(),
            platform: "macos-arm64".to_string(),
            platform_display: "macOS (Apple Silicon)".to_string(),
            cores: 10,
            ram_gb: 16,
            on_battery: false,
        };
        let b = a.clone();

        assert_eq!(a, b);
        assert_eq!(a.os, "macos");
        assert_eq!(a.arch, "aarch64");
        assert_eq!(a.platform, "macos-arm64");
        assert_eq!(a.platform_display, "macOS (Apple Silicon)");
        assert_eq!(a.cores, 10);
        assert_eq!(a.ram_gb, 16);
        assert!(!a.on_battery);
    }

    #[test]
    fn a008_device_info_inequality_on_differing_fields() {
        // A008/device: Two DeviceInfo values that differ in any field must not be equal —
        // verifies PartialEq is field-wise and not reference-based.
        let base = DeviceInfo {
            os: "linux".to_string(),
            arch: "x86_64".to_string(),
            platform: "linux-x64".to_string(),
            platform_display: "Linux (x86_64)".to_string(),
            cores: 4,
            ram_gb: 8,
            on_battery: false,
        };
        let mut different = base.clone();
        different.ram_gb = 32;

        assert_ne!(base, different);
    }

    // --- DeviceInfo serialization ---

    #[test]
    fn a008_device_info_serializes_camel_case_keys() {
        // A008/device: DeviceInfo has #[serde(rename_all = "camelCase")] — JSON output must
        // use camelCase key names so the frontend TypeScript interface aligns with the struct.
        let device = DeviceInfo {
            os: "linux".to_string(),
            arch: "x86_64".to_string(),
            platform: "linux-x64".to_string(),
            platform_display: "Linux (x86_64)".to_string(),
            cores: 4,
            ram_gb: 8,
            on_battery: false,
        };
        let v: Value = serde_json::to_value(&device).expect("serialization must not fail");

        // camelCase keys must be present.
        assert!(v.get("platformDisplay").is_some(), "expected platformDisplay key");
        assert!(v.get("ramGb").is_some(), "expected ramGb key");
        assert!(v.get("onBattery").is_some(), "expected onBattery key");

        // snake_case must be absent.
        assert!(v.get("platform_display").is_none(), "snake_case must not appear");
        assert!(v.get("ram_gb").is_none(), "snake_case must not appear");
        assert!(v.get("on_battery").is_none(), "snake_case must not appear");
    }

    #[test]
    fn a008_device_info_serializes_correct_values() {
        // A008/device: Serialized DeviceInfo values must exactly match the struct fields —
        // no transformations beyond key renaming are applied.
        let device = DeviceInfo {
            os: "macos".to_string(),
            arch: "aarch64".to_string(),
            platform: "macos-arm64".to_string(),
            platform_display: "macOS (Apple Silicon)".to_string(),
            cores: 8,
            ram_gb: 16,
            on_battery: true,
        };
        let v: Value = serde_json::to_value(&device).expect("serialization must not fail");

        assert_eq!(v["os"], Value::String("macos".into()));
        assert_eq!(v["arch"], Value::String("aarch64".into()));
        assert_eq!(v["platform"], Value::String("macos-arm64".into()));
        assert_eq!(v["platformDisplay"], Value::String("macOS (Apple Silicon)".into()));
        assert_eq!(v["cores"].as_u64().unwrap(), 8);
        assert_eq!(v["ramGb"].as_u64().unwrap(), 16);
        assert_eq!(v["onBattery"], Value::Bool(true));
    }

    // --- platform_for edge cases ---

    #[test]
    fn a008_device_platform_for_unrecognized_os_returns_unknown() {
        // A008/device: platform_for must return "unknown" for any (os, arch) pair not
        // explicitly listed — prevents a match panic on novel environments.
        assert_eq!(platform_for("freebsd", "x86_64"), "unknown");
        assert_eq!(platform_for("", ""), "unknown");
        assert_eq!(platform_for("macos", "arm"), "unknown");
        assert_eq!(platform_for("windows", "aarch64"), "unknown");
    }

    #[test]
    fn a008_device_platform_display_for_unknown_falls_through() {
        // A008/device: platform_display_for must return "Unknown platform" for any input
        // that does not match a known platform string — including arbitrary garbage input.
        assert_eq!(platform_display_for(""), "Unknown platform");
        assert_eq!(platform_display_for("freebsd-x64"), "Unknown platform");
        assert_eq!(platform_display_for("macos-arm64-extra"), "Unknown platform");
    }

    // --- detect_device does not panic and returns plausible values ---

    #[test]
    fn a008_device_detect_device_ram_gb_nonzero() {
        // A008/device: detect_device must report at least 1 GB of RAM on any real machine
        // running this test — a zero value indicates a sysinfo read failure.
        let device = detect_device();
        assert!(device.ram_gb >= 1, "ram_gb must be at least 1 on a real host");
    }

    #[test]
    fn a008_device_detect_device_cores_matches_sysinfo() {
        // A008/device: The cores field must equal the number of logical CPUs reported by
        // sysinfo — guards against a future refactor accidentally hardcoding the value.
        use sysinfo::System;
        let sys = System::new_all();
        let expected_cores = sys.cpus().len();

        let device = detect_device();
        assert_eq!(
            device.cores, expected_cores,
            "cores must match sysinfo CPU count"
        );
    }

    #[test]
    fn a008_device_detect_battery_does_not_panic() {
        // A008/device: detect_device (and the internal detect_battery_macos on macOS) must
        // not panic regardless of pmset output — the result is a bool, never an Err.
        let device = detect_device();
        // Simply asserting this completes without panic is the coverage goal.
        let _ = device.on_battery;
    }

    #[test]
    fn a008_device_detect_device_platform_consistent_with_helpers() {
        // A008/device: detect_device must produce a platform string that equals the output
        // of platform_for(os, arch) — ensures detect_device uses the same helper and hasn't
        // diverged by copying the match inline.
        let device = detect_device();
        let expected = platform_for(&device.os, &device.arch);
        assert_eq!(
            device.platform, expected,
            "detect_device platform must match platform_for output"
        );
    }
}
