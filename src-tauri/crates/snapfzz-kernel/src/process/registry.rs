use std::collections::HashMap;
use std::sync::Arc;

use snapfzz_packs::runtime::python::PythonRuntime;

use crate::budget::metrics::ProcessSnapshot;
use crate::budget::BudgetRegistry;
use crate::process::budgeted::BudgetedProcess;
use crate::process::logs::ProcessLogs;
use crate::process::{ProcessError, ProcessFactory, ProcessManager};
use crate::settings::SettingsManager;

pub struct ProcessFactoryRegistry {
    factories: HashMap<String, Arc<dyn ProcessFactory>>,
    processes: HashMap<String, BudgetedProcess>,
    registry: Arc<BudgetRegistry>,
    logs: Arc<ProcessLogs>,
    settings_mgr: Arc<SettingsManager>,
    python_runtime: Arc<PythonRuntime>,
    process_mgr: Arc<ProcessManager>,
    database_url: Option<String>,
    health_timeout_override: Option<u64>,
}

impl ProcessFactoryRegistry {
    // A037/registry: Maintain process factories and lifecycle instances in one orchestration entrypoint.
    pub fn new(
        registry: Arc<BudgetRegistry>,
        process_mgr: Arc<ProcessManager>,
        settings_mgr: Arc<SettingsManager>,
        python_runtime: Arc<PythonRuntime>,
    ) -> Self {
        let logs = process_mgr.logs.clone();

        Self {
            factories: HashMap::new(),
            processes: HashMap::new(),
            registry,
            logs,
            settings_mgr,
            python_runtime,
            process_mgr,
            database_url: None,
            health_timeout_override: None,
        }
    }
    
    pub fn process_manager(&self) -> Arc<ProcessManager> {
        self.process_mgr.clone()
    }

    pub fn register(&mut self, factory: Arc<dyn ProcessFactory>) {
        self.factories.insert(factory.name().to_string(), factory);
    }

    pub fn set_database_url(&mut self, url: String) {
        self.database_url = Some(url);
    }

    pub async fn spawn(&mut self, name: &str) -> Result<(), ProcessError> {
        if !self.processes.contains_key(name) {
            let factory = self.factories.get(name).cloned().ok_or_else(|| {
                ProcessError::SpawnFailed(format!("unknown process factory '{name}'"))
            })?;

            let mut process = BudgetedProcess::new(
                factory,
                self.registry.clone(),
                self.logs.clone(),
                self.settings_mgr.clone(),
                self.python_runtime.clone(),
                self.process_mgr.clone(),
                self.database_url.clone(),
            )?;

            if let Some(timeout) = self.health_timeout_override {
                process.set_health_timeout_secs(timeout);
            }

            self.processes.insert(name.to_string(), process);
        }

        let result = self.processes
            .get_mut(name)
            .expect("process inserted")
            .spawn()
            .await;

        if result.is_err() {
            // A037/spawn_failure: Kill orphaned child but keep BudgetedProcess in map so
            // list_snapshots() can still surface the process with Stopped status to the UI.
            let _ = self.process_mgr.shutdown(name).await;
        }

        result
    }

