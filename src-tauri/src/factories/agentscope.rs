use std::path::PathBuf;
use std::sync::Arc;

use snapfzz_kernel::process::{ProcessFactory, SpawnConfig};
use snapfzz_kernel::settings::Settings;
use snapfzz_packs::runtime::agentscope::AgentScopeService;
use snapfzz_packs::runtime::python::PythonRuntime;
use snapfzz_packs::service::{ManagedService, ResourceLimits, ServiceConfig, ServiceError};

pub struct AgentScopeFactory;

impl AgentScopeFactory {
    pub fn new() -> Self {
        Self
    }
}

impl Default for AgentScopeFactory {
    fn default() -> Self {
        Self::new()
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
        let cwd = std::env::current_dir().ok()?;
        [
            cwd.join("intelligence"),
            cwd.join("..").join("intelligence"),
            cwd.join("../..").join("intelligence"),
        ]
        .into_iter()
        .find(|candidate| candidate.join("pyproject.toml").exists())
        .and_then(|p| std::fs::canonicalize(&p).ok())
    }

    fn can_start(&self, runtime: &PythonRuntime) -> bool {
        let service = AgentScopeService::new(Arc::new(runtime.clone()));
        service.can_start()
    }

    fn build_command(
        &self,
        config: &SpawnConfig,
        runtime: &PythonRuntime,
    ) -> Result<tokio::process::Command, ServiceError> {
        let service = AgentScopeService::new(Arc::new(runtime.clone()));
        service.spawn_command(&ServiceConfig {
            host: config.host.clone(),
            port: config.port,
            working_dir: config.working_dir.clone(),
        })
    }

    fn resource_limits(&self) -> ResourceLimits {
        ResourceLimits {
            max_memory_mb: 512,
            max_restarts: 10,
        }
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
    use std::sync::{Mutex, OnceLock};

    fn cwd_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn runtime() -> PythonRuntime {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        PythonRuntime::new(temp.path().to_path_buf(), platform)
    }

    #[test]
    fn t37_agentscope_factory_health_path_is_health() {
        let factory = AgentScopeFactory::new();
        assert_eq!(factory.health_path(), "/health");
    }

    #[test]
    fn t37_agentscope_factory_port_settings_keys_match_settings_contract() {
        let factory = AgentScopeFactory::new();
        assert_eq!(
            factory.port_settings_keys(),
            ("agentscopeHost", "agentscopePort")
        );
    }

    #[test]
    fn t37_agentscope_factory_can_start_checks_python_runtime() {
        let factory = AgentScopeFactory::new();
        assert!(!factory.can_start(&runtime()));
    }

    #[test]
    fn t37_agentscope_factory_build_command_creates_python_module_command() {
        let factory = AgentScopeFactory::new();
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
    fn t37_agentscope_factory_working_dir_finds_intelligence_project() {
        let _guard = cwd_lock().lock().unwrap();
        let original = std::env::current_dir().expect("cwd");
        let fixture = tempfile::tempdir().expect("tempdir");
        let project = fixture.path().join("project");
        let intelligence = fixture.path().join("intelligence");
        std::fs::create_dir_all(&project).expect("project dir");
        std::fs::create_dir_all(&intelligence).expect("intelligence dir");
        std::fs::write(
            intelligence.join("pyproject.toml"),
            "[project]\nname='intelligence'\n",
        )
        .expect("pyproject");
        std::env::set_current_dir(&project).expect("set cwd");

        let working_dir = AgentScopeFactory::new()
            .working_dir(&Settings::default())
            .expect("working dir");

        std::env::set_current_dir(original).expect("restore cwd");
        let expected = std::fs::canonicalize(&intelligence).expect("canonicalize expected");
        assert_eq!(working_dir, expected);
    }
}
