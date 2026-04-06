#[cfg(test)]
mod tests {
    use crate::metrics::ProcessStatus;
    use crate::preset::{build_preset, HardwareInfo, PresetName};
    use crate::supervised::{ProcessBudget, ProcessLocation};
    use crate::BudgetRegistry;

    fn make_budget() -> ProcessBudget {
        ProcessBudget {
            pid: None,
            max_memory_mb: 256,
            health_url: "http://127.0.0.1:9999/health".into(),
            health_interval_ms: 2000,
            max_health_failures: 3,
            max_restarts: 5,
            location: ProcessLocation::Local,
            consecutive_failures: 0,
            restart_count: 0,
            status: ProcessStatus::Starting,
            started_at: None,
            owner: "system".into(),
        }
    }

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
        let _p2 = reg.try_acquire_cpu().unwrap();
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
        assert_eq!(snap.cpu_total, 4);
        assert_eq!(snap.invoke_total, 6);
        assert_eq!(snap.frame_target_ms, 16);
        assert_eq!(snap.agentscope_max_mb, 1024);
    }

    #[test]
    fn a008_registry_register_process_appears_in_supervised() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.register_process(
            "test-proc",
            ProcessBudget {
                pid: Some(12345),
                ..make_budget()
            },
        );
        assert!(reg.supervised.processes.contains_key("test-proc"));
    }

    #[test]
    fn a008_registry_update_process_pid() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.register_process("proc", make_budget());
        reg.update_process_pid("proc", 99);
        assert_eq!(reg.supervised.processes.get("proc").unwrap().pid, Some(99));
    }

    #[test]
    fn a008_supervised_snapshot_includes_processes_vec() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.register_process(
            "svc-a",
            ProcessBudget {
                owner: "system.svc-a".into(),
                ..make_budget()
            },
        );
        reg.register_process(
            "svc-b",
            ProcessBudget {
                owner: "system.svc-b".into(),
                ..make_budget()
            },
        );
        let snap = reg.snapshot();
        assert_eq!(snap.processes.len(), 2);
    }

    #[test]
    fn a008_registry_backward_compat_agentscope_fields() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Balanced);
        let snap = reg.snapshot();
        assert_eq!(snap.agentscope_max_mb, 1024);
        assert!(snap.agentscope_rss_mb.is_none());
        assert!(matches!(
            snap.agentscope_status,
            crate::metrics::ProcessStatus::Stopped
        ));
    }

    #[test]
    fn a008_registry_snapshot_processes_empty_when_none_registered() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        let snap = reg.snapshot();
        assert!(snap.processes.is_empty());
    }

    #[test]
    fn a008_registry_snapshot_processes_contains_registered() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        reg.register_process("test", make_budget());
        let snap = reg.snapshot();
        assert!(snap.processes.iter().any(|p| p.name == "test"));
    }

    #[test]
    fn a008_registry_snapshot_agentscope_status_stopped_when_not_registered() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        let snap = reg.snapshot();
        assert!(matches!(snap.agentscope_status, ProcessStatus::Stopped));
    }

    #[test]
    fn a008_registry_swap_preset_changes_snapshot_name() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Battery);
        assert_eq!(reg.snapshot().preset_name, "battery");

        let hw = HardwareInfo {
            cores: 8,
            ram_gb: 16,
            on_battery: false,
        };
        let perf = build_preset(PresetName::Performance, &hw);
        reg.swap_preset(perf);

        assert_eq!(reg.snapshot().preset_name, "performance");
    }

    #[test]
    fn a008_registry_swap_preset_updates_frame_target() {
        let reg = BudgetRegistry::with_preset_name(PresetName::Performance);
        assert_eq!(reg.frame_target(), 16);

        let hw = HardwareInfo {
            cores: 4,
            ram_gb: 8,
            on_battery: true,
        };
        let batt = build_preset(PresetName::Battery, &hw);
        reg.swap_preset(batt);

        assert_eq!(reg.frame_target(), 33);
        assert_eq!(reg.snapshot().preset_name, "battery");
    }

    #[test]
    fn a008_registry_swap_preset_updates_memory_limit() {
        let hw = HardwareInfo {
            cores: 8,
            ram_gb: 16,
            on_battery: false,
        };
        let reg = BudgetRegistry::with_preset(build_preset(PresetName::Battery, &hw));
        assert_eq!(reg.snapshot().agentscope_max_mb, 512);

        let perf = build_preset(PresetName::Performance, &hw);
        reg.swap_preset(perf);

        assert!(reg.snapshot().agentscope_max_mb > 512);
    }
}
