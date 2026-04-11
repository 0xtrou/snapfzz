// A033/ManagedService: Trait for spawnable services that depend on Python packages
use crate::core::data::{DataDir, DataError};
use std::path::PathBuf;
use thiserror::Error;

/// Configuration for spawning a managed service.
// A033/ServiceConfig: Host, port, and working directory for service spawn
#[derive(Debug, Clone)]
pub struct ServiceConfig {
    pub host: String,
    pub port: u16,
    pub working_dir: PathBuf,
}

/// Health check configuration.
// A033/HealthConfig: URL and timing for health checks
#[derive(Debug, Clone)]
pub struct HealthConfig {
    pub url: String,
    pub interval_ms: u64,
    pub max_failures: u32,
}

/// Resource limits for a service.
// A033/ResourceLimits: Memory and restart constraints
#[derive(Debug, Clone)]
pub struct ResourceLimits {
    pub max_memory_mb: u64,
    pub max_restarts: u32,
}

// A033/ServiceError: Error types for managed service operations
#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("dependency not installed: {0}")]
    DependencyNotInstalled(String),
    #[error("spawn failed: {0}")]
    SpawnFailed(String),
    #[error("not installed")]
    NotInstalled,
}

/// Trait for services that can be spawned and managed by ProcessManager.
///
/// This is for RUNNABLE services (AgentScope, LiteLLM) that:
/// - Are installed via pip (not downloaded as binaries)
/// - Need to run as long-lived processes
/// - Have health endpoints and resource limits
///
/// Contrast with `SystemComponent` which is for DOWNLOADABLE components (CEF, uv, Python).
// A033/ManagedService: Core trait for pip-installed runnable services
#[async_trait::async_trait]
pub trait ManagedService: Send + Sync {
    /// Unique identifier for this service
    fn id(&self) -> &str;

    /// Human-readable name
    fn name(&self) -> &str;

    /// Component dependencies that must be installed
    fn dependencies(&self) -> Vec<&str>;

    /// Build the spawn command for this service
    fn spawn_command(
        &self,
        config: &ServiceConfig,
    ) -> Result<tokio::process::Command, ServiceError>;

    /// Health check configuration
    fn health_config(&self, config: &ServiceConfig) -> HealthConfig;

    /// Resource limits for this service
    fn resource_limits(&self) -> ResourceLimits;

    fn data_dir(&self) -> &DataDir;

    fn working_dir(&self) -> Result<PathBuf, DataError> {
        self.data_dir().ensure_runtime_dir(self.id())
    }

    /// Check if this service can start (all deps installed)
    fn can_start(&self) -> bool;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn t33_service_config_fields_preserve_values() {
        let config = ServiceConfig {
            host: "127.0.0.1".to_string(),
            port: 8090,
            working_dir: PathBuf::from("/tmp/work"),
        };
        assert_eq!(config.host, "127.0.0.1");
        assert_eq!(config.port, 8090);
        assert_eq!(config.working_dir, PathBuf::from("/tmp/work"));
    }

    #[test]
    fn t33_health_config_fields_preserve_values() {
        let config = HealthConfig {
            url: "http://127.0.0.1:8090/health".to_string(),
            interval_ms: 2000,
            max_failures: 3,
        };
        assert_eq!(config.url, "http://127.0.0.1:8090/health");
        assert_eq!(config.interval_ms, 2000);
        assert_eq!(config.max_failures, 3);
    }

    #[test]
    fn t33_resource_limits_fields_preserve_values() {
        let limits = ResourceLimits {
            max_memory_mb: 512,
            max_restarts: 10,
        };
        assert_eq!(limits.max_memory_mb, 512);
        assert_eq!(limits.max_restarts, 10);
    }

    #[test]
    fn t33_service_error_variants_produce_messages() {
        assert!(ServiceError::DependencyNotInstalled("python".into())
            .to_string()
            .contains("python"));
        assert!(ServiceError::SpawnFailed("oops".into())
            .to_string()
            .contains("oops"));
        assert!(ServiceError::NotInstalled
            .to_string()
            .contains("not installed"));
    }
}
