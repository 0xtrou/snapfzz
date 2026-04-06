#[cfg(test)]
mod tests {
    use crate::metrics::ProcessStatus;
    use crate::supervised::*;
    use std::path::PathBuf;

    fn make_supervised() -> SupervisedBudgets {
        SupervisedBudgets::new(StorageState {
            max_gb: 10,
            paths: vec![PathBuf::from("/tmp/snapfzz-test-nonexistent")],
            cleanup_threshold_pct: 90,
        })
    }

    fn make_budget(name_hint: &str) -> ProcessBudget {
        ProcessBudget {
            pid: Some(1),
            max_memory_mb: 512,
            health_url: "http://127.0.0.1:9999/health".into(),
            health_interval_ms: 2000,
            max_health_failures: 3,
            max_restarts: 10,
            location: ProcessLocation::Local,
            consecutive_failures: 0,
            restart_count: 0,
            status: ProcessStatus::Starting,
            started_at: None,
            owner: format!("system.{name_hint}"),
        }
    }

    #[test]
    fn a008_supervised_register_process_stores_budget() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));
        assert!(sup.processes.contains_key("test"));
    }

    #[test]
    fn a008_supervised_unregister_removes_process() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));
        sup.unregister_process("test");
        assert!(!sup.processes.contains_key("test"));
    }

    #[test]
    fn a008_supervised_update_pid() {
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                pid: None,
                ..make_budget("test")
            },
        );
        sup.update_pid("test", 42);
        assert_eq!(sup.processes.get("test").unwrap().pid, Some(42));
    }

    #[test]
    fn a008_supervised_health_failure_tracking() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));
        assert!(!sup.record_health_failure("test"));
        assert!(!sup.record_health_failure("test"));
        assert!(sup.record_health_failure("test"));
    }

    #[test]
    fn a008_supervised_reset_health_failures() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));
        sup.record_health_failure("test");
        sup.record_health_failure("test");
        sup.reset_health_failures("test");
        assert!(!sup.record_health_failure("test"));
    }

    #[test]
    fn a008_supervised_restart_count_exceeds_max() {
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                max_restarts: 2,
                ..make_budget("test")
            },
        );
        assert!(!sup.record_restart("test"));
        assert!(!sup.record_restart("test"));
        assert!(sup.record_restart("test"));
    }

    #[test]
    fn a008_supervised_storage_nonexistent_path_returns_zero() {
        let sup = make_supervised();
        assert_eq!(sup.measure_storage(), 0);
    }

    #[test]
    fn a008_supervised_memory_check_returns_none_for_invalid_pid() {
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                pid: Some(999999999),
                ..make_budget("test")
            },
        );
        assert!(sup.check_memory("test").is_none());
    }

    #[test]
    fn a008_supervised_cloud_process_memory_returns_none() {
        let sup = make_supervised();
        sup.register_process(
            "cloud",
            ProcessBudget {
                pid: Some(1),
                max_memory_mb: 2048,
                health_url: "http://cloud.example.com:8090/health".into(),
                health_interval_ms: 5000,
                max_health_failures: 5,
                max_restarts: 20,
                location: ProcessLocation::Cloud {
                    endpoint: "cloud.example.com".into(),
                },
                consecutive_failures: 0,
                restart_count: 0,
                status: ProcessStatus::Starting,
                started_at: None,
                owner: "system.cloud".into(),
            },
        );
        assert!(sup.check_memory("cloud").is_none());
    }

    #[test]
    fn a008_supervised_list_snapshots_returns_all_processes() {
        let sup = make_supervised();
        sup.register_process("alpha", make_budget("alpha"));
        sup.register_process("beta", make_budget("beta"));

        let mut snapshots = sup.list_snapshots();
        snapshots.sort_by(|a, b| a.name.cmp(&b.name));

        assert_eq!(snapshots.len(), 2);
        assert_eq!(snapshots[0].name, "alpha");
        assert_eq!(snapshots[0].owner, "system.alpha");
        assert_eq!(snapshots[1].name, "beta");
        assert_eq!(snapshots[1].owner, "system.beta");
    }

    #[test]
    fn a008_supervised_status_starts_as_starting() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));

        let entry = sup.processes.get("test").unwrap();
        assert!(matches!(entry.status, ProcessStatus::Starting));
    }

    #[test]
    fn a008_supervised_status_transitions_to_online() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));

        {
            let mut entry = sup.processes.get_mut("test").unwrap();
            entry.status = ProcessStatus::Online;
        }

        let entry = sup.processes.get("test").unwrap();
        assert!(matches!(entry.status, ProcessStatus::Online));
    }

    #[test]
    fn a008_supervised_status_tracks_consecutive_failures() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));

        sup.record_health_failure("test");
        sup.record_health_failure("test");
        sup.record_health_failure("test");

        let entry = sup.processes.get("test").unwrap();
        assert_eq!(entry.consecutive_failures, 3);
    }

    #[test]
    fn a008_supervised_list_snapshots_includes_status_online() {
        let sup = make_supervised();
        sup.register_process("test", make_budget("test"));

        {
            let mut entry = sup.processes.get_mut("test").unwrap();
            entry.status = ProcessStatus::Online;
        }

        let snapshots = sup.list_snapshots();
        let snap = snapshots.iter().find(|s| s.name == "test").unwrap();
        assert!(matches!(snap.status, ProcessStatus::Online));
    }

    #[test]
    fn a008_supervised_list_snapshots_includes_owner() {
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                owner: "system".to_string(),
                ..make_budget("test")
            },
        );

        let snapshots = sup.list_snapshots();
        let snap = snapshots.iter().find(|s| s.name == "test").unwrap();
        assert_eq!(snap.owner, "system");
    }

    #[test]
    fn a008_supervised_list_snapshots_includes_uptime() {
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                started_at: Some(std::time::Instant::now() - std::time::Duration::from_secs(5)),
                ..make_budget("test")
            },
        );

        let snapshots = sup.list_snapshots();
        let snap = snapshots.iter().find(|s| s.name == "test").unwrap();
        assert!(
            snap.uptime_secs >= 5,
            "uptime_secs should be at least 5, got {}",
            snap.uptime_secs
        );
    }

    #[test]
    fn a008_supervised_memory_exceeded_returns_false_for_invalid_pid() {
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                pid: Some(999_999_999),
                max_memory_mb: 512,
                ..make_budget("test")
            },
        );

        assert!(!sup.is_memory_exceeded("test"));
    }

    #[test]
    fn a008_supervised_register_preserves_started_at() {
        let now = std::time::Instant::now();
        let sup = make_supervised();
        sup.register_process(
            "test",
            ProcessBudget {
                started_at: Some(now),
                ..make_budget("test")
            },
        );

        let entry = sup.processes.get("test").unwrap();
        assert!(entry.started_at.is_some());
    }
}
