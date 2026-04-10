use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use snapfzz_kernel::process::{ProcessFactory, SpawnConfig, SpawnSecrets};
use snapfzz_kernel::settings::Settings;
use snapfzz_packs::runtime::litellm::LiteLLMService;
use snapfzz_packs::runtime::python::PythonRuntime;
use snapfzz_packs::service::{ManagedService, ResourceLimits, ServiceConfig, ServiceError};
use snapfzz_vault::SecretVault;

pub struct LiteLLMFactory {
    vault: Arc<std::sync::Mutex<SecretVault>>,
    data_dir: PathBuf,
}

impl LiteLLMFactory {
    pub fn new(vault: Arc<std::sync::Mutex<SecretVault>>, data_dir: PathBuf) -> Self {
        Self { vault, data_dir }
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
        let cwd = std::env::current_dir().ok()?;
        [
            cwd.join("intelligence"),
            cwd.join("..").join("intelligence"),
            cwd.join("../..").join("intelligence"),
        ]
        .into_iter()
        .find(|candidate| candidate.join("pyproject.toml").exists())
    }

    fn can_start(&self, runtime: &PythonRuntime) -> bool {
        let service = LiteLLMService::new(Arc::new(runtime.clone()));
        service.can_start()
    }

    fn build_command(
        &self,
        config: &SpawnConfig,
        runtime: &PythonRuntime,
    ) -> Result<tokio::process::Command, ServiceError> {
        let service = LiteLLMService::new(Arc::new(runtime.clone()));
        let config_path = self.data_dir.join("gateway").join("config.yaml");
        let secrets = self.resolve_secrets_from_vault();

        let mut cmd = service.spawn_command(&ServiceConfig {
            host: config.host.clone(),
            port: config.port,
            working_dir: config.working_dir.clone(),
        })?;

        if config_path.exists() {
            cmd.arg("--config").arg(&config_path);
        }

        for (key, value) in secrets.env {
            cmd.env(key, value);
        }

        Ok(cmd)
    }

    fn resource_limits(&self) -> ResourceLimits {
        ResourceLimits {
            max_memory_mb: 256,
            max_restarts: 10,
        }
    }

    fn config_path(&self, _data_dir: &PathBuf) -> Option<PathBuf> {
        Some(self.data_dir.join("gateway").join("config.yaml"))
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
    use std::sync::{Arc, Mutex, OnceLock};

    fn cwd_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn runtime() -> PythonRuntime {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        PythonRuntime::new(temp.path().to_path_buf(), platform)
    }

    fn make_factory(data_dir: &std::path::Path) -> LiteLLMFactory {
        let master_key = load_or_generate_master_key(data_dir).expect("master key");
        let vault = SecretVault::open(&master_key, data_dir.join("vault.enc")).expect("vault");
        LiteLLMFactory::new(Arc::new(Mutex::new(vault)), data_dir.to_path_buf())
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
        assert!(!factory.can_start(&runtime()));
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
            .build_command(&config, &runtime())
            .expect_err("venv missing");
        assert!(error.to_string().contains("Python venv"));
    }

    #[test]
    fn t37_litellm_factory_working_dir_finds_intelligence_project() {
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

        let temp = tempfile::tempdir().expect("tempdir");
        let working_dir = make_factory(temp.path())
            .working_dir(&Settings::default())
            .expect("working dir");

        std::env::set_current_dir(original).expect("restore cwd");
        assert_eq!(working_dir, intelligence);
    }
}
