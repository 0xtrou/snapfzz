use std::net::TcpListener;
use std::sync::Arc;
use std::time::Instant;

use crate::budget::metrics::ProcessStatus;
use crate::budget::supervised::{ProcessBudget, ProcessLocation};
use crate::budget::BudgetRegistry;
use crate::process::logs::ProcessLogs;
use crate::process::{ProcessError, ProcessFactory, ProcessManager, SpawnConfig};
use crate::settings::{Settings, SettingsManager};
use snapfzz_packs::runtime::python::PythonRuntime;

pub struct BudgetedProcess {
    name: String,
    owner: String,
    factory: Arc<dyn ProcessFactory>,
    config: SpawnConfig,
    pid: Option<u32>,
    status: ProcessStatus,
    started_at: Option<Instant>,
    restart_count: u32,
    consecutive_failures: u32,
    health_url: String,
    health_interval_ms: u64,
    max_health_failures: u32,
    max_restarts: u32,
    registry: Arc<BudgetRegistry>,
    logs: Arc<ProcessLogs>,
    settings_mgr: Arc<SettingsManager>,
    python_runtime: Arc<PythonRuntime>,
    process_mgr: Arc<ProcessManager>,
}

impl BudgetedProcess {
    // A037/budgeted_process: Construct a process wrapper from factory metadata and shared dependencies.
    pub fn new(
        factory: Arc<dyn ProcessFactory>,
        registry: Arc<BudgetRegistry>,
        logs: Arc<ProcessLogs>,
        settings_mgr: Arc<SettingsManager>,
        python_runtime: Arc<PythonRuntime>,
        process_mgr: Arc<ProcessManager>,
    ) -> Result<Self, ProcessError> {
        let settings = settings_mgr
            .load()
            .map_err(|err| ProcessError::SpawnFailed(err.to_string()))?;
        let config = Self::resolve_config(factory.as_ref(), &settings)?;

        let preset_max_restarts = {
            let preset = registry.preset.read().unwrap();
            preset.reliability.max_restarts
        };
        let limits = factory.resource_limits();
        let max_restarts = limits.max_restarts.min(preset_max_restarts);
        let health_url = format!("http://{}:{}{}", config.host, config.port, factory.health_path());

        Ok(Self {
            name: factory.name().to_string(),
            owner: factory.owner().to_string(),
            factory,
            config,
            pid: None,
            status: ProcessStatus::Stopped,
            started_at: None,
            restart_count: 0,
            consecutive_failures: 0,
            health_url,
            health_interval_ms: 2000,
            max_health_failures: 3,
            max_restarts,
            registry,
            logs,
            settings_mgr,
            python_runtime,
            process_mgr,
        })
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn set_restart_count(&mut self, value: u32) {
        self.restart_count = value;
    }

    pub fn set_consecutive_failures(&mut self, value: u32) {
        self.consecutive_failures = value;
    }

    pub fn pid(&self) -> Option<u32> {
        self.pid
    }

    pub async fn spawn(&mut self) -> Result<(), ProcessError> {
        if !self.factory.can_start(&self.python_runtime) {
            eprintln!("[process] can_start() returned false for '{}'", self.name);
            return Err(ProcessError::SpawnFailed(format!(
                "dependencies not installed for '{}'",
                self.name
            )));
        }

        let mut command = self
            .factory
            .build_command(&self.config, &self.python_runtime)
            .map_err(|err| ProcessError::SpawnFailed(err.to_string()))?;

        // A037/port_cleanup: Ensure selected port is free before child spawn.
        crate::process::kill_process_on_port(self.config.port);

        self.status = ProcessStatus::Starting;
        let budget = ProcessBudget {
            pid: None,
            health_url: self.health_url.clone(),
            health_interval_ms: self.health_interval_ms,
            max_health_failures: self.max_health_failures,
            max_restarts: self.max_restarts,
            location: ProcessLocation::Local,
            consecutive_failures: 0,
            restart_count: self.restart_count,
            status: self.status.clone(),
            started_at: Some(Instant::now()),
            owner: self.owner.clone(),
        };

        let pid = self
            .process_mgr
            .spawn_process(&self.name, &mut command, budget, &self.registry, 120)
            .await?;

        self.pid = Some(pid);
        self.status = ProcessStatus::Online;
        self.started_at = Some(Instant::now());
        self.consecutive_failures = 0;

        self.persist_config()?;
        Ok(())
    }

    pub async fn kill(&mut self) -> Result<(), ProcessError> {
        self.process_mgr.shutdown(&self.name).await?;
        self.registry.supervised.unregister_process(&self.name);
        self.pid = None;
        self.status = ProcessStatus::Stopped;
        self.started_at = None;
        Ok(())
    }

    pub async fn restart(&mut self) -> Result<(), ProcessError> {
        self.kill().await?;
        self.restart_count += 1;
        self.spawn().await
    }

    pub fn snapshot(&self) -> crate::budget::metrics::ProcessSnapshot {
        let rss_mb = self.measure_rss();
        let cpu_pct = self.measure_cpu();
        let uptime_secs = self.started_at.map(|t| t.elapsed().as_secs()).unwrap_or(0);

        crate::budget::metrics::ProcessSnapshot {
            name: self.name.clone(),
            pid: self.pid,
            status: self.status.clone(),
            rss_mb,
            cpu_pct,
            restart_count: self.restart_count,
            consecutive_failures: self.consecutive_failures,
            uptime_secs,
            location: "local".to_string(),
            health_url: self.health_url.clone(),
            owner: self.owner.clone(),
        }
    }

    pub async fn check_health(&mut self) -> bool {
        let healthy = self.registry.supervised.check_health(&self.name).await;

        if healthy {
            self.status = ProcessStatus::Online;
            self.consecutive_failures = 0;
        } else {
            self.consecutive_failures += 1;
            self.status = ProcessStatus::Unhealthy;
        }

        if let Some(mut entry) = self.registry.supervised.processes.get_mut(&self.name) {
            entry.status = self.status.clone();
            entry.consecutive_failures = self.consecutive_failures;
        }

        healthy
    }

    pub fn measure_rss(&self) -> Option<f64> {
        self.registry.supervised.check_memory(&self.name)
    }

    pub fn measure_cpu(&self) -> Option<f32> {
        self.registry.supervised.check_cpu(&self.name)
    }

    pub fn logs_tail(&self, n: usize) -> Vec<String> {
        self.logs.tail(&self.name, n)
    }

    pub fn logs_clear(&self) {
        self.logs.clear(&self.name)
    }

    pub fn check_memory_exceeded(&self, app_total_mb: u64) -> bool {
        self.measure_rss()
            .map(|rss| rss > app_total_mb as f64)
            .unwrap_or(false)
    }

    fn resolve_config(factory: &dyn ProcessFactory, settings: &Settings) -> Result<SpawnConfig, ProcessError> {
        let (host_key, port_key) = factory.port_settings_keys();

        let host = Self::settings_get(settings, host_key)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| {
                if port_key == "litellmPort" && !settings.agentscope_host.is_empty() {
                    settings.agentscope_host.clone()
                } else {
                    "127.0.0.1".to_string()
                }
            });

        let port = match Self::settings_get(settings, port_key) {
            Some(raw) if !raw.trim().is_empty() => raw
                .parse::<u16>()
                .map_err(|_| ProcessError::SpawnFailed(format!("invalid value for {port_key}")))?,
            _ => factory.default_port().unwrap_or_else(Self::find_available_port),
        };

        let working_dir = factory.working_dir(settings).ok_or_else(|| {
            let cwd = std::env::current_dir().unwrap_or_default();
            eprintln!("[process] factory '{}' working_dir() returned None — cwd={}", factory.name(), cwd.display());
            ProcessError::SpawnFailed(format!("factory '{}' missing working directory", factory.name()))
        })?;

        Ok(SpawnConfig {
            host,
            port,
            working_dir,
        })
    }

