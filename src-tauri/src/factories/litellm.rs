use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use snapfzz_kernel::process::{ProcessFactory, SpawnConfig, SpawnSecrets};
use snapfzz_kernel::settings::Settings;
use snapfzz_packs::data::DataDir;
use snapfzz_packs::runtime::litellm::LiteLLMService;
use snapfzz_packs::runtime::python::PythonRuntime;
use snapfzz_packs::service::{ManagedService, ResourceLimits, ServiceConfig, ServiceError};
use snapfzz_packs::versions;
use snapfzz_vault::SecretVault;

pub struct LiteLLMFactory {
    vault: Arc<std::sync::Mutex<SecretVault>>,
    service: LiteLLMService,
}

impl LiteLLMFactory {
    pub fn new(
        runtime: Arc<PythonRuntime>,
        vault: Arc<std::sync::Mutex<SecretVault>>,
        base_data_dir: PathBuf,
    ) -> Self {
        let data_dir = DataDir::new(&base_data_dir);
        let service = LiteLLMService::new(runtime, data_dir);
        Self { vault, service }
    }

    // A037/pre-run-setup: Resolve litellm sqlite DB file path in service data dir.
    fn database_path(&self) -> Result<PathBuf, ServiceError> {
        self.service
            .working_dir()
            .map(|dir| dir.join("litellm.db"))
            .map_err(|err| ServiceError::SpawnFailed(err.to_string()))
    }

    // A037/pre-run-setup: Resolve Prisma schema source path from installed litellm package.
    fn litellm_schema_source(runtime: &PythonRuntime) -> PathBuf {
        runtime
            .venv_dir()
            .join("lib")
            .join(format!("python{}", versions::PYTHON))
            .join("site-packages")
            .join("litellm")
            .join("proxy")
            .join("schema.prisma")
    }

    // A037/pre-run-setup: Rewrite prisma provider to sqlite for local file DB.
    fn patch_schema_provider(schema_path: &Path) -> Result<(), ServiceError> {
        let source = std::fs::read_to_string(schema_path)
            .map_err(|err| ServiceError::SpawnFailed(format!("read schema failed: {err}")))?;

        let patched = source.replace("provider = \"postgresql\"", "provider = \"sqlite\"");

        std::fs::write(schema_path, patched)
            .map_err(|err| ServiceError::SpawnFailed(format!("write schema failed: {err}")))
    }

    // A037/pre-run-setup: Execute prisma CLI commands in python venv.
    fn run_prisma_command(
        &self,
        prisma_bin: &Path,
        working_dir: &Path,
        args: &[&str],
        envs: &[(&str, String)],
    ) -> Result<(), ServiceError> {
        let mut command = std::process::Command::new(prisma_bin);
        command.args(args).current_dir(working_dir);
        for (key, value) in envs {
            command.env(key, value);
        }

        let output = command
            .output()
            .map_err(|err| ServiceError::SpawnFailed(format!("prisma spawn failed: {err}")))?;

        if output.status.success() {
            return Ok(());
        }

        Err(ServiceError::SpawnFailed(format!(
            "prisma command failed ({}): {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr)
        )))
    }

    fn resolve_secrets_from_vault(&self) -> SpawnSecrets {
        let mut guard = match self.vault.lock() {
            Ok(g) => g,
            Err(_) => return SpawnSecrets::default(),
        };

        let mut env = HashMap::new();

        if let Ok(master_key) = snapfzz_llm::vault::get_or_create_master_key(&mut guard) {
            env.insert("LITELLM_MASTER_KEY".to_string(), master_key);
        }

        for provider in &[
            "openai",
            "anthropic",
            "google",
            "mistral",
            "cohere",
            "azure",
        ] {
            if let Ok(keys) = snapfzz_llm::vault::list_provider_keys(&mut guard, provider) {
                for key_name in keys {
                    if let Ok(key_value) =
                        snapfzz_llm::vault::read_provider_key(&mut guard, provider, &key_name)
                    {
                        let env_var =
                            snapfzz_llm::vault::provider_key_to_env_var(provider, &key_name);
                        env.insert(env_var, key_value);
                    }
                }
            }
        }

        SpawnSecrets { env }
    }
}