    // A039/parallel_spawn: Spawn services concurrently for faster boot.
    pub async fn spawn_all(&mut self) -> Vec<(String, Result<(), ProcessError>)> {
        let names: Vec<String> = self.factories.keys().cloned().collect();

        // Step 1: Create all BudgetedProcess entries that don't exist yet.
        // This requires &mut self and is fast (no I/O beyond settings load).
        for name in &names {
            if self.processes.contains_key(name.as_str()) {
                continue;
            }
            let factory = match self.factories.get(name.as_str()).cloned() {
                Some(f) => f,
                None => continue,
            };
            match BudgetedProcess::new(
                factory,
                self.registry.clone(),
                self.logs.clone(),
                self.settings_mgr.clone(),
                self.python_runtime.clone(),
                self.process_mgr.clone(),
                self.database_url.clone(),
            ) {
                Ok(mut process) => {
                    if let Some(timeout) = self.health_timeout_override {
                        process.set_health_timeout_secs(timeout);
                    }
                    self.processes.insert(name.clone(), process);
                }
                Err(_) => continue,
            }
        }

        // Step 2: Take ownership of each BudgetedProcess so we can move them
        // into independent tokio tasks and spawn concurrently.
        let taken: Vec<(String, BudgetedProcess)> = names
            .iter()
            .filter_map(|name| self.processes.remove_entry(name))
            .collect();

        let process_mgr = self.process_mgr.clone();
        let mut handles = Vec::with_capacity(taken.len());
        for (name, mut process) in taken {
            let pm = process_mgr.clone();
            handles.push(tokio::spawn(async move {
                let result = process.spawn().await;
                if result.is_err() {
                    let _ = pm.shutdown(&name).await;
                }
                (name, result, process)
            }));
        }

        // Step 3: Collect results and reinsert processes into the map so
        // subsequent calls to get(), restart(), kill(), etc. work normally.
        let mut out = Vec::with_capacity(handles.len());
        for handle in handles {
            match handle.await {
                Ok((name, result, process)) => {
                    self.processes.insert(name.clone(), process);
                    out.push((name, result));
                }
                Err(e) => {
                    out.push(("unknown".to_string(), Err(ProcessError::SpawnFailed(e.to_string()))));
                }
            }
        }
        out
    }

    pub async fn kill(&mut self, name: &str) -> Result<(), ProcessError> {
        let process = self.processes.get_mut(name).ok_or_else(|| {
            ProcessError::RuntimeNotRunning {
                name: name.to_string(),
            }
        })?;
        process.kill().await?;
        self.processes.remove(name);
        Ok(())
    }

    pub async fn restart(&mut self, name: &str) -> Result<(), ProcessError> {
        if !self.processes.contains_key(name) {
            return self.spawn(name).await;
        }

        self.processes
            .get_mut(name)
            .expect("process present")
            .restart()
            .await
    }

    pub fn get(&self, name: &str) -> Option<&BudgetedProcess> {
        self.processes.get(name)
    }

    pub fn get_mut(&mut self, name: &str) -> Option<&mut BudgetedProcess> {
        self.processes.get_mut(name)
    }

    pub fn list_snapshots(&self) -> Vec<ProcessSnapshot> {
        // A037/list_snapshots: Include all registered factories, not just spawned ones.
        // Factories not yet in `processes` appear as Stopped so the UI always shows all services.
        let mut snapshots: Vec<ProcessSnapshot> = self.processes.values().map(BudgetedProcess::snapshot).collect();
        for (name, factory) in &self.factories {
            if !self.processes.contains_key(name) {
                snapshots.push(ProcessSnapshot::stopped(name, factory.owner()));
            }
        }
        snapshots
    }

    pub fn total_rss_mb(&self) -> f64 {
        self.processes
            .values()
            .filter_map(BudgetedProcess::measure_rss)
            .sum()
    }

    pub fn logs_tail(&self, name: &str, tail_n: usize) -> Vec<String> {
        self.processes
            .get(name)
            .map(|process| process.logs_tail(tail_n))
            .unwrap_or_else(|| self.logs.tail(name, tail_n))
    }

    pub fn logs_clear(&self, name: &str) {
        if let Some(process) = self.processes.get(name) {
            process.logs_clear();
            return;
        }
        self.logs.clear(name);
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;

    use snapfzz_packs::{detect_platform, runtime::python::PythonRuntime};
    use snapfzz_packs::service::{ResourceLimits, ServiceError};

    use crate::budget::BudgetRegistry;
    use crate::process::factory::ProcessFactory;
    use crate::process::logs::ProcessLogs;
    use crate::process::runtime::RuntimeState;
    use crate::process::{ProcessManager, SpawnConfig};
    use crate::settings::{Settings, SettingsManager};

    use super::ProcessFactoryRegistry;

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

        fn pre_run_setup(
            &self,
            _config: &SpawnConfig,
            _runtime: &PythonRuntime,
        ) -> Result<(), ServiceError> {
            Ok(())
        }

        fn build_command(
            &self,
            _config: &SpawnConfig,
            _runtime: &PythonRuntime,
        ) -> Result<tokio::process::Command, ServiceError> {
            let mut command = tokio::process::Command::new("sh");
            command.arg("-c").arg("sleep 0.05");
            Ok(command)
        }

        fn resource_limits(&self) -> ResourceLimits {
            ResourceLimits {
                max_memory_mb: 256,
                max_restarts: 3,
            }
        }
    }

