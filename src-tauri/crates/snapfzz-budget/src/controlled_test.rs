#[cfg(test)]
mod tests {
    use crate::controlled::ControlledBudgets;
    use crate::preset::{build_preset, HardwareInfo, PresetName};

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