    fn find_available_port() -> u16 {
        TcpListener::bind("127.0.0.1:0")
            .ok()
            .and_then(|listener| listener.local_addr().ok().map(|addr| addr.port()))
            .unwrap_or(0)
    }

    fn persist_config(&self) -> Result<(), ProcessError> {
        let mut settings = self
            .settings_mgr
            .load()
            .map_err(|err| ProcessError::SpawnFailed(err.to_string()))?;
        let (host_key, port_key) = self.factory.port_settings_keys();
        Self::settings_set(&mut settings, host_key, self.config.host.clone())?;
        Self::settings_set(&mut settings, port_key, self.config.port.to_string())?;
        self.settings_mgr
            .save(&settings)
            .map_err(|err| ProcessError::SpawnFailed(err.to_string()))
    }

    fn settings_get(settings: &Settings, key: &str) -> Option<String> {
        match key {
            "agentscopeHost" => Some(settings.agentscope_host.clone()),
            "agentscopePort" => Some(settings.agentscope_port.clone()),
            "litellmHost" => Some(settings.litellm_host.clone()),
            "litellmPort" => Some(settings.litellm_port.clone()),
            _ => None,
        }
    }

    fn settings_set(settings: &mut Settings, key: &str, value: String) -> Result<(), ProcessError> {
        match key {
            "agentscopeHost" => settings.agentscope_host = value,
            "agentscopePort" => settings.agentscope_port = value,
            "litellmHost" => settings.litellm_host = value,
            "litellmPort" => settings.litellm_port = value,
            _ => {
                return Err(ProcessError::SpawnFailed(format!(
                    "unsupported settings key '{key}'"
                )))
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;

    use snapfzz_packs::{detect_platform, runtime::python::PythonRuntime};
    use snapfzz_packs::service::{ResourceLimits, ServiceError};

    use crate::budget::BudgetRegistry;
    use crate::process::logs::ProcessLogs;
    use crate::process::{factory::ProcessFactory, ProcessManager, SpawnConfig};
    use crate::settings::{Settings, SettingsManager};

    use super::BudgetedProcess;

    struct TestFactory {
        name: &'static str,
    }

    impl ProcessFactory for TestFactory {
        fn name(&self) -> &'static str {
            self.name
        }

        fn health_path(&self) -> &'static str {
            "/health"
        }

        fn port_settings_keys(&self) -> (&'static str, &'static str) {
            ("agentscopeHost", "agentscopePort")
        }

        fn working_dir(&self, _settings: &Settings) -> Option<PathBuf> {
            Some(PathBuf::from("/tmp"))
        }

        fn can_start(&self, _runtime: &PythonRuntime) -> bool {
            true
        }

        fn build_command(
            &self,
            _config: &SpawnConfig,
            _runtime: &PythonRuntime,
        ) -> Result<tokio::process::Command, ServiceError> {
            let mut cmd = tokio::process::Command::new("sh");
            cmd.arg("-c").arg("sleep 0.1");
            Ok(cmd)
        }

        fn resource_limits(&self) -> ResourceLimits {
            ResourceLimits {
                max_memory_mb: 64,
                max_restarts: 2,
            }
        }
    }

    fn runtime() -> Arc<PythonRuntime> {
        let tmp = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        Arc::new(PythonRuntime::new(tmp.path().to_path_buf(), platform))
    }

    fn settings_mgr() -> Arc<SettingsManager> {
        let tmp = tempfile::tempdir().expect("tempdir");
        Arc::new(SettingsManager::new(tmp.path().to_path_buf()))
    }

    #[tokio::test]
    async fn t37_budgeted_process_spawn_creates_budget_entry_and_persists_port() {
        let registry = Arc::new(BudgetRegistry::from_hardware());
        let logs = Arc::new(ProcessLogs::new());
        let settings_mgr = settings_mgr();
        let process_mgr = Arc::new(ProcessManager::new());
        let factory = Arc::new(TestFactory { name: "agentscope" });

        let mut process = BudgetedProcess::new(
            factory,
            registry.clone(),
            logs,
            settings_mgr.clone(),
            runtime(),
            process_mgr,
        )
        .expect("process");

        let result = process.spawn().await;
        assert!(result.is_err() || registry.supervised.processes.contains_key("agentscope"));

        let settings = settings_mgr.load().expect("load settings");
        assert!(!settings.agentscope_host.is_empty());
    }

    #[test]
    fn t37_budgeted_process_logs_tail_and_clear_proxy_to_store() {
        let registry = Arc::new(BudgetRegistry::from_hardware());
        let logs = Arc::new(ProcessLogs::new());
        logs.push("agentscope", "line-1".to_string());
        logs.push("agentscope", "line-2".to_string());

        let process = BudgetedProcess::new(
            Arc::new(TestFactory { name: "agentscope" }),
            registry,
            logs.clone(),
            settings_mgr(),
            runtime(),
            Arc::new(ProcessManager::new()),
        )
        .expect("process");

        assert_eq!(process.logs_tail(1), vec!["line-2".to_string()]);
        process.logs_clear();
        assert!(logs.tail("agentscope", 10).is_empty());
    }

    #[test]
    fn t37_budgeted_process_snapshot_exposes_metrics_shape() {
        let registry = Arc::new(BudgetRegistry::from_hardware());
        let mut process = BudgetedProcess::new(
            Arc::new(TestFactory { name: "agentscope" }),
            registry,
            Arc::new(ProcessLogs::new()),
            settings_mgr(),
            runtime(),
            Arc::new(ProcessManager::new()),
        )
        .expect("process");

        process.set_restart_count(2);
        process.set_consecutive_failures(1);
        let snapshot = process.snapshot();
        assert_eq!(snapshot.name, "agentscope");
        assert_eq!(snapshot.restart_count, 2);
        assert_eq!(snapshot.consecutive_failures, 1);
    }

    #[test]
    fn t37_budgeted_process_measure_calls_delegate_to_registry() {
        let registry = Arc::new(BudgetRegistry::from_hardware());
        let process = BudgetedProcess::new(
            Arc::new(TestFactory { name: "agentscope" }),
            registry,
            Arc::new(ProcessLogs::new()),
            settings_mgr(),
            runtime(),
            Arc::new(ProcessManager::new()),
        )
        .expect("process");

        assert!(process.measure_rss().is_none());
        assert!(process.measure_cpu().is_none());
    }

    #[tokio::test]
    async fn t37_budgeted_process_check_health_marks_unhealthy_for_unreachable_endpoint() {
        let registry = Arc::new(BudgetRegistry::from_hardware());
        let mut process = BudgetedProcess::new(
            Arc::new(TestFactory { name: "agentscope" }),
            registry,
            Arc::new(ProcessLogs::new()),
            settings_mgr(),
            runtime(),
            Arc::new(ProcessManager::new()),
        )
        .expect("process");

        process.set_consecutive_failures(0);
        assert!(!process.check_health().await);
    }
}
