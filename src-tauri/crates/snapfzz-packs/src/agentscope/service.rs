// A033/AgentScopeService: AgentScope runtime as a managed service
use crate::core::data::DataDir;
use crate::core::python::runtime::PythonRuntime;
use crate::core::service::{HealthConfig, ManagedService, ResourceLimits, ServiceConfig, ServiceError};
use std::sync::Arc;

// A033/AgentScopeService: Wraps PythonRuntime to provide spawnable AgentScope service
pub struct AgentScopeService {
    runtime: Arc<PythonRuntime>,
    data_dir: DataDir,
}

impl AgentScopeService {
    pub fn new(runtime: Arc<PythonRuntime>, data_dir: DataDir) -> Self {
        Self { runtime, data_dir }
    }
}

#[async_trait::async_trait]
impl ManagedService for AgentScopeService {
    fn id(&self) -> &str {
        "agentscope"
    }

    fn name(&self) -> &str {
        "AgentScope Runtime"
    }

    fn dependencies(&self) -> Vec<&str> {
        vec!["uv", "python", "agentscope", "agentscope-runtime"]
    }

    fn spawn_command(
        &self,
        config: &ServiceConfig,
    ) -> Result<tokio::process::Command, ServiceError> {
        let python = self.runtime.venv_python();
        if !python.exists() {
            return Err(ServiceError::DependencyNotInstalled("Python venv".into()));
        }

        let mut cmd = tokio::process::Command::new(python);
        cmd.arg("-m")
            .arg("app")
            .current_dir(&config.working_dir)
            .env("SNAPFZZ_HOST", &config.host)
            .env("SNAPFZZ_PORT", config.port.to_string())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        #[cfg(unix)]
        {
            cmd.process_group(0);
        }

        Ok(cmd)
    }

    fn health_config(&self, config: &ServiceConfig) -> HealthConfig {
        HealthConfig {
            url: format!("http://{}:{}/health", config.host, config.port),
            interval_ms: 2000,
            max_failures: 3,
        }
    }

    fn resource_limits(&self) -> ResourceLimits {
        ResourceLimits {
            max_memory_mb: 512,
            max_restarts: 10,
        }
    }

    fn data_dir(&self) -> &DataDir {
        &self.data_dir
    }

    // A033/AgentScopeService: Disabled until agent source file strategy is resolved.
    // `agentscope run` requires a SOURCE argument (agent .py file), which is not yet
    // bundled into the runtime data directory. The factory stays registered so the
    // generic spawn flow remains intact, but can_start() returns false to skip gracefully.
    fn can_start(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::data::DataDir;
    use crate::core::platform::detect_platform;
    use std::path::{Path, PathBuf};

    fn make_runtime() -> Arc<PythonRuntime> {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        Arc::new(PythonRuntime::new(temp.path().to_path_buf(), platform))
    }

    fn make_service(base_dir: &Path) -> AgentScopeService {
        AgentScopeService::new(make_runtime(), DataDir::new(base_dir))
    }

    #[test]
    fn t33_agentscope_service_id_and_name() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        assert_eq!(service.id(), "agentscope");
        assert_eq!(service.name(), "AgentScope Runtime");
    }

    #[test]
    fn t33_agentscope_service_dependencies() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        let deps = service.dependencies();
        assert!(deps.contains(&"uv"));
        assert!(deps.contains(&"python"));
        assert!(deps.contains(&"agentscope"));
        assert!(deps.contains(&"agentscope-runtime"));
    }

    #[test]
    fn t33_agentscope_service_health_config() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        let config = ServiceConfig {
            host: "0.0.0.0".to_string(),
            port: 9000,
            working_dir: PathBuf::from("/tmp"),
        };
        let health = service.health_config(&config);
        assert_eq!(health.url, "http://0.0.0.0:9000/health");
        assert_eq!(health.interval_ms, 2000);
        assert_eq!(health.max_failures, 3);
    }

    #[test]
    fn t33_agentscope_service_resource_limits() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        let limits = service.resource_limits();
        assert_eq!(limits.max_memory_mb, 512);
        assert_eq!(limits.max_restarts, 10);
    }

    #[test]
    fn t33_agentscope_service_working_dir_uses_runtime_data_dir() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        let working_dir = service.working_dir().expect("working dir");
        assert_eq!(working_dir, temp.path().join("data").join("agentscope"));
        assert!(working_dir.exists());
    }

    #[test]
    fn t33_agentscope_service_can_start_disabled_pending_source_strategy() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        assert!(!service.can_start());
    }

    #[test]
    fn t33_agentscope_service_spawn_command_fails_without_venv() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        let config = ServiceConfig {
            host: "127.0.0.1".to_string(),
            port: 8090,
            working_dir: PathBuf::from("/tmp"),
        };
        let result = service.spawn_command(&config);
        assert!(result.is_err());
    }

    #[test]
    fn t33_agentscope_service_spawn_command_succeeds_when_venv_python_exists() {
        let temp = tempfile::tempdir().expect("tempdir");
        let runtime_temp = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        let runtime = Arc::new(crate::core::python::runtime::PythonRuntime::new(
            runtime_temp.path().to_path_buf(),
            platform,
        ));

        // Create the venv python binary so spawn_command succeeds
        let venv_bin = runtime.venv_dir().join("bin");
        std::fs::create_dir_all(&venv_bin).expect("create venv bin");
        std::fs::write(runtime.venv_python(), b"#!/bin/sh\n").expect("create venv python");

        let service = AgentScopeService::new(runtime, DataDir::new(temp.path()));
        let config = ServiceConfig {
            host: "127.0.0.1".to_string(),
            port: 8090,
            working_dir: temp.path().to_path_buf(),
        };
        let result = service.spawn_command(&config);
        assert!(result.is_ok(), "spawn_command should succeed when venv python exists");
    }

    #[test]
    fn t33_agentscope_service_spawn_command_returns_dependency_error_when_venv_missing() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        let config = ServiceConfig {
            host: "0.0.0.0".to_string(),
            port: 9000,
            working_dir: PathBuf::from("/tmp"),
        };
        let err = service.spawn_command(&config).expect_err("should fail");
        assert!(matches!(err, ServiceError::DependencyNotInstalled(_)));
        assert!(err.to_string().contains("venv") || err.to_string().contains("Python"));
    }
}
