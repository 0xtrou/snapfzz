// A033/LiteLLMService: LiteLLM gateway as a managed service
use crate::runtime::python::PythonRuntime;
use crate::service::{HealthConfig, ManagedService, ResourceLimits, ServiceConfig, ServiceError};
use std::sync::Arc;

// A033/LiteLLMService: Wraps PythonRuntime to provide spawnable LiteLLM gateway
pub struct LiteLLMService {
    runtime: Arc<PythonRuntime>,
}

impl LiteLLMService {
    pub fn new(runtime: Arc<PythonRuntime>) -> Self {
        Self { runtime }
    }
}

#[async_trait::async_trait]
impl ManagedService for LiteLLMService {
    fn id(&self) -> &str {
        "litellm"
    }

    fn name(&self) -> &str {
        "LiteLLM Gateway"
    }

    fn dependencies(&self) -> Vec<&str> {
        vec!["uv", "python", "litellm"]
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
            .arg("litellm")
            .arg("--port")
            .arg(config.port.to_string())
            .current_dir(&config.working_dir)
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
            interval_ms: 5000,
            max_failures: 3,
        }
    }

    fn resource_limits(&self) -> ResourceLimits {
        ResourceLimits {
            max_memory_mb: 1024,
            max_restarts: 5,
        }
    }

    fn can_start(&self) -> bool {
        self.runtime.is_runtime_ready() && self.runtime.package_version("litellm").is_some()
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
    fn t33_litellm_service_id_and_name() {
        let runtime = make_runtime();
        let service = LiteLLMService::new(runtime);
        assert_eq!(service.id(), "litellm");
        assert_eq!(service.name(), "LiteLLM Gateway");
    }

    #[test]
    fn t33_litellm_service_dependencies() {
        let runtime = make_runtime();
        let service = LiteLLMService::new(runtime);
        let deps = service.dependencies();
        assert!(deps.contains(&"uv"));
        assert!(deps.contains(&"python"));
        assert!(deps.contains(&"litellm"));
    }

    #[test]
    fn t33_litellm_service_health_config() {
        let runtime = make_runtime();
        let service = LiteLLMService::new(runtime);
        let config = ServiceConfig {
            host: "127.0.0.1".to_string(),
            port: 4000,
            working_dir: PathBuf::from("/tmp"),
        };
        let health = service.health_config(&config);
        assert_eq!(health.url, "http://127.0.0.1:4000/health");
        assert_eq!(health.interval_ms, 5000);
        assert_eq!(health.max_failures, 3);
    }

    #[test]
    fn t33_litellm_service_resource_limits() {
        let runtime = make_runtime();
        let service = LiteLLMService::new(runtime);
        let limits = service.resource_limits();
        assert_eq!(limits.max_memory_mb, 1024);
        assert_eq!(limits.max_restarts, 5);
    }

    #[test]
    fn t33_litellm_service_can_start_false_without_venv() {
        let runtime = make_runtime();
        let service = LiteLLMService::new(runtime);
        assert!(!service.can_start());
    }

    #[test]
    fn t33_litellm_service_spawn_command_fails_without_venv() {
        let runtime = make_runtime();
        let service = LiteLLMService::new(runtime);
        let config = ServiceConfig {
            host: "127.0.0.1".to_string(),
            port: 4000,
            working_dir: PathBuf::from("/tmp"),
        };
        let result = service.spawn_command(&config);
        assert!(result.is_err());
    }
}
