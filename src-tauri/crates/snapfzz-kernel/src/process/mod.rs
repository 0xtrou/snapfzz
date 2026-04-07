use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;

use crate::budget::metrics::ProcessStatus;
use crate::budget::{
    supervised::{ProcessBudget, ProcessLocation},
    BudgetRegistry,
};
use crate::process::health::{apply_health_check, wait_until_healthy};
use crate::process::logs::ProcessLogs;
use crate::process::runtime::{piped_stdio, ChildState, RuntimeState};
use crate::process::supervisor::{apply_memory_limit, restart_runtime, wait_for_shutdown};

pub mod health;
pub mod logs;
pub mod runtime;
pub mod supervisor;

#[derive(Debug)]
pub enum ProcessError {
    Io(std::io::Error),
    RuntimeNotRunning { name: String },
    HealthTimeout { name: String, timeout_ms: u64 },
    SpawnFailed(String),
}

impl std::fmt::Display for ProcessError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "{error}"),
            Self::RuntimeNotRunning { name } => write!(f, "process '{name}' is not running"),
            Self::HealthTimeout { name, timeout_ms } => {
                write!(f, "process '{name}' did not become healthy within {timeout_ms}ms")
            }
            Self::SpawnFailed(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for ProcessError {}

impl From<std::io::Error> for ProcessError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

#[derive(Debug, Clone)]
pub struct SpawnConfig {
    pub host: String,
    pub port: u16,
    pub working_dir: PathBuf,
}

pub struct ProcessManager {
    pub state: Arc<Mutex<RuntimeState>>,
    pub logs: Arc<ProcessLogs>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(RuntimeState::new())),
            logs: Arc::new(ProcessLogs::new()),
        }
    }

    pub fn with_parts(state: Arc<Mutex<RuntimeState>>, logs: Arc<ProcessLogs>) -> Self {
        Self { state, logs }
    }

    pub async fn spawn(
        &self,
        name: &str,
        config: &SpawnConfig,
        registry: &BudgetRegistry,
    ) -> Result<u32, ProcessError> {
        if self.state.lock().await.children.contains_key(name) {
            return Err(ProcessError::SpawnFailed(format!(
                "process '{name}' is already running"
            )));
        }

        cleanup_stale_pid(self.logs.data_dir(), name);

        let mut command = tokio::process::Command::new(runtime_command_binary());
        command
            .args(["run", "python", "app.py"])
            .current_dir(&config.working_dir)
            .env("SNAPFZZ_HOST", &config.host)
            .env("SNAPFZZ_PORT", config.port.to_string())
            .stdout(piped_stdio())
            .stderr(piped_stdio())
            .kill_on_drop(true);

        #[cfg(unix)]
        {
            command.process_group(0);
        }

        let mut child = command
            .spawn()
            .map_err(|error| ProcessError::SpawnFailed(error.to_string()))?;

        let child_pid = child.id().unwrap_or(0);
        write_pid_file(self.logs.data_dir(), name, child_pid);

        if let Some(stdout) = child.stdout.take() {
            let logs = self.logs.clone();
            let process_name = name.to_string();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    logs.push(&process_name, line);
                }
            });
        }

        if let Some(stderr) = child.stderr.take() {
            let logs = self.logs.clone();
            let process_name = name.to_string();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    logs.push(&process_name, format!("[stderr] {line}"));
                }
            });
        }

        {
            let mut guard = self.state.lock().await;
            guard
                .children
                .insert(name.to_string(), ChildState { child, pid: child_pid });
        }

        let prev = registry.supervised.processes.get(name);
        let prev_restart_count = prev.as_ref().map(|proc| proc.restart_count).unwrap_or(0);
        let is_restart = prev.is_some();
        let (preset_agentscope_max_mb, preset_max_restarts) = {
            let preset = registry.preset.read().unwrap();
            (
                preset.memory.agentscope_max_mb,
                preset.reliability.max_restarts,
            )
        };
        let prev_max_memory = prev
            .as_ref()
            .map(|proc| proc.max_memory_mb)
            .unwrap_or(preset_agentscope_max_mb);
        drop(prev);

        registry.register_process(
            name,
            ProcessBudget {
                pid: Some(child_pid),
                max_memory_mb: prev_max_memory,
                health_url: format!("http://{}:{}/health", config.host, config.port),
                health_interval_ms: 2000,
                max_health_failures: 3,
                max_restarts: preset_max_restarts,
                location: ProcessLocation::Local,
                consecutive_failures: 0,
                restart_count: if is_restart { prev_restart_count + 1 } else { 0 },
                status: ProcessStatus::Starting,
                started_at: Some(Instant::now()),
                owner: "system".to_string(),
            },
        );

        wait_until_healthy(registry, name, 120, Duration::from_secs(1)).await?;
        Ok(child_pid)
    }

    pub async fn shutdown(&self, name: &str) -> Result<(), ProcessError> {
        let child_state = {
            let mut guard = self.state.lock().await;
            guard.children.remove(name)
        };

        let Some(mut child_state) = child_state else {
            remove_pid_file(self.logs.data_dir(), name);
            return Ok(());
        };

        if child_state.pid != 0 {
            let is_alive = child_state.child.try_wait().ok().flatten().is_none();
            if is_alive {
                #[cfg(unix)]
                unsafe {
                    libc::kill(-(child_state.pid as i32), libc::SIGKILL);
                    libc::kill(child_state.pid as i32, libc::SIGKILL);
                }
                #[cfg(not(unix))]
                {
                    let _ = child_state.child.start_kill();
                }
            }
        }

        wait_for_shutdown(&mut child_state.child).await;
        remove_pid_file(self.logs.data_dir(), name);
        Ok(())
    }

    pub async fn restart(
        &self,
        name: &str,
        config: &SpawnConfig,
        registry: &BudgetRegistry,
    ) -> Result<(), ProcessError> {
        restart_runtime(self, name, config, registry).await
    }

    pub fn kill(&self, name: &str) -> Result<(), ProcessError> {
        let pid = self
            .state
            .blocking_lock()
            .children
            .get(name)
            .map(|state| state.pid)
            .ok_or_else(|| ProcessError::RuntimeNotRunning {
                name: name.to_string(),
            })?;

        if pid == 0 {
            return Err(ProcessError::RuntimeNotRunning {
                name: name.to_string(),
            });
        }

        #[cfg(unix)]
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }

        #[cfg(not(unix))]
        {
            let mut system = sysinfo::System::new();
            system.refresh_processes(
                sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]),
                true,
            );
            if let Some(process) = system.process(sysinfo::Pid::from_u32(pid)) {
                process.kill();
            }
        }

        remove_pid_file(self.logs.data_dir(), name);
        Ok(())
    }

    pub async fn sample_health_failures(
        &self,
        registry: &BudgetRegistry,
        name: &str,
    ) -> Option<u32> {
        apply_health_check(registry, name).await
    }

    pub fn enforce_memory_limit(&self, registry: &BudgetRegistry, name: &str) -> bool {
        apply_memory_limit(registry, name)
    }
}

