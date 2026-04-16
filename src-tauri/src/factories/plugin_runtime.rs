// A020/PluginArtifact: Generic process factory created from plugin manifest runtime declarations.
// Replaces hardcoded per-service factories (AgentScopeFactory) with a data-driven approach.

use std::collections::HashMap;
use std::path::PathBuf;

use snapfzz_kernel::constants::owner;
use snapfzz_kernel::process::{ProcessFactory, SpawnConfig};
use snapfzz_kernel::settings::Settings;
use snapfzz_packs::constants::{dirs, env_vars as packs_env_vars};
use snapfzz_packs::runtime::python::PythonRuntime;
use snapfzz_packs::service::{ResourceLimits, ServiceError};

/// Generic process factory created from plugin manifest runtime declarations.
/// Replaces hardcoded per-service factories (AgentScopeFactory) with a data-driven
/// approach: the plugin manifest declares what to run, and this factory handles the rest.
pub struct PluginProcessFactory {
    /// Leaked static string for trait compliance — factories are long-lived singletons.
    name: &'static str,
    plugin_id: String,
    command: String,
    health_path: &'static str,
    health_interval_ms: u64,
    max_memory_mb: u64,
    max_restarts: u32,
    requires_database: bool,
    env: HashMap<String, String>,
    plugins_dir: PathBuf,
    host_key: &'static str,
    port_key: &'static str,
}

impl PluginProcessFactory {
    pub fn new(
        runtime_id: String,
        plugin_id: String,
        command: String,
        health_path: String,
        health_interval_ms: u64,
        max_memory_mb: u64,
        max_restarts: u32,
        requires_database: bool,
        env: HashMap<String, String>,
        plugins_dir: PathBuf,
    ) -> Self {
        // Leak strings that must be &'static str per the ProcessFactory trait.
        // Factories are singletons registered once and never dropped, so the leak is intentional.
        let host_key_string = format!("{}Host", runtime_id);
        let port_key_string = format!("{}Port", runtime_id);

        Self {
            name: Box::leak(runtime_id.clone().into_boxed_str()),
            plugin_id,
            command,
            health_path: Box::leak(health_path.into_boxed_str()),
            health_interval_ms,
            max_memory_mb,
            max_restarts,
            requires_database,
            env,
            plugins_dir,
            host_key: Box::leak(host_key_string.into_boxed_str()),
            port_key: Box::leak(port_key_string.into_boxed_str()),
        }
    }

    /// Path to the plugin's runtime binary directory.
    fn runtime_bin_dir(&self) -> PathBuf {
        self.plugins_dir
            .join(&self.plugin_id)
            .join("runtime")
            .join(dirs::BIN)
    }

    /// Path to the plugin's data directory (working dir for the process).
    fn data_dir(&self) -> PathBuf {
        self.plugins_dir.join(&self.plugin_id).join(dirs::DATA)
    }

    /// Extract the binary name from the command string (first whitespace-delimited token).
    fn binary_name(&self) -> &str {
        self.command.split_whitespace().next().unwrap_or(&self.command)
    }
}