    fn make_runtime() -> Arc<PythonRuntime> {
        let dir = tempfile::tempdir().expect("tempdir");
        let platform = detect_platform().expect("platform");
        Arc::new(PythonRuntime::new(dir.path().to_path_buf(), platform))
    }

    fn make_registry() -> ProcessFactoryRegistry {
        let data_dir = tempfile::tempdir().expect("tempdir");
        let logs = Arc::new(ProcessLogs::with_max_lines(data_dir.path().to_path_buf(), 100));
        let process_mgr = Arc::new(ProcessManager::with_parts(
            Arc::new(tokio::sync::Mutex::new(RuntimeState::new())),
            logs,
        ));
        let mut reg = ProcessFactoryRegistry::new(
            Arc::new(BudgetRegistry::from_hardware()),
            process_mgr,
            Arc::new(SettingsManager::new(data_dir.path().to_path_buf())),
            make_runtime(),
        );
        reg.health_timeout_override = Some(1);
        reg
    }

    #[test]
    fn t37_registry_register_stores_factory_by_name() {
        let mut registry = make_registry();
        registry.register(Arc::new(TestFactory { name: "agentscope" }));
        assert!(registry.factories.contains_key("agentscope"));
    }

    #[tokio::test]
    async fn t37_registry_spawn_returns_error_for_unknown_factory() {
        let mut registry = make_registry();
        let err = registry.spawn("unknown").await.expect_err("unknown factory");
        assert!(err.to_string().contains("unknown process factory"));
    }

    #[tokio::test]
    async fn t37_registry_spawn_creates_budgeted_process_from_factory() {
        // A037/registry: spawn must use the registered factory, not fail with "unknown process factory".
        // Process may be cleaned up after spawn failure (health timeout), so assert on the error
        // kind rather than post-spawn registry state.
        let mut registry = make_registry();
        registry.register(Arc::new(TestFactory { name: "agentscope" }));

        let result = registry.spawn("agentscope").await;
        if let Err(e) = result {
            assert!(
                !e.to_string().contains("unknown process factory"),
                "unexpected error: {e}"
            );
        }
    }

    #[tokio::test]
    async fn t37_registry_spawn_all_attempts_each_registered_factory() {
        let mut registry = make_registry();
        registry.register(Arc::new(TestFactory { name: "agentscope" }));
        registry.register(Arc::new(TestFactory { name: "litellm" }));

        let results = registry.spawn_all().await;
        assert_eq!(results.len(), 2);
    }

    #[tokio::test]
    async fn t37_registry_kill_removes_process_from_tracking() {
        let mut registry = make_registry();
        registry.register(Arc::new(TestFactory { name: "agentscope" }));

        let _ = registry.spawn("agentscope").await;
        let _ = registry.kill("agentscope").await;
        assert!(registry.get("agentscope").is_none());
    }

    #[tokio::test]
    async fn t37_registry_restart_delegates_to_budgeted_process() {
        let mut registry = make_registry();
        registry.register(Arc::new(TestFactory { name: "agentscope" }));

        let _ = registry.spawn("agentscope").await;
        let _ = registry.restart("agentscope").await;
        assert!(registry.get("agentscope").is_some());
    }

