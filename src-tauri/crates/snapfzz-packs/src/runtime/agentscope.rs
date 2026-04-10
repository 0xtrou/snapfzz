// A033/AgentScopeService: AgentScope runtime as a managed service
use crate::runtime::python::PythonRuntime;
use crate::service::{HealthConfig, ManagedService, ResourceLimits, ServiceConfig, ServiceError};
use std::sync::Arc;

// A033/AgentScopeService: Wraps PythonRuntime to provide spawnable AgentScope service
pub struct AgentScopeService {
    runtime: Arc<PythonRuntime>,
}

impl AgentScopeService {
    pub fn new(runtime: Arc<PythonRuntime>) -> Self {
        Self { runtime }
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

    fn can_start(&self) -> bool {
        self.runtime.is_runtime_ready()
            && self.runtime.package_version("agentscope").is_some()
            && self.runtime.package_version("agentscope-runtime").is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::detect_platform;
    use std::path::PathBuf;

    fn make_runtime() -> Arc<PythonRuntime> {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        Arc::new(PythonRuntime::new(temp.path().to_path_buf(), platform))
    }

    #[test]
    fn t33_agentscope_service_id_and_name() {
        let runtime = make_runtime();
        let service = AgentScopeService::new(runtime);
        assert_eq!(service.id(), "agentscope");
        assert_eq!(service.name(), "AgentScope Runtime");
    }

    #[test]
    fn t33_agentscope_service_dependencies() {
        let runtime = make_runtime();
        let service = AgentScopeService::new(runtime);
        let deps = service.dependencies();
        assert!(deps.contains(&"uv"));
        assert!(deps.contains(&"python"));
        assert!(deps.contains(&"agentscope"));
        assert!(deps.contains(&"agentscope-runtime"));
    }

    #[test]
    fn t33_agentscope_service_health_config() {
        let runtime = make_runtime();
        let service = AgentScopeService::new(runtime);
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
        let runtime = make_runtime();
        let service = AgentScopeService::new(runtime);
        let limits = service.resource_limits();
        assert_eq!(limits.max_memory_mb, 512);
        assert_eq!(limits.max_restarts, 10);
    }

    #[test]
    fn t33_agentscope_service_can_start_false_without_venv() {
        let runtime = make_runtime();
        let service = AgentScopeService::new(runtime);
        assert!(!service.can_start());
    }

    #[test]
    fn t33_agentscope_service_spawn_command_fails_without_venv() {
        let runtime = make_runtime();
        let service = AgentScopeService::new(runtime);
        let config = ServiceConfig {
            host: "127.0.0.1".to_string(),
            port: 8090,
            working_dir: PathBuf::from("/tmp"),
        };
        let result = service.spawn_command(&config);
        assert!(result.is_err());
    }
}
