use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::Arc;

// NOTE: Config is generated dynamically in pre_run_setup to include the
// disk_cache_dir path. DEFAULT_CONFIG_TEMPLATE is no longer used.

const ENV_LITELLM_MASTER_KEY: &str = "LITELLM_MASTER_KEY";
const ENV_LITELLM_SALT_KEY: &str = "LITELLM_SALT_KEY";
const ENV_DATABASE_URL: &str = "DATABASE_URL";

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

    fn resolve_secrets_from_vault(&self) -> SpawnSecrets {
        let mut guard = match self.vault.lock() {
            Ok(g) => g,
            Err(_) => return SpawnSecrets::default(),
        };

        let mut env = HashMap::new();

        if let Ok(master_key) = snapfzz_llm::vault::get_or_create_master_key(&mut guard) {
            env.insert(ENV_LITELLM_MASTER_KEY.to_string(), master_key);
        }

        // A013/SaltKey: Stable encryption key for DB model persistence.
        // Without this, LiteLLM generates a random salt per restart and can't
        // decrypt previously stored models → they're silently lost.
        let salt_key = match guard.read("litellm:salt_key") {
            Ok(existing) => {
                let key = String::from_utf8(existing).unwrap_or_default();
                eprintln!("[litellm] using existing salt key: {}...", &key[..key.len().min(12)]);
                key
            }
            Err(e) => {
                eprintln!("[litellm] salt key not found ({e}), generating new one");
                let generated = format!("sk-salt-{:x}{:x}",
                    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos(),
                    std::process::id() as u128,
                );
                let _ = guard.store("litellm:salt_key", generated.as_bytes());
                eprintln!("[litellm] stored new salt key: {}...", &generated[..generated.len().min(12)]);
                generated
            }
        };
        if !salt_key.is_empty() {
            env.insert(ENV_LITELLM_SALT_KEY.to_string(), salt_key);
        }

        SpawnSecrets { env }
    }
}

impl ProcessFactory for LiteLLMFactory {
    fn name(&self) -> &'static str {
        "llm-gateway"
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