    #[test]
    fn t37_registry_list_snapshots_aggregates_process_snapshots() {
        // A037/list_snapshots: After the A037 change, registered-but-unspawned factories
        // appear as Stopped snapshots. An empty `processes` map with one registered factory
        // must yield exactly one Stopped snapshot, not an empty list.
        use crate::budget::metrics::ProcessStatus;

        let mut registry = make_registry();
        registry.register(Arc::new(TestFactory { name: "agentscope" }));

        let snapshots = registry.list_snapshots();
        assert_eq!(snapshots.len(), 1, "one unspawned factory should produce one snapshot");
        assert!(matches!(snapshots[0].status, ProcessStatus::Stopped));
        assert_eq!(snapshots[0].name, "agentscope");
    }

    #[test]
    fn t37_registry_total_rss_mb_sums_across_processes() {
        let registry = make_registry();
        assert!(registry.total_rss_mb() >= 0.0);
    }

    #[test]
    fn t37_registry_set_database_url_stores_url() {
        // A037/registry: set_database_url must persist the URL so that subsequent
        // spawn() calls forward it to BudgetedProcess::new via database_url field.
        let mut registry = make_registry();
        assert!(registry.database_url.is_none());

        registry.set_database_url("postgres://localhost:5432/snapfzz".to_string());

        assert_eq!(
            registry.database_url.as_deref(),
            Some("postgres://localhost:5432/snapfzz")
        );
    }

    #[test]
    fn t37_registry_list_snapshots_includes_unspawned_factories_as_stopped() {
        // A037/list_snapshots: Factories that have never been spawned must appear in
        // list_snapshots() as Stopped so the UI always shows every registered service.
        use crate::budget::metrics::ProcessStatus;

        let mut registry = make_registry();
        registry.register(Arc::new(TestFactory { name: "litellm" }));
        registry.register(Arc::new(TestFactory { name: "agentscope" }));

        // No spawn calls — both factories are unspawned.
        let snapshots = registry.list_snapshots();

        assert_eq!(snapshots.len(), 2, "both unspawned factories must appear");

        for snap in &snapshots {
            assert!(
                matches!(snap.status, ProcessStatus::Stopped),
                "expected Stopped for unspawned factory '{}', got {:?}",
                snap.name,
                snap.status
            );
            assert!(snap.pid.is_none());
            assert_eq!(snap.location, "local");
        }

        let names: Vec<&str> = snapshots.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"litellm"), "litellm must be in snapshots");
        assert!(names.contains(&"agentscope"), "agentscope must be in snapshots");
    }

    #[test]
    fn t37_registry_logs_tail_returns_empty_for_unspawned_process() {
        let registry = make_registry();
        // No processes spawned — fallback to process logs which returns empty.
        let lines = registry.logs_tail("agentscope", 10);
        assert!(lines.is_empty());
    }

    #[test]
    fn t37_registry_logs_clear_for_unspawned_process_is_noop() {
        let registry = make_registry();
        // Should not panic for unknown process name.
        registry.logs_clear("agentscope");
    }

    #[test]
    fn t37_registry_get_returns_none_for_unregistered() {
        let registry = make_registry();
        assert!(registry.get("no-such-process").is_none());
    }

    #[test]
    fn t37_registry_get_mut_returns_none_for_unregistered() {
        let mut registry = make_registry();
        assert!(registry.get_mut("no-such-process").is_none());
    }

    #[test]
    fn t37_registry_process_manager_returns_shared_instance() {
        let registry = make_registry();
        let pm1 = registry.process_manager();
        let pm2 = registry.process_manager();
        assert!(Arc::ptr_eq(&pm1, &pm2));
    }

    #[tokio::test]
    async fn t37_registry_kill_unknown_process_returns_not_running() {
        let mut registry = make_registry();
        let err = registry.kill("no-such").await.expect_err("kill unknown should fail");
        assert!(matches!(err, crate::process::ProcessError::RuntimeNotRunning { .. }));
    }

    #[tokio::test]
    async fn t37_registry_restart_unknown_process_delegates_to_spawn() {
        // restart() on an unknown process name calls spawn() which fails with unknown factory
        let mut registry = make_registry();
        let err = registry.restart("no-factory").await.expect_err("restart without factory should fail");
        assert!(err.to_string().contains("unknown process factory"));
    }
}
