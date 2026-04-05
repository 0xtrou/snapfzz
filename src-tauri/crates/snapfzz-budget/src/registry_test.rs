#[cfg(test)]
mod tests {
    use crate::preset::PresetName;
    use crate::BudgetRegistry;

    #[test]
    fn a008_registry_from_preset_creates_valid_registry() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        assert_eq!(reg.frame_target(), 16);
        assert_eq!(reg.batch_rate(), 16);
    }

    #[test]
    fn a008_registry_battery_preset_uses_33ms_frame_target() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Battery);
        assert_eq!(reg.frame_target(), 33);
        assert_eq!(reg.batch_rate(), 33);
    }

    #[test]
    fn a008_registry_try_acquire_cpu_respects_preset_limit() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Battery);
        let _p1 = reg.try_acquire_cpu().unwrap();
        assert!(reg.try_acquire_cpu().is_none());
    }

    #[test]
    fn a008_registry_try_acquire_invoke_gates_disabled_plugin() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.record_strike("bad");
        reg.record_strike("bad");
        reg.record_strike("bad");
        assert!(reg.try_acquire_invoke("bad").is_none());
        assert!(reg.try_acquire_invoke("good").is_some());
    }

    #[test]
    fn a008_registry_enable_plugin_re_allows_invoke() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.record_strike("p");
        reg.record_strike("p");
        reg.record_strike("p");
        assert!(reg.is_plugin_disabled("p"));
        reg.enable_plugin("p");
        assert!(!reg.is_plugin_disabled("p"));
        assert!(reg.try_acquire_invoke("p").is_some());
    }

    #[test]
    fn a008_registry_startup_budget_returns_preset_values() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        let (visible, interactive, timeout) = reg.startup_budget();
        assert_eq!(visible, 200);
        assert_eq!(interactive, 500);
        assert_eq!(timeout, 5000);
    }

    #[test]
    fn a008_registry_snapshot_returns_complete_metrics() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Balanced);
        let snap = reg.snapshot();
        assert_eq!(snap.preset_name, "balanced");
        assert_eq!(snap.cpu_total, 2);
        assert_eq!(snap.invoke_total, 5);
        assert_eq!(snap.frame_target_ms, 16);
        assert_eq!(snap.agentscope_max_mb, 512);
    }

    #[test]
    fn a008_registry_register_process_appears_in_supervised() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.register_process(
            "test-proc",
            crate::supervised::ProcessBudget {
                pid: Some(12345),
                max_memory_mb: 256,
                health_url: "http://127.0.0.1:9999/health".into(),
                health_interval_ms: 2000,
                max_health_failures: 3,
                max_restarts: 5,
                location: crate::supervised::ProcessLocation::Local,
                consecutive_failures: 0,
                restart_count: 0,
            },
        );
        assert!(reg.supervised.processes.contains_key("test-proc"));
    }

    #[test]
    fn a008_registry_update_process_pid() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.register_process(
            "proc",
            crate::supervised::ProcessBudget {
                pid: None,
                max_memory_mb: 512,
                health_url: "http://127.0.0.1:8090/health".into(),
                health_interval_ms: 2000,
                max_health_failures: 3,
                max_restarts: 10,
                location: crate::supervised::ProcessLocation::Local,
                consecutive_failures: 0,
                restart_count: 0,
            },
        );
        reg.update_process_pid("proc", 99);
        assert_eq!(reg.supervised.processes.get("proc").unwrap().pid, Some(99));
    }
}