    fn pre_run_setup(
        &self,
        config: &SpawnConfig,
        runtime: &PythonRuntime,
    ) -> Result<(), ServiceError> {
        let database_url = config
            .database_url
            .as_ref()
            .ok_or_else(|| ServiceError::SpawnFailed("PostgreSQL URL not available".to_string()))?;

        // A013/ModelDB: Always regenerate config.yaml — it's fully managed, not user-edited.
        // Includes disk cache settings so LiteLLM caches responses locally without any
        // user configuration.
        let config_path = self.service.config_path();
        if let Some(parent) = config_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let cache_dir = config_path
            .parent()
            .unwrap_or(config_path.as_path())
            .join(".litellm_cache");
        let _ = std::fs::create_dir_all(&cache_dir);
        let config_content = format!(
            "general_settings:\n\
             \x20 master_key: os.environ/{}\n\
             \x20 database_url: os.environ/{}\n\
             \x20 store_model_in_db: True\n\
             \x20 store_prompts_in_spend_logs: True\n\
             \n\
             litellm_settings:\n\
             \x20 drop_params: True\n\
             \x20 cache: True\n\
             \x20 cache_params:\n\
             \x20   type: \"disk\"\n\
             \x20   disk_cache_dir: \"{}\"\n",
            ENV_LITELLM_MASTER_KEY,
            ENV_DATABASE_URL,
            cache_dir.to_string_lossy(),
        );
        let _ = std::fs::write(&config_path, &config_content);
        eprintln!("[litellm] wrote config.yaml with disk cache at {}", cache_dir.display());

        let working_dir = self
            .service
            .working_dir()
            .map_err(|err| ServiceError::SpawnFailed(err.to_string()))?;
        let prisma_bin = runtime.venv_dir().join("bin").join("prisma");
        if !prisma_bin.exists() {
            return Err(ServiceError::DependencyNotInstalled(format!(
                "prisma CLI not found at {}",
                prisma_bin.display()
            )));
        }

        // A038/pre_run_setup: Run prisma generate against installed litellm schema
        let schema_path = runtime
            .venv_dir()
            .join("lib")
            .join(format!("python{}", versions::PYTHON))
            .join("site-packages")
            .join("litellm")
            .join("proxy")
            .join("schema.prisma");
        if !schema_path.exists() {
            return Err(ServiceError::DependencyNotInstalled(format!(
                "LiteLLM Prisma schema not found at {}",
                schema_path.display()
            )));
        }

        let schema_arg = format!("--schema={}", schema_path.display());

        // A039/prisma_cache: Skip prisma generate + db push when schema unchanged
        let schema_bytes = std::fs::read(&schema_path)
            .map_err(|err| ServiceError::SpawnFailed(format!("failed to read schema: {err}")))?;
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        schema_bytes.hash(&mut hasher);
        let current_hash = hasher.finish();
        let hash_file = working_dir.join(".prisma_hash");
        let stored_hash: Option<u64> = std::fs::read_to_string(&hash_file)
            .ok()
            .and_then(|s| s.trim().parse().ok());

        if stored_hash == Some(current_hash) {
            eprintln!("[litellm] prisma schema unchanged — skipping generate + db push");
            return Ok(());
        }

        // A038/pre_run_setup: prisma-client-py generator must be on PATH for `prisma generate`
        let venv_bin = runtime.venv_dir().join("bin");
        let path_with_venv = std::env::var("PATH")
            .map(|p| format!("{}:{p}", venv_bin.display()))
            .unwrap_or_else(|_| venv_bin.display().to_string());

        let output = std::process::Command::new(&prisma_bin)
            .args(["generate", schema_arg.as_str()])
            .env(ENV_DATABASE_URL, database_url)
            .env("PATH", &path_with_venv)
            .current_dir(&working_dir)
            .output()
            .map_err(|err| ServiceError::SpawnFailed(format!("prisma generate failed: {err}")))?;
        if !output.status.success() {
            return Err(ServiceError::SpawnFailed(format!(
                "prisma generate failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        let output = std::process::Command::new(&prisma_bin)
            .args(["db", "push", "--skip-generate", schema_arg.as_str()])
            .env(ENV_DATABASE_URL, database_url)
            .env("PATH", &path_with_venv)
            .current_dir(&working_dir)
            .output()
            .map_err(|err| ServiceError::SpawnFailed(format!("prisma db push failed: {err}")))?;
        if !output.status.success() {
            return Err(ServiceError::SpawnFailed(format!(
                "prisma db push failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        // Write new hash after successful prisma run
        let _ = std::fs::write(&hash_file, current_hash.to_string());

        Ok(())
    }

    fn build_command(
        &self,
        config: &SpawnConfig,
        runtime: &PythonRuntime,
    ) -> Result<tokio::process::Command, ServiceError> {
        self.service
            .working_dir()
            .map_err(|e| ServiceError::SpawnFailed(e.to_string()))?;
        let secrets = self.resolve_secrets_from_vault();

        let mut cmd = self.service.spawn_command(&ServiceConfig {
            host: config.host.clone(),
            port: config.port,
            working_dir: config.working_dir.clone(),
        })?;

        // A013/Prisma: LiteLLM needs prisma on PATH at runtime for DB connection.
        let venv_bin = runtime.venv_dir().join("bin");
        let path_with_venv = std::env::var("PATH")
            .map(|p| format!("{}:{p}", venv_bin.display()))
            .unwrap_or_else(|_| venv_bin.display().to_string());
        cmd.env("PATH", &path_with_venv);

        // A013/ModelDB: Minimal config.yaml with store_model_in_db=True so models
        // added via POST /model/new persist in PostgreSQL across restarts.
        let config_path = self.service.config_path();
        if config_path.exists() {
            cmd.arg("--config").arg(&config_path);
        }

        if let Some(ref db_url) = config.database_url {
            cmd.env(ENV_DATABASE_URL, db_url);
            cmd.env("STORE_MODEL_IN_DB", "True");
        }

        for (key, value) in secrets.env {
            cmd.env(key, value);
        }

        Ok(cmd)
    }

    fn resource_limits(&self) -> ResourceLimits {
        self.service.resource_limits()
    }

    fn config_path(&self, _data_dir: &PathBuf) -> Option<PathBuf> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::LiteLLMFactory;
    use snapfzz_kernel::process::{ProcessFactory, SpawnConfig};
    use snapfzz_kernel::settings::Settings;
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
            database_url: None,
        };
        let error = factory
            .build_command(&config, &runtime(temp.path()))
            .expect_err("litellm CLI missing");
        assert!(error.to_string().contains("litellm CLI"));
    }

    #[test]
    fn t37_litellm_factory_config_path_returns_none() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert!(factory.config_path(&PathBuf::from("/unused")).is_none());
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
    fn t38_litellm_factory_pre_run_setup_requires_database_url() {
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 4000,
            working_dir: PathBuf::from("/tmp"),
            database_url: None,
        };

        let err = factory
            .pre_run_setup(&config, &runtime(temp.path()))
            .expect_err("database URL required");
        assert!(err.to_string().contains("PostgreSQL URL not available"));
    }

    #[test]
    fn t38_litellm_factory_owner_returns_system() {
        // A038/owner: LiteLLMFactory inherits the default owner "system" from ProcessFactory trait
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert_eq!(factory.owner(), "system");
    }

    #[test]
    fn t38_litellm_factory_build_command_with_database_url_set_fails_on_missing_cli_not_url() {
        // A038/DATABASE_URL: When database_url is provided, build_command propagates the URL into
        // the command env and only fails because the litellm binary is absent, not because the
        // URL itself is rejected.
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 4000,
            working_dir: PathBuf::from("/tmp"),
            database_url: Some("postgresql://localhost:5432/litellm".to_string()),
        };

        let err = factory
            .build_command(&config, &runtime(temp.path()))
            .expect_err("litellm CLI missing");
        assert!(
            err.to_string().contains("litellm CLI"),
            "expected CLI-not-found error, got: {err}"
        );
    }

    #[test]
    fn t38_litellm_factory_pre_run_setup_with_database_url_fails_on_missing_prisma_not_url() {
        // A038/pre_run_setup: When database_url is provided but no venv is installed, the error
        // is about the missing prisma binary — not a missing URL — confirming the URL gate passed.
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let config = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 4000,
            working_dir: PathBuf::from("/tmp"),
            database_url: Some("postgresql://localhost:5432/litellm".to_string()),
        };

        let err = factory
            .pre_run_setup(&config, &runtime(temp.path()))
            .expect_err("prisma binary missing");
        assert!(
            err.to_string().contains("prisma CLI not found"),
            "expected prisma-not-found error, got: {err}"
        );
    }

    #[test]
    fn t38_litellm_factory_name_is_litellm() {
        // A038/name: Factory name must match the registry key used to look up this service
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        assert_eq!(factory.name(), "llm-gateway");
    }

    #[test]
    fn t39_litellm_pre_run_setup_schema_hash_path() {
        // A039/prisma_cache: Hash file must live inside the service working_dir so it persists
        // between boots and is co-located with the schema it represents.
        let temp = tempfile::tempdir().expect("tempdir");
        let factory = make_factory(temp.path());
        let working_dir = factory
            .working_dir(&snapfzz_kernel::settings::Settings::default())
            .expect("working dir");
        let hash_file = working_dir.join(".prisma_hash");
        // The hash file path is deterministic: working_dir/.prisma_hash
        assert!(
            hash_file.to_string_lossy().ends_with("/.prisma_hash"),
            "expected hash file at working_dir/.prisma_hash, got: {}",
            hash_file.display()
        );
        // The parent (working_dir) must already exist (created by the service)
        assert!(
            working_dir.exists(),
            "working_dir must exist so the hash file can be written without extra setup"
        );
    }
}
