// A020/AgentScopeService: Orchestrator runtime as a managed service.
// Runs the `orchestrator` binary (installed via pip as snapfzz-orchestrator)
// which provides multi-agent intelligence with tool guard, memory, and mission mode.
use crate::core::constants::{binaries, dependencies, dirs, env_vars, health, resources, services};
use crate::core::data::DataDir;
use crate::core::python::runtime::PythonRuntime;
use crate::core::service::{HealthConfig, ManagedService, ResourceLimits, ServiceConfig, ServiceError};
use std::sync::Arc;

pub struct AgentScopeService {
    runtime: Arc<PythonRuntime>,
    data_dir: DataDir,
}

impl AgentScopeService {
    pub fn new(runtime: Arc<PythonRuntime>, data_dir: DataDir) -> Self {
        Self { runtime, data_dir }
    }

    /// Path to the `orchestrator` binary inside the managed venv.
    fn orchestrator_binary(&self) -> std::path::PathBuf {
        self.runtime.venv_dir().join(dirs::BIN).join(binaries::ORCHESTRATOR)
    }
}

#[async_trait::async_trait]
impl ManagedService for AgentScopeService {
    fn id(&self) -> &str {
        services::AGENTSCOPE_ID
    }

    fn name(&self) -> &str {
        services::AGENTSCOPE_NAME
    }

    fn dependencies(&self) -> Vec<&str> {
        dependencies::AGENTSCOPE_DEPS.to_vec()
    }

    fn spawn_command(
        &self,
        config: &ServiceConfig,
    ) -> Result<tokio::process::Command, ServiceError> {
        let bin = self.orchestrator_binary();
        if !bin.exists() {
            return Err(ServiceError::DependencyNotInstalled(
                "orchestrator binary (pip install snapfzz-orchestrator)".into(),
            ));
        }

        let mut cmd = tokio::process::Command::new(bin);
        cmd.arg("app")
            .arg("--host")
            .arg(&config.host)
            .arg("--port")
            .arg(config.port.to_string())
            .current_dir(&config.working_dir)
            .env(env_vars::SNAPFZZ_HOST, &config.host)
            .env(env_vars::SNAPFZZ_PORT, config.port.to_string())
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
            url: format!("http://{}:{}{}", config.host, config.port, health::AGENTSCOPE_PATH),
            interval_ms: health::AGENTSCOPE_INTERVAL_MS,
            max_failures: health::DEFAULT_MAX_FAILURES,
        }
    }

    fn resource_limits(&self) -> ResourceLimits {
        ResourceLimits {
            max_memory_mb: resources::AGENTSCOPE_MAX_MEMORY_MB,
            max_restarts: resources::AGENTSCOPE_MAX_RESTARTS,
        }
    }

    fn data_dir(&self) -> &DataDir {
        &self.data_dir
    }

    fn can_start(&self) -> bool {
        self.orchestrator_binary().exists()
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

    /// Create a service with a real orchestrator binary stub in the venv.
    fn make_service_with_binary(base_dir: &Path) -> (AgentScopeService, tempfile::TempDir) {
        let runtime_temp = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        let runtime = Arc::new(PythonRuntime::new(
            runtime_temp.path().to_path_buf(),
            platform,
        ));

        let venv_bin = runtime.venv_dir().join("bin");
        std::fs::create_dir_all(&venv_bin).expect("create venv bin");
        std::fs::write(venv_bin.join("orchestrator"), b"#!/bin/sh\n").expect("create binary");

        let service = AgentScopeService::new(runtime, DataDir::new(base_dir));
        (service, runtime_temp)
    }

    #[test]
    fn t33_agentscope_service_id_and_name() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        assert_eq!(service.id(), "agentscope");
        assert_eq!(service.name(), "Orchestrator");
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
        assert!(deps.contains(&"snapfzz-orchestrator"));
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
    fn t33_agentscope_service_can_start_false_when_binary_missing() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        assert!(!service.can_start());
    }

    #[test]
    fn t33_agentscope_service_can_start_true_when_binary_exists() {
        let temp = tempfile::tempdir().expect("tempdir");
        let (service, _rt) = make_service_with_binary(temp.path());
        assert!(service.can_start());
    }

    #[test]
    fn t33_agentscope_service_spawn_command_fails_without_binary() {
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
    fn t33_agentscope_service_spawn_command_succeeds_when_binary_exists() {
        let temp = tempfile::tempdir().expect("tempdir");
        let (service, _rt) = make_service_with_binary(temp.path());
        let config = ServiceConfig {
            host: "127.0.0.1".to_string(),
            port: 8090,
            working_dir: temp.path().to_path_buf(),
        };
        let result = service.spawn_command(&config);
        assert!(result.is_ok(), "spawn_command should succeed when orchestrator binary exists");
    }

    #[test]
    fn t33_agentscope_service_spawn_command_returns_dependency_error_when_binary_missing() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        let config = ServiceConfig {
            host: "0.0.0.0".to_string(),
            port: 9000,
            working_dir: PathBuf::from("/tmp"),
        };
        let err = service.spawn_command(&config).expect_err("should fail");
        assert!(matches!(err, ServiceError::DependencyNotInstalled(_)));
        assert!(err.to_string().contains("orchestrator"));
    }

    #[test]
    fn t33_agentscope_service_orchestrator_binary_path() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        let bin = service.orchestrator_binary();
        assert!(bin.to_string_lossy().contains("orchestrator"));
        assert!(bin.to_string_lossy().contains("venv"));
    }
}