impl ProcessFactory for PluginProcessFactory {
    fn name(&self) -> &'static str {
        self.name
    }

    fn owner(&self) -> &'static str {
        // Plugin processes are owned by the system (managed lifecycle).
        owner::SYSTEM
    }

    fn health_path(&self) -> &'static str {
        self.health_path
    }

    fn health_interval_ms(&self) -> u64 {
        self.health_interval_ms
    }

    fn port_settings_keys(&self) -> (&'static str, &'static str) {
        (self.host_key, self.port_key)
    }

    fn working_dir(&self, _settings: &Settings) -> Option<PathBuf> {
        let dir = self.data_dir();
        let _ = std::fs::create_dir_all(&dir);
        Some(dir)
    }

    fn can_start(&self, _runtime: &PythonRuntime) -> bool {
        let bin_path = self.runtime_bin_dir().join(self.binary_name());
        bin_path.exists()
    }

    fn build_command(
        &self,
        config: &SpawnConfig,
        _runtime: &PythonRuntime,
    ) -> Result<tokio::process::Command, ServiceError> {
        let parts: Vec<&str> = self.command.split_whitespace().collect();
        if parts.is_empty() {
            return Err(ServiceError::SpawnFailed(
                "empty command in plugin runtime declaration".to_string(),
            ));
        }

        let bin_path = self.runtime_bin_dir().join(parts[0]);
        if !bin_path.exists() {
            return Err(ServiceError::SpawnFailed(format!(
                "plugin runtime binary not found at {}",
                bin_path.display()
            )));
        }

        let mut cmd = tokio::process::Command::new(&bin_path);

        // Append remaining args from the command string
        for arg in &parts[1..] {
            cmd.arg(arg);
        }

        // Inject host/port via standard env vars
        cmd.env(packs_env_vars::SNAPFZZ_HOST, &config.host);
        cmd.env(packs_env_vars::SNAPFZZ_PORT, config.port.to_string());

        // Inject database URL if this runtime requires it
        if self.requires_database {
            if let Some(ref db_url) = config.database_url {
                cmd.env("DATABASE_URL", db_url);
            }
        }

        // Inject custom environment variables from the manifest
        for (key, value) in &self.env {
            cmd.env(key, value);
        }

        cmd.current_dir(&config.working_dir);

        Ok(cmd)
    }

    fn resource_limits(&self) -> ResourceLimits {
        ResourceLimits {
            max_memory_mb: self.max_memory_mb,
            max_restarts: self.max_restarts,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use snapfzz_packs::detect_platform;
    use std::sync::Arc;

    fn make_factory(plugins_dir: &std::path::Path) -> PluginProcessFactory {
        PluginProcessFactory::new(
            "test-plugin-runtime".to_string(),
            "my-plugin".to_string(),
            "my-binary --serve".to_string(),
            "/health".to_string(),
            3000,
            512,
            5,
            false,
            HashMap::from([("CUSTOM_VAR".to_string(), "custom_value".to_string())]),
            plugins_dir.to_path_buf(),
        )
    }

    fn make_runtime() -> Arc<PythonRuntime> {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        Arc::new(PythonRuntime::new(temp.path().to_path_buf(), platform))
    }

    #[test]
    fn a020_plugin_factory_name_returns_runtime_id() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert_eq!(factory.name(), "test-plugin-runtime");
    }

    #[test]
    fn a020_plugin_factory_owner_returns_system() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert_eq!(factory.owner(), "system");
    }

    #[test]
    fn a020_plugin_factory_health_path_returns_configured_path() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert_eq!(factory.health_path(), "/health");
    }

    #[test]
    fn a020_plugin_factory_health_interval_returns_configured_ms() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert_eq!(factory.health_interval_ms(), 3000);
    }

    #[test]
    fn a020_plugin_factory_port_settings_keys_derived_from_runtime_id() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert_eq!(
            factory.port_settings_keys(),
            ("test-plugin-runtimeHost", "test-plugin-runtimePort")
        );
    }

    #[test]
    fn a020_plugin_factory_working_dir_returns_plugin_data_dir() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let settings = Settings::default();
        let working_dir = factory.working_dir(&settings).expect("working dir");
        assert_eq!(working_dir, temp.path().join("my-plugin").join("data"));
        assert!(working_dir.exists(), "working_dir should be auto-created");
    }

    #[test]
    fn a020_plugin_factory_can_start_false_when_binary_missing() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let runtime = make_runtime();
        assert!(!factory.can_start(&runtime));
    }

    #[test]
    fn a020_plugin_factory_can_start_true_when_binary_exists() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());

        // Create binary at plugins_dir/my-plugin/runtime/bin/my-binary
        let bin_dir = temp.path().join("my-plugin").join("runtime").join("bin");
        std::fs::create_dir_all(&bin_dir).expect("create bin dir");
        std::fs::write(bin_dir.join("my-binary"), b"#!/bin/sh\n").expect("write binary");

        let runtime = make_runtime();
        assert!(factory.can_start(&runtime));
    }

    #[test]
    fn a020_plugin_factory_build_command_fails_without_binary() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 9090,
            working_dir: temp.path().to_path_buf(),
            database_url: None,
        };
        let runtime = make_runtime();
        let err = factory
            .build_command(&config, &runtime)
            .expect_err("binary missing");
        assert!(
            err.to_string().contains("plugin runtime binary not found"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn a020_plugin_factory_build_command_succeeds_with_binary() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());

        // Create binary
        let bin_dir = temp.path().join("my-plugin").join("runtime").join("bin");
        std::fs::create_dir_all(&bin_dir).expect("create bin dir");
        std::fs::write(bin_dir.join("my-binary"), b"#!/bin/sh\n").expect("write binary");

        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 9090,
            working_dir: temp.path().to_path_buf(),
            database_url: None,
        };
        let runtime = make_runtime();
        let cmd = factory
            .build_command(&config, &runtime)
            .expect("build should succeed");
        let debug = format!("{cmd:?}");
        assert!(debug.contains("my-binary"), "command should reference binary");
    }

    #[test]
    fn a020_plugin_factory_build_command_injects_database_url_when_required() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = PluginProcessFactory::new(
            "db-plugin".to_string(),
            "db-plugin-id".to_string(),
            "db-binary".to_string(),
            "/health".to_string(),
            2000,
            256,
            3,
            true, // requires_database
            HashMap::new(),
            temp.path().to_path_buf(),
        );

        // Create binary
        let bin_dir = temp
            .path()
            .join("db-plugin-id")
            .join("runtime")
            .join("bin");
        std::fs::create_dir_all(&bin_dir).expect("create bin dir");
        std::fs::write(bin_dir.join("db-binary"), b"#!/bin/sh\n").expect("write binary");

        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 9090,
            working_dir: temp.path().to_path_buf(),
            database_url: Some("postgresql://localhost:5432/test".to_string()),
        };
        let runtime = make_runtime();
        // Should succeed — DATABASE_URL is injected into env
        let result = factory.build_command(&config, &runtime);
        assert!(result.is_ok());
    }

    #[test]
    fn a020_plugin_factory_resource_limits_returns_configured_values() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let limits = factory.resource_limits();
        assert_eq!(limits.max_memory_mb, 512);
        assert_eq!(limits.max_restarts, 5);
    }

    #[test]
    fn a020_plugin_factory_build_command_fails_with_empty_command() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = PluginProcessFactory::new(
            "empty-cmd".to_string(),
            "empty-plugin".to_string(),
            "".to_string(),
            "/health".to_string(),
            2000,
            256,
            3,
            false,
            HashMap::new(),
            temp.path().to_path_buf(),
        );

        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 9090,
            working_dir: temp.path().to_path_buf(),
            database_url: None,
        };
        let runtime = make_runtime();
        let err = factory
            .build_command(&config, &runtime)
            .expect_err("empty command");
        assert!(err.to_string().contains("empty command"));
    }

    #[test]
    fn a020_plugin_factory_binary_name_extracts_first_token() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert_eq!(factory.binary_name(), "my-binary");
    }

    #[test]
    fn a020_plugin_factory_default_port_is_none() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert!(factory.default_port().is_none());
    }

    #[test]
    fn a020_plugin_factory_config_path_is_none() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert!(factory.config_path(&PathBuf::from("/tmp")).is_none());
    }

    #[test]
    fn a020_plugin_factory_pre_run_setup_returns_ok() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let runtime = make_runtime();
        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 9090,
            working_dir: temp.path().to_path_buf(),
            database_url: None,
        };
        factory
            .pre_run_setup(&config, &runtime)
            .expect("default pre_run_setup should succeed");
    }
}
