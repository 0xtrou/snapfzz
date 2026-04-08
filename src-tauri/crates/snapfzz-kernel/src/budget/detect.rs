use crate::budget::device::{detect_device, DeviceInfo};
use crate::budget::preset::PresetName;

pub struct HardwareInfo {
    pub cores: usize,
    pub ram_gb: u64,
    pub on_battery: bool,
}

impl From<&DeviceInfo> for HardwareInfo {
    fn from(device: &DeviceInfo) -> Self {
        Self {
            cores: device.cores,
            ram_gb: device.ram_gb,
            on_battery: device.on_battery,
        }
    }
}

pub fn detect_hardware() -> HardwareInfo {
    let device = detect_device();
    HardwareInfo::from(&device)
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

#[cfg(test)]
mod tests {
    use super::{detect_hardware, select_preset, HardwareInfo};
    use crate::budget::device::{detect_device, DeviceInfo};
    use crate::budget::preset::PresetName;

    fn sample_device() -> DeviceInfo {
        DeviceInfo {
            os: "macos".to_string(),
            arch: "aarch64".to_string(),
            platform: "macos-arm64".to_string(),
            platform_display: "macOS (Apple Silicon)".to_string(),
            cores: 8,
            ram_gb: 16,
            on_battery: false,
        }
    }

    #[test]
    fn a008_detect_hardware_info_derives_from_device_info() {
        let device = sample_device();
        let hardware = HardwareInfo::from(&device);

        assert_eq!(hardware.cores, device.cores);
        assert_eq!(hardware.ram_gb, device.ram_gb);
        assert_eq!(hardware.on_battery, device.on_battery);
    }

    #[test]
    fn a008_detect_detect_hardware_matches_detect_device_fields() {
        let device = detect_device();
        let hardware = detect_hardware();

        assert_eq!(hardware.cores, device.cores);
        assert_eq!(hardware.ram_gb, device.ram_gb);
        assert_eq!(hardware.on_battery, device.on_battery);
    }

    #[test]
    fn a008_detect_select_preset_prefers_battery_when_on_battery() {
        let hardware = HardwareInfo {
            cores: 16,
            ram_gb: 64,
            on_battery: true,
        };

        assert_eq!(select_preset(&hardware), PresetName::Battery);
    }

    #[test]
    fn a008_detect_select_preset_uses_performance_for_large_machines() {
        let hardware = HardwareInfo {
            cores: 8,
            ram_gb: 16,
            on_battery: false,
        };

        assert_eq!(select_preset(&hardware), PresetName::Performance);
    }

    #[test]
    fn a008_detect_select_preset_uses_balanced_for_mid_tier_machines() {
        let hardware = HardwareInfo {
            cores: 4,
            ram_gb: 8,
            on_battery: false,
        };

        assert_eq!(select_preset(&hardware), PresetName::Balanced);
    }

    #[test]
    fn a008_detect_select_preset_defaults_to_battery_for_small_machines() {
        let hardware = HardwareInfo {
            cores: 2,
            ram_gb: 4,
            on_battery: false,
        };

        assert_eq!(select_preset(&hardware), PresetName::Battery);
    }
}
