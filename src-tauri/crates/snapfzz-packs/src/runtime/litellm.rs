// A033/LiteLLMService: LiteLLM gateway as a managed service
use crate::data::{slugs, DataDir};
use crate::runtime::python::PythonRuntime;
use crate::service::{HealthConfig, ManagedService, ResourceLimits, ServiceConfig, ServiceError};
use std::path::PathBuf;
use std::sync::Arc;

// A033/LiteLLMService: Wraps PythonRuntime to provide spawnable LiteLLM gateway
pub struct LiteLLMService {
    runtime: Arc<PythonRuntime>,
    data_dir: DataDir,
}

impl LiteLLMService {
    pub fn new(runtime: Arc<PythonRuntime>, data_dir: DataDir) -> Self {
        Self { runtime, data_dir }
    }

    pub fn config_path(&self) -> PathBuf {
        self.data_dir.config_path(slugs::LITELLM, "config.yaml")
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
        // A033/LiteLLM: Use litellm CLI directly (not python -m litellm which doesn't work)
        let litellm_bin = self.runtime.venv_dir().join("bin").join("litellm");
        if !litellm_bin.exists() {
            return Err(ServiceError::DependencyNotInstalled("litellm CLI".into()));
        }

        let mut cmd = tokio::process::Command::new(litellm_bin);
        cmd.arg("--port")
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
            url: format!("http://{}:{}/health/liveness", config.host, config.port),
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

    fn data_dir(&self) -> &DataDir {
        &self.data_dir
    }

    fn can_start(&self) -> bool {
        self.runtime.is_runtime_ready() && self.runtime.package_version("litellm").is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::DataDir;
    use crate::platform::detect_platform;
    use std::path::{Path, PathBuf};

    fn make_runtime() -> Arc<PythonRuntime> {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        Arc::new(PythonRuntime::new(temp.path().to_path_buf(), platform))
    }

    fn make_service(base_dir: &Path) -> LiteLLMService {
        LiteLLMService::new(make_runtime(), DataDir::new(base_dir))
    }

    #[test]
    fn t33_litellm_service_id_and_name() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        assert_eq!(service.id(), "litellm");
        assert_eq!(service.name(), "LiteLLM Gateway");
    }

    #[test]
    fn t33_litellm_service_dependencies() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        let deps = service.dependencies();
        assert!(deps.contains(&"uv"));
        assert!(deps.contains(&"python"));
        assert!(deps.contains(&"litellm"));
    }

    #[test]
    fn t33_litellm_service_health_config() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        let config = ServiceConfig {
            host: "127.0.0.1".to_string(),
            port: 4000,
            working_dir: PathBuf::from("/tmp"),
        };
        let health = service.health_config(&config);
        assert_eq!(health.url, "http://127.0.0.1:4000/health/liveness");
        assert_eq!(health.interval_ms, 5000);
        assert_eq!(health.max_failures, 3);
    }

    #[test]
    fn t33_litellm_service_resource_limits() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        let limits = service.resource_limits();
        assert_eq!(limits.max_memory_mb, 1024);
        assert_eq!(limits.max_restarts, 5);
    }

    #[test]
    fn t33_litellm_service_working_dir_uses_runtime_data_dir() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        let working_dir = service.working_dir().expect("working dir");
        assert_eq!(working_dir, temp.path().join("data").join("litellm"));
        assert!(working_dir.exists());
    }

    #[test]
    fn t33_litellm_service_config_path_uses_runtime_data_dir() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        assert_eq!(
            service.config_path(),
            temp.path().join("data").join("litellm").join("config.yaml")
        );
    }

    #[test]
    fn t33_litellm_service_can_start_false_without_venv() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        assert!(!service.can_start());
    }

    #[test]
    fn t33_litellm_service_spawn_command_fails_without_venv() {
        let temp = tempfile::tempdir().expect("tempdir");
        let service = make_service(temp.path());
        let config = ServiceConfig {
            host: "127.0.0.1".to_string(),
            port: 4000,
            working_dir: PathBuf::from("/tmp"),
        };
        let result = service.spawn_command(&config);
        assert!(result.is_err());
    }
}
