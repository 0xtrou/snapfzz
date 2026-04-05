#[cfg(test)]
mod tests {
    use crate::preset::*;

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
    fn a008_preset_performance_frame_target_is_16ms() {
        let preset = build_preset(PresetName::Performance);
        assert_eq!(preset.frame.target_ms, 16);
        assert_eq!(preset.network.batch_rate_ms, 16);
    }

    #[test]
    fn a008_preset_battery_frame_target_is_33ms() {
        let preset = build_preset(PresetName::Battery);
        assert_eq!(preset.frame.target_ms, 33);
        assert_eq!(preset.network.batch_rate_ms, 33);
    }

    #[test]
    fn a008_preset_performance_has_more_permits_than_battery() {
        let perf = build_preset(PresetName::Performance);
        let batt = build_preset(PresetName::Battery);
        assert!(perf.cpu.permits > batt.cpu.permits);
        assert!(perf.memory.agentscope_max_mb > batt.memory.agentscope_max_mb);
        assert!(perf.network.max_concurrent_invokes > batt.network.max_concurrent_invokes);
    }

    #[test]
    fn a008_preset_all_presets_share_startup_targets() {
        for name in [
            PresetName::Performance,
            PresetName::Balanced,
            PresetName::Battery,
        ] {
            let preset = build_preset(name);
            assert_eq!(preset.startup.visible_ms, 200);
            assert_eq!(preset.startup.interactive_ms, 500);
            assert_eq!(preset.startup.activation_timeout_ms, 5000);
        }
    }

    #[test]
    fn a008_preset_battery_has_fewer_restarts() {
        let perf = build_preset(PresetName::Performance);
        let batt = build_preset(PresetName::Battery);
        assert!(perf.reliability.max_restarts > batt.reliability.max_restarts);
    }
}