impl Default for ProcessManager {
    fn default() -> Self {
        Self::new()
    }
}

fn runtime_command_binary() -> String {
    std::env::var("SNAPFZZ_RUNTIME_COMMAND").unwrap_or_else(|_| "uv".to_string())
}

fn pid_file_path(data_dir: &std::path::Path, name: &str) -> PathBuf {
    data_dir.join("runtime").join(name).join(format!("{name}.pid"))
}

fn write_pid_file(data_dir: &std::path::Path, name: &str, pid: u32) {
    let path = pid_file_path(data_dir, name);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, pid.to_string());
}

fn remove_pid_file(data_dir: &std::path::Path, name: &str) {
    let _ = std::fs::remove_file(pid_file_path(data_dir, name));
}

fn cleanup_stale_pid(data_dir: &std::path::Path, name: &str) {
    let path = pid_file_path(data_dir, name);
    let content = match std::fs::read_to_string(&path) {
        Ok(content) => content,
        Err(_) => return,
    };
    let pid: u32 = match content.trim().parse() {
        Ok(0) => {
            let _ = std::fs::remove_file(&path);
            return;
        }
        Ok(pid) => pid,
        Err(_) => {
            let _ = std::fs::remove_file(&path);
            return;
        }
    };

    let mut system = sysinfo::System::new();
    system.refresh_processes(
        sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]),
        true,
    );
    if system.process(sysinfo::Pid::from_u32(pid)).is_some() {
        #[cfg(unix)]
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
            libc::kill(pid as i32, libc::SIGKILL);
        }
        #[cfg(not(unix))]
        if let Some(process) = system.process(sysinfo::Pid::from_u32(pid)) {
            process.kill();
        }
    }
    let _ = std::fs::remove_file(path);
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use std::sync::{Arc, Mutex as StdMutex, OnceLock};
    use std::time::Instant;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::sync::Mutex;

    use crate::budget::{
        metrics::ProcessStatus,
        preset::PresetName,
        supervised::{ProcessBudget, ProcessLocation},
        BudgetRegistry,
    };
    use crate::process::logs::ProcessLogs;
    use crate::process::runtime::RuntimeState;

    use super::{
        cleanup_stale_pid, pid_file_path, remove_pid_file, write_pid_file, ProcessError, ProcessManager,
        SpawnConfig,
    };

    fn make_registry() -> BudgetRegistry {
        BudgetRegistry::with_preset_name(PresetName::Performance)
    }

    fn register_process_for_manager(registry: &BudgetRegistry, name: &str) {
        registry.register_process(
            name,
            ProcessBudget {
                pid: Some(std::process::id()),
                max_memory_mb: u64::MAX,
                health_url: "http://127.0.0.1:1/health".to_string(),
                health_interval_ms: 100,
                max_health_failures: 3,
                max_restarts: 3,
                location: ProcessLocation::Local,
                consecutive_failures: 0,
                restart_count: 0,
                status: ProcessStatus::Starting,
                started_at: Some(Instant::now()),
                owner: "system".to_string(),
            },
        );
    }

    fn env_lock() -> &'static StdMutex<()> {
        static LOCK: OnceLock<StdMutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| StdMutex::new(()))
    }

    fn create_fake_runtime_command_script(root: &Path) -> PathBuf {
        let script = root.join("fake-runtime.sh");
        let mut file = std::fs::File::create(&script).expect("create fake runtime script");
        writeln!(file, "#!/bin/sh").expect("write shebang");
        writeln!(file, "sleep 30").expect("write sleep command");

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755))
                .expect("set script executable");
        }

        script
    }

    async fn spawn_health_server() -> u16 {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind health listener");
        let port = listener.local_addr().expect("listener addr").port();

        tokio::spawn(async move {
            for _ in 0..8 {
                let Ok((mut socket, _)) = listener.accept().await else {
                    break;
                };
                let mut request_buf = [0_u8; 1024];
                let _ = socket.read(&mut request_buf).await;
                let _ = socket
                    .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK")
                    .await;
                let _ = socket.shutdown().await;
            }
        });

        port
    }

    #[test]
    fn a014_process_manager_new_initializes_empty_runtime() {
        let manager = ProcessManager::new();
        let state = manager.state.blocking_lock();

        assert!(state.children.is_empty());
        assert!(manager.logs.data_dir().ends_with(".snapfzz"));
    }

    #[test]
    fn a014_process_manager_with_parts_uses_injected_state_and_logs() {
        let temp = tempfile::tempdir().expect("tempdir");
        let state = Arc::new(Mutex::new(RuntimeState {
            children: HashMap::new(),
        }));
        let logs = Arc::new(ProcessLogs::with_max_lines(temp.path().to_path_buf(), 10));

        let manager = ProcessManager::with_parts(state.clone(), logs.clone());
        assert!(Arc::ptr_eq(&manager.state, &state));
        assert!(Arc::ptr_eq(&manager.logs, &logs));
    }

    #[test]
    fn a014_process_spawn_config_fields_preserve_values() {
        let cfg = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: 8080,
            working_dir: std::path::PathBuf::from("/tmp/work"),
        };

        assert_eq!(cfg.host, "127.0.0.1");
        assert_eq!(cfg.port, 8080);
        assert_eq!(cfg.working_dir, std::path::PathBuf::from("/tmp/work"));
    }

    #[tokio::test]
    async fn a014_process_shutdown_missing_named_process_returns_ok() {
        let manager = ProcessManager::new();
        manager
            .shutdown("unknown")
            .await
            .expect("shutdown should no-op for missing process");
    }

    #[tokio::test]
    async fn a014_process_shutdown_without_child_state_returns_ok() {
        let temp = tempfile::tempdir().expect("tempdir");
        let manager = ProcessManager::with_parts(
            Arc::new(Mutex::new(RuntimeState {
                children: HashMap::new(),
            })),
            Arc::new(ProcessLogs::with_max_lines(temp.path().to_path_buf(), 10)),
        );

        manager
            .shutdown("agentscope")
            .await
            .expect("shutdown without child should succeed");

        let guard = manager.state.lock().await;
        assert!(guard.children.is_empty());
    }

    #[test]
    fn a014_process_kill_unknown_process_returns_error() {
        let manager = ProcessManager::new();
        let error = manager
            .kill("unknown")
            .expect_err("kill should reject unknown process name");

        match error {
            ProcessError::RuntimeNotRunning { name } => assert_eq!(name, "unknown"),
            other => panic!("unexpected error variant: {other:?}"),
        }
    }

    #[test]
    fn a014_process_kill_without_runtime_returns_not_running() {
        let manager = ProcessManager::new();
        let error = manager
            .kill("agentscope")
            .expect_err("kill should fail when runtime is not running");

        match error {
            ProcessError::RuntimeNotRunning { name } => assert_eq!(name, "agentscope"),
            other => panic!("unexpected error variant: {other:?}"),
        }
    }

    #[test]
    fn a014_process_pid_file_helpers_round_trip() {
        let temp = tempfile::tempdir().expect("tempdir");

        write_pid_file(temp.path(), "agentscope", 4321);
        let path = pid_file_path(temp.path(), "agentscope");
        let content = std::fs::read_to_string(&path).expect("pid file should exist");
        assert_eq!(content, "4321");

        remove_pid_file(temp.path(), "agentscope");
        assert!(!path.exists());
    }

    #[test]
    fn a014_process_cleanup_stale_pid_removes_invalid_file() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = pid_file_path(temp.path(), "agentscope");
        std::fs::create_dir_all(path.parent().expect("pid parent")).expect("create runtime dir");
        std::fs::write(&path, "not-a-number").expect("write invalid pid");

        cleanup_stale_pid(temp.path(), "agentscope");

        assert!(!path.exists());
    }

    #[test]
    fn a014_process_cleanup_stale_pid_ignores_missing_file() {
        let temp = tempfile::tempdir().expect("tempdir");
        cleanup_stale_pid(temp.path(), "agentscope");

        assert!(!pid_file_path(temp.path(), "agentscope").exists());
    }

    #[tokio::test]
    async fn a014_process_helpers_delegate_to_budget_components() {
        let temp = tempfile::tempdir().expect("tempdir");
        let manager = ProcessManager::with_parts(
            Arc::new(Mutex::new(RuntimeState::new())),
            Arc::new(ProcessLogs::with_max_lines(temp.path().to_path_buf(), 10)),
        );
        let registry = make_registry();
        register_process_for_manager(&registry, "agentscope");

        let failures = manager
            .sample_health_failures(&registry, "agentscope")
            .await
            .expect("health failure count expected");
        assert_eq!(failures, 1);

        assert!(!manager.enforce_memory_limit(&registry, "agentscope"));

        let entry = registry.supervised.processes.get("agentscope").unwrap();
        assert!(matches!(entry.status, ProcessStatus::Unhealthy));
    }

    #[tokio::test]
    async fn a014_process_spawn_supports_multiple_named_processes() {
        let _env_guard = env_lock().lock().expect("env lock");
        let temp = tempfile::tempdir().expect("tempdir");
        let fake_runtime = create_fake_runtime_command_script(temp.path());

        let previous = std::env::var("SNAPFZZ_RUNTIME_COMMAND").ok();
        unsafe {
            std::env::set_var("SNAPFZZ_RUNTIME_COMMAND", &fake_runtime);
        }

        let manager = ProcessManager::with_parts(
            Arc::new(Mutex::new(RuntimeState::new())),
            Arc::new(ProcessLogs::with_max_lines(temp.path().to_path_buf(), 10)),
        );
        let registry = make_registry();

        let alpha_port = spawn_health_server().await;
        let beta_port = spawn_health_server().await;
        let alpha = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: alpha_port,
            working_dir: temp.path().to_path_buf(),
        };
        let beta = SpawnConfig {
            host: "127.0.0.1".to_string(),
            port: beta_port,
            working_dir: temp.path().to_path_buf(),
        };

        let alpha_pid = manager
            .spawn("agentscope", &alpha, &registry)
            .await
            .expect("spawn agentscope process");
        let beta_pid = manager
            .spawn("miniapp", &beta, &registry)
            .await
            .expect("spawn miniapp process");

        assert!(alpha_pid > 0);
        assert!(beta_pid > 0);

        {
            let state = manager.state.lock().await;
            assert_eq!(state.children.len(), 2);
            assert!(state.children.contains_key("agentscope"));
            assert!(state.children.contains_key("miniapp"));
        }

        manager
            .shutdown("agentscope")
            .await
            .expect("shutdown agentscope process");
        manager
            .shutdown("miniapp")
            .await
            .expect("shutdown miniapp process");

        if let Some(previous) = previous {
            unsafe {
                std::env::set_var("SNAPFZZ_RUNTIME_COMMAND", previous);
            }
        } else {
            unsafe {
                std::env::remove_var("SNAPFZZ_RUNTIME_COMMAND");
            }
        }
    }

    #[test]
    fn a014_process_error_display_and_io_conversion_are_wired() {
        let io_error = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
        let wrapped: ProcessError = io_error.into();
        assert!(matches!(wrapped, ProcessError::Io(_)));

        let render = ProcessError::SpawnFailed("spawn failed".to_string()).to_string();
        assert_eq!(render, "spawn failed");
    }
}
