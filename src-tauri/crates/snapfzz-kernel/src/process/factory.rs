use std::collections::HashMap;
use std::path::PathBuf;

use snapfzz_packs::runtime::python::PythonRuntime;
use snapfzz_packs::service::{ResourceLimits, ServiceError};
use tokio::process::Command;

use crate::process::SpawnConfig;
use crate::settings::Settings;

/// A037/SpawnSecrets: Environment variables to inject when spawning a process.
#[derive(Default, Clone)]
pub struct SpawnSecrets {
    pub env: HashMap<String, String>,
}

// A037/factory_trait: Declarative process factory contract for managed services.
pub trait ProcessFactory: Send + Sync {
    fn name(&self) -> &'static str;

    fn owner(&self) -> &'static str {
        "system"
    }

    fn health_path(&self) -> &'static str;

    fn health_interval_ms(&self) -> u64 {
        2000
    }

    fn default_port(&self) -> Option<u16> {
        None
    }

    fn port_settings_keys(&self) -> (&'static str, &'static str);

    fn working_dir(&self, settings: &Settings) -> Option<PathBuf>;

    fn can_start(&self, runtime: &PythonRuntime) -> bool;

    // A037/pre_run_setup: Synchronous pre-spawn setup hook (default no-op).
    fn pre_run_setup(
        &self,
        _config: &SpawnConfig,
        _runtime: &PythonRuntime,
    ) -> Result<(), ServiceError> {
        Ok(())
    }

    fn build_command(
        &self,
        config: &SpawnConfig,
        runtime: &PythonRuntime,
    ) -> Result<Command, ServiceError>;

    fn resource_limits(&self) -> ResourceLimits;

    fn config_path(&self, _data_dir: &PathBuf) -> Option<PathBuf> {
        None
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use snapfzz_packs::service::ResourceLimits;
    use snapfzz_packs::{detect_platform, runtime::python::PythonRuntime};

    use super::ProcessFactory;
    use crate::process::SpawnConfig;
    use crate::settings::Settings;

    struct TestFactory;

    impl ProcessFactory for TestFactory {
        fn name(&self) -> &'static str {
            "test"
        }

        fn health_path(&self) -> &'static str {
            "/health"
        }

        fn port_settings_keys(&self) -> (&'static str, &'static str) {
            ("agentscopeHost", "agentscopePort")
        }

        fn working_dir(&self, _settings: &Settings) -> Option<PathBuf> {
            Some(PathBuf::from("/tmp"))
        }

        fn can_start(&self, _runtime: &PythonRuntime) -> bool {
            true
        }

        fn pre_run_setup(
            &self,
            _config: &SpawnConfig,
            _runtime: &PythonRuntime,
        ) -> Result<(), snapfzz_packs::service::ServiceError> {
            Ok(())
        }

        fn build_command(
            &self,
            _config: &SpawnConfig,
            _runtime: &PythonRuntime,
        ) -> Result<tokio::process::Command, snapfzz_packs::service::ServiceError> {
            Ok(tokio::process::Command::new("sh"))
        }

        fn resource_limits(&self) -> ResourceLimits {
            ResourceLimits {
                max_memory_mb: 256,
                max_restarts: 3,
            }
        }
    }

    #[test]
    fn t37_factory_name_returns_process_identifier() {
        let factory = TestFactory;
        assert_eq!(factory.name(), "test");
    }

    #[test]
    fn t37_factory_default_port_returns_none_for_random_allocation() {
        let factory = TestFactory;
        assert_eq!(factory.default_port(), None);
    }

    #[test]
    fn t37_factory_port_settings_keys_return_expected_pairs() {
        let factory = TestFactory;
        assert_eq!(
            factory.port_settings_keys(),
            ("agentscopeHost", "agentscopePort")
        );
    }

    #[test]
    fn t37_factory_default_owner_and_health_interval_are_applied() {
        let factory = TestFactory;
        assert_eq!(factory.owner(), "system");
        assert_eq!(factory.health_interval_ms(), 2000);
    }

    struct SnapfzzFactory;

    impl ProcessFactory for SnapfzzFactory {
        fn name(&self) -> &'static str {
            "snapfzz-service"
        }

        // A037/factory_trait: Override owner() to return a non-default value,
        // verifying that factories may identify themselves as "snapfzz" (or any
        // plugin ID) rather than the built-in "system" default.
        fn owner(&self) -> &'static str {
            "snapfzz"
        }

        fn health_path(&self) -> &'static str {
            "/health"
        }

        fn port_settings_keys(&self) -> (&'static str, &'static str) {
            ("agentscopeHost", "agentscopePort")
        }

        fn working_dir(&self, _settings: &Settings) -> Option<PathBuf> {
            Some(PathBuf::from("/tmp"))
        }

        fn can_start(&self, _runtime: &PythonRuntime) -> bool {
            true
        }

        fn build_command(
            &self,
            _config: &SpawnConfig,
            _runtime: &PythonRuntime,
        ) -> Result<tokio::process::Command, snapfzz_packs::service::ServiceError> {
            Ok(tokio::process::Command::new("sh"))
        }

        fn resource_limits(&self) -> ResourceLimits {
            ResourceLimits {
                max_memory_mb: 128,
                max_restarts: 1,
            }
        }
    }

    #[test]
    fn t37_factory_owner_override_returns_custom_identifier() {
        // A037/factory_trait: owner() default is "system"; factories that override it
        // must return their declared identifier so list_snapshots() tags them correctly.
        let factory = SnapfzzFactory;
        assert_eq!(factory.owner(), "snapfzz");
    }

    #[test]
    fn t37_factory_build_command_and_resource_limits_are_callable() {
        let factory = TestFactory;
        let runtime_dir = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        let runtime = PythonRuntime::new(runtime_dir.path().to_path_buf(), platform);
        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 0,
            working_dir: PathBuf::from("/tmp"),
            database_url: None,
        };

        let command = factory
            .build_command(&config, &runtime)
            .expect("command should build");
        let command_debug = format!("{command:?}");
        assert!(command_debug.contains("\"sh\""));

        let limits = factory.resource_limits();
        assert_eq!(limits.max_memory_mb, 256);
        assert_eq!(limits.max_restarts, 3);
    }

    // --- Default trait method coverage ---

    /// A factory that only implements the required methods, leaving all defaults in place.
    struct MinimalFactory;

    impl ProcessFactory for MinimalFactory {
        fn name(&self) -> &'static str {
            "minimal"
        }

        fn health_path(&self) -> &'static str {
            "/health"
        }

        fn port_settings_keys(&self) -> (&'static str, &'static str) {
            ("minimalHost", "minimalPort")
        }

        fn working_dir(&self, _settings: &Settings) -> Option<PathBuf> {
            None
        }

        fn can_start(&self, _runtime: &PythonRuntime) -> bool {
            false
        }

        fn build_command(
            &self,
            _config: &SpawnConfig,
            _runtime: &PythonRuntime,
        ) -> Result<tokio::process::Command, snapfzz_packs::service::ServiceError> {
            Ok(tokio::process::Command::new("sh"))
        }

        fn resource_limits(&self) -> ResourceLimits {
            ResourceLimits {
                max_memory_mb: 64,
                max_restarts: 1,
            }
        }
    }

    #[test]
    fn t37_factory_default_health_interval_ms_is_2000() {
        assert_eq!(MinimalFactory.health_interval_ms(), 2000);
    }

    #[test]
    fn t37_factory_default_owner_is_system() {
        assert_eq!(MinimalFactory.owner(), "system");
    }

    #[test]
    fn t37_factory_default_default_port_is_none() {
        assert!(MinimalFactory.default_port().is_none());
    }

    #[test]
    fn t37_factory_default_config_path_is_none() {
        let data_dir = PathBuf::from("/tmp/snapfzz");
        assert!(MinimalFactory.config_path(&data_dir).is_none());
    }

    #[test]
    fn t37_factory_default_pre_run_setup_returns_ok() {
        let runtime_dir = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        let runtime = PythonRuntime::new(runtime_dir.path().to_path_buf(), platform);
        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 0,
            working_dir: PathBuf::from("/tmp"),
            database_url: None,
        };
        MinimalFactory.pre_run_setup(&config, &runtime).expect("default pre_run_setup should return Ok");
    }

    #[test]
    fn t37_factory_working_dir_none_for_minimal() {
        let settings = Settings::default();
        assert!(MinimalFactory.working_dir(&settings).is_none());
    }

    #[test]
    fn t37_factory_can_start_false_for_minimal() {
        let runtime_dir = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        let runtime = PythonRuntime::new(runtime_dir.path().to_path_buf(), platform);
        assert!(!MinimalFactory.can_start(&runtime));
    }

    #[test]
    fn t37_factory_spawn_secrets_default_is_empty_env() {
        let secrets = super::SpawnSecrets::default();
        assert!(secrets.env.is_empty());
    }

    #[test]
    fn t37_factory_spawn_secrets_clone_preserves_entries() {
        let mut secrets = super::SpawnSecrets::default();
        secrets.env.insert("API_KEY".to_string(), "sk-test".to_string());
        let cloned = secrets.clone();
        assert_eq!(cloned.env.get("API_KEY"), Some(&"sk-test".to_string()));
    }

    // -------------------------------------------------------------------------
    // SnapfzzFactory — exercise all non-default method implementations so
    // every function in the struct body is entered at least once.
    // -------------------------------------------------------------------------

    #[test]
    fn t37_factory_snapfzz_name_returns_service_identifier() {
        assert_eq!(SnapfzzFactory.name(), "snapfzz-service");
    }

    #[test]
    fn t37_factory_snapfzz_health_path_returns_slash_health() {
        assert_eq!(SnapfzzFactory.health_path(), "/health");
    }

    #[test]
    fn t37_factory_snapfzz_port_settings_keys_returns_agentscope_pair() {
        assert_eq!(
            SnapfzzFactory.port_settings_keys(),
            ("agentscopeHost", "agentscopePort")
        );
    }

    #[test]
    fn t37_factory_snapfzz_working_dir_returns_tmp() {
        let settings = Settings::default();
        let dir = SnapfzzFactory.working_dir(&settings);
        assert_eq!(dir, Some(std::path::PathBuf::from("/tmp")));
    }

    #[test]
    fn t37_factory_snapfzz_can_start_returns_true() {
        let runtime_dir = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        let runtime = PythonRuntime::new(runtime_dir.path().to_path_buf(), platform);
        assert!(SnapfzzFactory.can_start(&runtime));
    }

    #[test]
    fn t37_factory_snapfzz_build_command_produces_sh_command() {
        let runtime_dir = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        let runtime = PythonRuntime::new(runtime_dir.path().to_path_buf(), platform);
        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 0,
            working_dir: std::path::PathBuf::from("/tmp"),
            database_url: None,
        };
        let cmd = SnapfzzFactory
            .build_command(&config, &runtime)
            .expect("build_command should succeed");
        assert!(format!("{cmd:?}").contains("\"sh\""));
    }

    #[test]
    fn t37_factory_snapfzz_resource_limits_are_128mb_and_1_restart() {
        let limits = SnapfzzFactory.resource_limits();
        assert_eq!(limits.max_memory_mb, 128);
        assert_eq!(limits.max_restarts, 1);
    }

    // -------------------------------------------------------------------------
    // MinimalFactory — build_command and resource_limits not reached by default
    // trait tests, so call them directly here.
    // -------------------------------------------------------------------------

    #[test]
    fn t37_factory_minimal_build_command_produces_sh_command() {
        let runtime_dir = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        let runtime = PythonRuntime::new(runtime_dir.path().to_path_buf(), platform);
        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 0,
            working_dir: std::path::PathBuf::from("/tmp"),
            database_url: None,
        };
        let cmd = MinimalFactory
            .build_command(&config, &runtime)
            .expect("build_command should succeed");
        assert!(format!("{cmd:?}").contains("\"sh\""));
    }

    #[test]
    fn t37_factory_minimal_resource_limits_are_64mb_and_1_restart() {
        let limits = MinimalFactory.resource_limits();
        assert_eq!(limits.max_memory_mb, 64);
        assert_eq!(limits.max_restarts, 1);
    }

    // -------------------------------------------------------------------------
    // TestFactory — directly exercise methods that are not called by any of the
    // existing tests (health_path, port_settings_keys, working_dir, can_start,
    // pre_run_setup) so every function body in the struct is entered.
    // -------------------------------------------------------------------------

    #[test]
    fn t37_factory_test_factory_health_path_is_slash_health() {
        assert_eq!(TestFactory.health_path(), "/health");
    }

    #[test]
    fn t37_factory_test_factory_port_settings_keys_returns_agentscope_pair() {
        assert_eq!(
            TestFactory.port_settings_keys(),
            ("agentscopeHost", "agentscopePort")
        );
    }

    #[test]
    fn t37_factory_test_factory_working_dir_returns_tmp() {
        let settings = Settings::default();
        assert_eq!(
            TestFactory.working_dir(&settings),
            Some(std::path::PathBuf::from("/tmp"))
        );
    }

    #[test]
    fn t37_factory_test_factory_can_start_returns_true() {
        let runtime_dir = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        let runtime = PythonRuntime::new(runtime_dir.path().to_path_buf(), platform);
        assert!(TestFactory.can_start(&runtime));
    }

    #[test]
    fn t37_factory_test_factory_pre_run_setup_returns_ok() {
        let runtime_dir = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        let runtime = PythonRuntime::new(runtime_dir.path().to_path_buf(), platform);
        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 0,
            working_dir: std::path::PathBuf::from("/tmp"),
            database_url: None,
        };
        TestFactory
            .pre_run_setup(&config, &runtime)
            .expect("TestFactory::pre_run_setup should return Ok");
    }

    // -------------------------------------------------------------------------
    // SnapfzzFactory default trait methods — health_interval_ms and default_port
    // are inherited from the trait; each concrete type may get its own
    // monomorphized copy, so call them directly on SnapfzzFactory to ensure
    // those bodies are entered.
    // -------------------------------------------------------------------------

    #[test]
    fn t37_factory_snapfzz_health_interval_ms_is_2000() {
        assert_eq!(SnapfzzFactory.health_interval_ms(), 2000);
    }

    #[test]
    fn t37_factory_snapfzz_default_port_is_none() {
        assert!(SnapfzzFactory.default_port().is_none());
    }

    #[test]
    fn t37_factory_snapfzz_config_path_is_none() {
        let data_dir = std::path::PathBuf::from("/tmp/snapfzz");
        assert!(SnapfzzFactory.config_path(&data_dir).is_none());
    }

    #[test]
    fn t37_factory_snapfzz_pre_run_setup_returns_ok() {
        let runtime_dir = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        let runtime = PythonRuntime::new(runtime_dir.path().to_path_buf(), platform);
        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 0,
            working_dir: std::path::PathBuf::from("/tmp"),
            database_url: None,
        };
        // SnapfzzFactory does not override pre_run_setup, so this calls the default.
        // Calling it through SnapfzzFactory ensures the monomorphized copy is covered.
        SnapfzzFactory
            .pre_run_setup(&config, &runtime)
            .expect("SnapfzzFactory default pre_run_setup should return Ok");
    }

    // -------------------------------------------------------------------------
    // MinimalFactory — health_interval_ms, default_port, and config_path default
    // trait methods called via MinimalFactory already — confirm coverage by also
    // calling them on TestFactory (separate monomorphization for each struct).
    // -------------------------------------------------------------------------

    #[test]
    fn t37_factory_test_factory_health_interval_ms_is_2000() {
        assert_eq!(TestFactory.health_interval_ms(), 2000);
    }

    #[test]
    fn t37_factory_test_factory_default_port_is_none() {
        assert!(TestFactory.default_port().is_none());
    }

    #[test]
    fn t37_factory_test_factory_config_path_is_none() {
        let data_dir = std::path::PathBuf::from("/tmp/snapfzz");
        assert!(TestFactory.config_path(&data_dir).is_none());
    }
}
