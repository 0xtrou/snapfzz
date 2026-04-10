use std::path::PathBuf;
use std::sync::Arc;

use snapfzz_kernel::process::{ProcessFactory, SpawnConfig};
use snapfzz_kernel::settings::Settings;
use snapfzz_packs::data::DataDir;
use snapfzz_packs::runtime::agentscope::AgentScopeService;
use snapfzz_packs::runtime::python::PythonRuntime;
use snapfzz_packs::service::{ManagedService, ResourceLimits, ServiceConfig, ServiceError};

pub struct AgentScopeFactory {
    service: AgentScopeService,
}

impl AgentScopeFactory {
    pub fn new(runtime: Arc<PythonRuntime>, base_data_dir: PathBuf) -> Self {
        Self {
            service: AgentScopeService::new(runtime, DataDir::new(&base_data_dir)),
        }
    }
}

impl ProcessFactory for AgentScopeFactory {
    fn name(&self) -> &'static str {
        "agentscope"
    }

    fn health_path(&self) -> &'static str {
        "/health"
    }

    fn port_settings_keys(&self) -> (&'static str, &'static str) {
        ("agentscopeHost", "agentscopePort")
    }

    fn working_dir(&self, _settings: &Settings) -> Option<PathBuf> {
        self.service.working_dir().ok()
    }

    fn can_start(&self, _runtime: &PythonRuntime) -> bool {
        self.service.can_start()
    }

    fn build_command(
        &self,
        config: &SpawnConfig,
        _runtime: &PythonRuntime,
    ) -> Result<tokio::process::Command, ServiceError> {
        self.service.spawn_command(&ServiceConfig {
            host: config.host.clone(),
            port: config.port,
            working_dir: config.working_dir.clone(),
        })
    }

    fn resource_limits(&self) -> ResourceLimits {
        self.service.resource_limits()
    }
}

#[cfg(test)]
mod tests {
    use super::AgentScopeFactory;
    use snapfzz_kernel::process::{ProcessFactory, SpawnConfig};
    use snapfzz_kernel::settings::Settings;
    use snapfzz_packs::detect_platform;
    use snapfzz_packs::runtime::python::PythonRuntime;
    use std::path::PathBuf;
    use std::sync::Arc;

    fn runtime() -> Arc<PythonRuntime> {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        Arc::new(PythonRuntime::new(temp.path().to_path_buf(), platform))
    }

    fn make_factory(data_dir: &std::path::Path) -> AgentScopeFactory {
        AgentScopeFactory::new(runtime(), data_dir.to_path_buf())
    }

    #[test]
    fn t37_agentscope_factory_health_path_is_health() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert_eq!(factory.health_path(), "/health");
    }

    #[test]
    fn t37_agentscope_factory_port_settings_keys_match_settings_contract() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert_eq!(
            factory.port_settings_keys(),
            ("agentscopeHost", "agentscopePort")
        );
    }

    #[test]
    fn t37_agentscope_factory_can_start_uses_service_runtime() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let empty_runtime = runtime();
        assert!(!factory.can_start(&empty_runtime));
    }

    #[test]
    fn t37_agentscope_factory_build_command_creates_python_module_command() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 8090,
            working_dir: PathBuf::from("/tmp"),
        };
        let error = factory
            .build_command(&config, &runtime())
            .expect_err("venv missing");
        assert!(error.to_string().contains("Python venv"));
    }

    #[test]
    fn t37_agentscope_factory_working_dir_ignores_legacy_settings_path() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let mut settings = Settings::default();
        settings.agentscope_working_dir = temp.path().join("legacy-source").display().to_string();

        let working_dir = factory.working_dir(&settings).expect("working dir");
        assert_eq!(working_dir, temp.path().join("data").join("agentscope"));
        assert!(working_dir.exists());
    }

    #[test]
    fn t37_agentscope_factory_working_dir_falls_back_to_data_dir_source() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let working_dir = factory
            .working_dir(&Settings::default())
            .expect("working dir");
        assert_eq!(working_dir, temp.path().join("data").join("agentscope"));
    }

    #[test]
    fn t37_agentscope_factory_working_dir_returns_none_when_not_found() {
        let temp = tempfile::tempdir().expect("tempdir");
        let non_dir_path = temp.path().join("not-a-directory");
        std::fs::write(&non_dir_path, "x").expect("file");
        let factory = make_factory(&non_dir_path);
        assert!(factory.working_dir(&Settings::default()).is_none());
    }
}