impl ProcessFactory for LiteLLMFactory {
    fn name(&self) -> &'static str {
        "litellm"
    }

    fn health_path(&self) -> &'static str {
        "/health/liveness"
    }

    fn port_settings_keys(&self) -> (&'static str, &'static str) {
        ("litellmHost", "litellmPort")
    }

    fn working_dir(&self, _settings: &Settings) -> Option<PathBuf> {
        self.service.working_dir().ok()
    }

    fn can_start(&self, _runtime: &PythonRuntime) -> bool {
        self.service.can_start()
    }

    // A037/pre-run-setup: Refresh Prisma schema and SQLite metadata before LiteLLM startup.
    fn pre_run_setup(
        &self,
        _config: &SpawnConfig,
        runtime: &PythonRuntime,
    ) -> Result<(), ServiceError> {
        let working_dir = self
            .service
            .working_dir()
            .map_err(|err| ServiceError::SpawnFailed(err.to_string()))?;
        let schema_source = Self::litellm_schema_source(runtime);
        if !schema_source.exists() {
            return Err(ServiceError::DependencyNotInstalled(format!(
                "LiteLLM Prisma schema not found at {}",
                schema_source.display()
            )));
        }

        let prisma_bin = runtime.venv_dir().join("bin").join("prisma");
        if !prisma_bin.exists() {
            return Err(ServiceError::DependencyNotInstalled(format!(
                "prisma CLI not found at {}",
                prisma_bin.display()
            )));
        }

        let patched_schema_path = working_dir.join("schema.prisma");
        std::fs::copy(&schema_source, &patched_schema_path).map_err(|err| {
            ServiceError::SpawnFailed(format!(
                "copy schema failed from {} to {}: {err}",
                schema_source.display(),
                patched_schema_path.display()
            ))
        })?;
        Self::patch_schema_provider(&patched_schema_path)?;

        let schema_arg = format!("--schema={}", patched_schema_path.display());
        let database_url = format!("file:{}", self.database_path()?.display());

        self.run_prisma_command(&prisma_bin, &working_dir, &["generate", &schema_arg], &[])?;
        self.run_prisma_command(
            &prisma_bin,
            &working_dir,
            &["db", "push", "--skip-generate", &schema_arg],
            &[("DATABASE_URL", database_url)],
        )
    }

    fn build_command(
        &self,
        config: &SpawnConfig,
        _runtime: &PythonRuntime,
    ) -> Result<tokio::process::Command, ServiceError> {
        self.service
            .working_dir()
            .map_err(|e| ServiceError::SpawnFailed(e.to_string()))?;
        let config_path = self.service.config_path();
        let secrets = self.resolve_secrets_from_vault();
        let database_url = format!("file:{}", self.database_path()?.display());

        let mut cmd = self.service.spawn_command(&ServiceConfig {
            host: config.host.clone(),
            port: config.port,
            working_dir: config.working_dir.clone(),
        })?;

        if config_path.exists() {
            cmd.arg("--config").arg(&config_path);
        }

        cmd.env("DATABASE_URL", database_url);

        for (key, value) in secrets.env {
            cmd.env(key, value);
        }

        Ok(cmd)
    }

    fn resource_limits(&self) -> ResourceLimits {
        self.service.resource_limits()
    }

    fn config_path(&self, _data_dir: &PathBuf) -> Option<PathBuf> {
        Some(self.service.config_path())
    }
}

#[cfg(test)]
mod tests {
    use super::LiteLLMFactory;
    use snapfzz_kernel::process::{ProcessFactory, SpawnConfig};
    use snapfzz_kernel::settings::Settings;
    use snapfzz_packs::constants::versions;
    use snapfzz_packs::detect_platform;
    use snapfzz_packs::runtime::python::PythonRuntime;
    use snapfzz_vault::{load_or_generate_master_key, SecretVault};
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};

    fn runtime(base_dir: &std::path::Path) -> Arc<PythonRuntime> {
        let platform = detect_platform().expect("platform");
        Arc::new(PythonRuntime::new(base_dir.join("runtime"), platform))
    }

    fn make_factory(data_dir: &std::path::Path) -> LiteLLMFactory {
        let master_key = load_or_generate_master_key(data_dir).expect("master key");
        let vault = SecretVault::open(&master_key, data_dir.join("vault.enc")).expect("vault");
        LiteLLMFactory::new(
            runtime(data_dir),
            Arc::new(Mutex::new(vault)),
            data_dir.to_path_buf(),
        )
    }

    #[test]
    fn t37_litellm_factory_health_path_is_health_liveness() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert_eq!(factory.health_path(), "/health/liveness");
    }

    #[test]
    fn t37_litellm_factory_port_settings_keys_match_settings_contract() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert_eq!(factory.port_settings_keys(), ("litellmHost", "litellmPort"));
    }

    #[test]
    fn t37_litellm_factory_can_start_checks_python_runtime() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert!(!factory.can_start(&runtime(temp.path())));
    }

    #[test]
    fn t37_litellm_factory_build_command_creates_python_module_command() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 4000,
            working_dir: PathBuf::from("/tmp"),
        };
        let error = factory
            .build_command(&config, &runtime(temp.path()))
            .expect_err("litellm CLI missing");
        assert!(error.to_string().contains("litellm CLI"));
    }

    #[test]
    fn t37_litellm_factory_config_path_uses_data_dir_runtime_slug() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let path = factory
            .config_path(&PathBuf::from("/unused"))
            .expect("config path");
        assert!(path.to_string_lossy().contains("data/litellm/config.yaml"));
    }

    #[test]
    fn t37_litellm_factory_working_dir_returns_data_dir_runtime_slug() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let working_dir = factory
            .working_dir(&Settings::default())
            .expect("working dir");
        assert!(working_dir.to_string_lossy().contains("data/litellm"));
        assert!(working_dir.exists());
    }

    #[test]
    fn t37_pre_run_setup_schema_source_resolves_expected_package_path() {
        let temp = tempfile::tempdir().expect("tempdir");
        let runtime = runtime(temp.path());
        let schema_path = LiteLLMFactory::litellm_schema_source(&runtime);

        assert_eq!(
            schema_path,
            temp.path()
                .join("runtime")
                .join("python")
                .join("venv")
                .join("lib")
                .join(format!("python{}", versions::PYTHON))
                .join("site-packages")
                .join("litellm")
                .join("proxy")
                .join("schema.prisma")
        );
    }

    #[test]
    fn t37_pre_run_setup_patch_schema_provider_switches_postgresql_to_sqlite() {
        let temp = tempfile::tempdir().expect("tempdir");
        let schema_path = temp.path().join("schema.prisma");

        std::fs::write(
            &schema_path,
            "datasource db {\n  provider = \"postgresql\"\n  url = env(\"DATABASE_URL\")\n}\n",
        )
        .expect("write schema");

        LiteLLMFactory::patch_schema_provider(&schema_path).expect("patch provider");

        let patched = std::fs::read_to_string(&schema_path).expect("read patched schema");
        assert!(patched.contains("provider = \"sqlite\""));
        assert!(!patched.contains("provider = \"postgresql\""));
    }
}
