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
}
