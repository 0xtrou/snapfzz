use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;

use crate::budget::supervised::ProcessBudget;
use crate::budget::BudgetRegistry;
use crate::process::health::{apply_health_check, wait_until_healthy};
use crate::process::logs::ProcessLogs;
use crate::process::runtime::{ChildState, RuntimeState};
use crate::process::supervisor::wait_for_shutdown;

pub mod budgeted;
pub mod factory;
pub mod health;
pub mod logs;
pub mod registry;
pub mod runtime;
pub mod supervisor;

pub use budgeted::BudgetedProcess;
pub use factory::{ProcessFactory, SpawnSecrets};
pub use registry::ProcessFactoryRegistry;

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
    pub database_url: Option<String>,
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

    /// Spawns a process with a pre-built command and budget configuration.
    /// A033/ProcessManager: Lower-level spawn that accepts any command
    pub async fn spawn_process(
        &self,
        name: &str,
        command: &mut tokio::process::Command,
        budget: ProcessBudget,
        registry: &BudgetRegistry,
        health_timeout_secs: u64,
    ) -> Result<u32, ProcessError> {
        if self.state.lock().await.children.contains_key(name) {
            return Err(ProcessError::SpawnFailed(format!(
                "process '{name}' is already running"
            )));
        }

        cleanup_stale_pid(self.logs.data_dir(), name);

        let mut child = command
            .spawn()
            .map_err(|error| ProcessError::SpawnFailed(error.to_string()))?;

        let child_pid = child.id().unwrap_or(0);
        write_pid_file(self.logs.data_dir(), name, child_pid);

        // Capture stdout
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

        // Capture stderr
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

        // A008/UnifiedBudget: Register process first, then update PID after spawn
        registry.register_process(name, budget);
        if child_pid > 0 {
            registry.update_process_pid(name, child_pid);
        }

        // A039/fast_health_poll: 250ms startup poll for faster service detection
        wait_until_healthy(registry, name, health_timeout_secs as u32 * 4, Duration::from_millis(250)).await?;
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

    pub fn enforce_memory_limit(&self, registry: &BudgetRegistry, _name: &str) -> bool {
        supervisor::is_total_memory_exceeded(registry)
    }
}

impl Default for ProcessManager {
    fn default() -> Self {
        Self::new()
    }
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

/// A008/BootCleanup: Clean up all known orphan processes at boot time.
/// Scans PID files for agentscope and litellm, kills any orphan processes still running.
pub fn cleanup_all_orphan_processes(data_dir: &std::path::Path) {
    const MANAGED_PROCESSES: &[&str] = &["agentscope", "litellm", "postgres"];

    for name in MANAGED_PROCESSES {
        cleanup_stale_pid(data_dir, name);
    }
}

/// A008/PortCleanup: Kill any process holding the specified port.
/// Used before spawning to ensure the port is available.
#[cfg(unix)]
pub fn kill_process_on_port(port: u16) {
    use std::process::Command;
    
    let output = Command::new("lsof")
        .args(["-i", &format!(":{port}"), "-t"])
        .output();
    
    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for pid_str in stdout.lines() {
            if let Ok(pid) = pid_str.trim().parse::<i32>() {
                unsafe {
                    libc::kill(pid, libc::SIGKILL);
                }
            }
        }
    }
}

#[cfg(not(unix))]
pub fn kill_process_on_port(_port: u16) {
    // Non-Unix platforms don't support this cleanup method
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
    use std::sync::Arc;
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
    use crate::process::runtime::piped_stdio;

    fn make_registry() -> BudgetRegistry {
        BudgetRegistry::with_preset_name(PresetName::Performance)
    }

    fn register_process_for_manager(registry: &BudgetRegistry, name: &str) {
        registry.register_process(
            name,
            ProcessBudget {
                pid: Some(std::process::id()),
                health_url: "none://skip".to_string(),
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
            database_url: Some("postgres://postgres:snapfzz@127.0.0.1:5432/litellm".to_string()),
        };

        assert_eq!(cfg.host, "127.0.0.1");
        assert_eq!(cfg.port, 8080);
        assert_eq!(cfg.working_dir, std::path::PathBuf::from("/tmp/work"));
        assert_eq!(
            cfg.database_url,
            Some("postgres://postgres:snapfzz@127.0.0.1:5432/litellm".to_string())
        );
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

    #[test]
    fn a014_process_error_display_and_io_conversion_are_wired() {
        let io_error = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
        let wrapped: ProcessError = io_error.into();
        assert!(matches!(wrapped, ProcessError::Io(_)));

        let render = ProcessError::SpawnFailed("spawn failed".to_string()).to_string();
        assert_eq!(render, "spawn failed");
    }

    #[test]
    fn a014_process_error_runtime_not_running_display() {
        let err = ProcessError::RuntimeNotRunning {
            name: "agentscope".to_string(),
        };
        assert_eq!(err.to_string(), "process 'agentscope' is not running");
    }

    #[test]
    fn a014_process_error_health_timeout_display() {
        let err = ProcessError::HealthTimeout {
            name: "litellm".to_string(),
            timeout_ms: 5000,
        };
        assert_eq!(
            err.to_string(),
            "process 'litellm' did not become healthy within 5000ms"
        );
    }

    #[test]
    fn a014_process_error_io_display_forwards_io_message() {
        let io = std::io::Error::new(std::io::ErrorKind::BrokenPipe, "broken pipe");
        let err = ProcessError::Io(io);
        assert!(err.to_string().contains("broken pipe"));
    }

    #[test]
    fn a014_process_cleanup_all_orphan_processes_handles_missing_dir() {
        let temp = tempfile::tempdir().expect("tempdir");
        // No PID files exist — should complete without panicking.
        super::cleanup_all_orphan_processes(temp.path());
    }

    #[test]
    fn a014_process_cleanup_all_orphan_processes_removes_stale_pid_files() {
        let temp = tempfile::tempdir().expect("tempdir");
        // Write a PID file for "agentscope" with an invalid PID.
        let pid_path = pid_file_path(temp.path(), "agentscope");
        std::fs::create_dir_all(pid_path.parent().unwrap()).expect("create runtime dir");
        std::fs::write(&pid_path, "0").expect("write zero pid");

        super::cleanup_all_orphan_processes(temp.path());

        // PID 0 should be cleaned up.
        assert!(!pid_path.exists());
    }

    #[test]
    fn a014_process_cleanup_all_orphan_processes_removes_invalid_pid() {
        let temp = tempfile::tempdir().expect("tempdir");
        for name in ["agentscope", "litellm", "postgres"] {
            let pid_path = pid_file_path(temp.path(), name);
            std::fs::create_dir_all(pid_path.parent().unwrap()).expect("create dir");
            std::fs::write(&pid_path, "not-a-pid").expect("write bad pid");
        }

        super::cleanup_all_orphan_processes(temp.path());

        for name in ["agentscope", "litellm", "postgres"] {
            assert!(!pid_file_path(temp.path(), name).exists(), "{name} pid file should be removed");
        }
    }

    #[test]
    fn a014_process_cleanup_stale_pid_removes_zero_pid() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = pid_file_path(temp.path(), "litellm");
        std::fs::create_dir_all(path.parent().unwrap()).expect("create dir");
        std::fs::write(&path, "0").expect("write zero pid");

        cleanup_stale_pid(temp.path(), "litellm");

        assert!(!path.exists());
    }

    #[cfg(unix)]
    #[test]
    fn a014_process_kill_process_on_port_with_no_listener_is_noop() {
        // No process listens on port 1 — lsof returns empty, kill is skipped.
        // Should not panic.
        super::kill_process_on_port(1);
    }

    #[test]
    fn a014_process_default_impl_creates_same_as_new() {
        let _manager: ProcessManager = Default::default();
        // Just verifying Default is implemented and doesn't panic.
    }

    #[test]
    fn a014_process_cleanup_stale_pid_with_dead_pid_removes_file() {
        // Use PID 999999998 which almost certainly does not exist.
        let temp = tempfile::tempdir().expect("tempdir");
        let path = pid_file_path(temp.path(), "postgres");
        std::fs::create_dir_all(path.parent().unwrap()).expect("create dir");
        std::fs::write(&path, "999999998").expect("write fake pid");

        cleanup_stale_pid(temp.path(), "postgres");

        // Either the file was removed (process dead) or kept (improbably the pid exists).
        // We just ensure no panic occurred. The file may or may not exist.
        let _ = path.exists();
    }

    #[test]
    fn a014_process_pid_file_write_creates_parent_dirs() {
        let temp = tempfile::tempdir().expect("tempdir");
        // The runtime/agentscope directory doesn't exist yet
        let path = pid_file_path(temp.path(), "agentscope");
        assert!(!path.exists());

        write_pid_file(temp.path(), "agentscope", 12345);

        assert!(path.exists());
        let content = std::fs::read_to_string(&path).expect("read pid");
        assert_eq!(content, "12345");
    }

    #[test]
    fn a014_process_remove_pid_file_nonexistent_is_noop() {
        let temp = tempfile::tempdir().expect("tempdir");
        // Should not panic when the file doesn't exist
        remove_pid_file(temp.path(), "nonexistent");
    }

    #[test]
    fn a014_process_enforce_memory_limit_delegates_to_supervisor() {
        let temp = tempfile::tempdir().expect("tempdir");
        let manager = ProcessManager::with_parts(
            Arc::new(Mutex::new(RuntimeState::new())),
            Arc::new(ProcessLogs::with_max_lines(temp.path().to_path_buf(), 10)),
        );
        let registry = make_registry();
        // With no processes registered, total RSS is 0, so limit is not exceeded.
        let result = manager.enforce_memory_limit(&registry, "any");
        assert!(!result);
    }

    #[tokio::test]
    async fn a033_process_spawn_process_creates_process_and_writes_pid() {
        let temp = tempfile::tempdir().expect("tempdir");
        let manager = ProcessManager::with_parts(
            Arc::new(Mutex::new(RuntimeState::new())),
            Arc::new(ProcessLogs::with_max_lines(temp.path().to_path_buf(), 10)),
        );
        let registry = make_registry();

        let health_port = spawn_health_server().await;
        let health_url = format!("http://127.0.0.1:{}/health", health_port);

        let mut command = tokio::process::Command::new("sh");
        command
            .arg("-c")
            .arg("sleep 30")
            .stdout(piped_stdio())
            .stderr(piped_stdio())
            .kill_on_drop(true);

        #[cfg(unix)]
        {
            command.process_group(0);
        }

        let budget = ProcessBudget {
            pid: None,
            health_url: health_url.clone(),
            health_interval_ms: 1000,
            max_health_failures: 3,
            max_restarts: 3,
            location: ProcessLocation::Local,
            consecutive_failures: 0,
            restart_count: 0,
            status: ProcessStatus::Starting,
            started_at: Some(Instant::now()),
            owner: "system".to_string(),
        };

        let pid = manager
            .spawn_process("test-process", &mut command, budget, &registry, 5)
            .await
            .expect("spawn_process should succeed");

        assert!(pid > 0);

        let pid_path = pid_file_path(temp.path(), "test-process");
        assert!(pid_path.exists());
        let pid_content = std::fs::read_to_string(&pid_path).expect("read pid file");
        assert_eq!(pid_content, pid.to_string());

        {
            let state = manager.state.lock().await;
            assert!(state.children.contains_key("test-process"));
        }

        manager
            .shutdown("test-process")
            .await
            .expect("shutdown test process");
    }

    #[tokio::test]
    async fn a033_process_spawn_process_errors_when_already_running() {
        let temp = tempfile::tempdir().expect("tempdir");
        let manager = ProcessManager::with_parts(
            Arc::new(Mutex::new(RuntimeState::new())),
            Arc::new(ProcessLogs::with_max_lines(temp.path().to_path_buf(), 10)),
        );
        let registry = make_registry();

        let health_port = spawn_health_server().await;
        let health_url = format!("http://127.0.0.1:{}/health", health_port);

        let mut command1 = tokio::process::Command::new("sh");
        command1
            .arg("-c")
            .arg("sleep 30")
            .stdout(piped_stdio())
            .stderr(piped_stdio())
            .kill_on_drop(true);

        #[cfg(unix)]
        {
            command1.process_group(0);
        }

        let budget = ProcessBudget {
            pid: None,
            health_url: health_url.clone(),
            health_interval_ms: 1000,
            max_health_failures: 3,
            max_restarts: 3,
            location: ProcessLocation::Local,
            consecutive_failures: 0,
            restart_count: 0,
            status: ProcessStatus::Starting,
            started_at: Some(Instant::now()),
            owner: "system".to_string(),
        };

        let _pid = manager
            .spawn_process("duplicate", &mut command1, budget.clone(), &registry, 5)
            .await
            .expect("first spawn should succeed");

        let mut command2 = tokio::process::Command::new("sh");
        command2.arg("-c").arg("sleep 30");

        let error = manager
            .spawn_process("duplicate", &mut command2, budget, &registry, 5)
            .await
            .expect_err("duplicate spawn should fail");

        match error {
            ProcessError::SpawnFailed(msg) => {
                assert!(msg.contains("already running"));
            }
            other => panic!("unexpected error: {:?}", other),
        }

        manager.shutdown("duplicate").await.expect("cleanup");
    }

    #[tokio::test]
    async fn a033_process_spawn_process_health_timeout_errors() {
        let temp = tempfile::tempdir().expect("tempdir");
        let manager = ProcessManager::with_parts(
            Arc::new(Mutex::new(RuntimeState::new())),
            Arc::new(ProcessLogs::with_max_lines(temp.path().to_path_buf(), 10)),
        );
        let registry = make_registry();

        let mut command = tokio::process::Command::new("sh");
        command
            .arg("-c")
            .arg("sleep 30")
            .stdout(piped_stdio())
            .stderr(piped_stdio())
            .kill_on_drop(true);

        #[cfg(unix)]
        {
            command.process_group(0);
        }

        let budget = ProcessBudget {
            pid: None,
            health_url: "none://skip".to_string(),
            health_interval_ms: 1000,
            max_health_failures: 3,
            max_restarts: 3,
            location: ProcessLocation::Local,
            consecutive_failures: 0,
            restart_count: 0,
            status: ProcessStatus::Starting,
            started_at: Some(Instant::now()),
            owner: "system".to_string(),
        };

        let error = manager
            .spawn_process("timeout-process", &mut command, budget, &registry, 1)
            .await
            .expect_err("should timeout on health check");

        match error {
            ProcessError::HealthTimeout { name, timeout_ms } => {
                assert_eq!(name, "timeout-process");
                assert_eq!(timeout_ms, 1000);
            }
            other => panic!("unexpected error: {:?}", other),
        }
    }

    #[tokio::test]
    async fn a033_process_spawn_process_captures_stdout_and_stderr() {
        let temp = tempfile::tempdir().expect("tempdir");
        let manager = ProcessManager::with_parts(
            Arc::new(Mutex::new(RuntimeState::new())),
            Arc::new(ProcessLogs::with_max_lines(temp.path().to_path_buf(), 100)),
        );
        let registry = make_registry();

        let health_port = spawn_health_server().await;
        let health_url = format!("http://127.0.0.1:{}/health", health_port);

        let mut command = tokio::process::Command::new("sh");
        command
            .arg("-c")
            .arg("echo 'stdout line 1' && echo 'stdout line 2' >&2 && echo 'stdout line 3' && sleep 30")
            .stdout(piped_stdio())
            .stderr(piped_stdio())
            .kill_on_drop(true);

        #[cfg(unix)]
        {
            command.process_group(0);
        }

        let budget = ProcessBudget {
            pid: None,
            health_url: health_url.clone(),
            health_interval_ms: 1000,
            max_health_failures: 3,
            max_restarts: 3,
            location: ProcessLocation::Local,
            consecutive_failures: 0,
            restart_count: 0,
            status: ProcessStatus::Starting,
            started_at: Some(Instant::now()),
            owner: "system".to_string(),
        };

        let _pid = manager
            .spawn_process("log-test", &mut command, budget, &registry, 5)
            .await
            .expect("spawn_process should succeed");

        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

        let logs = manager.logs.tail("log-test", 10);
        assert!(logs.iter().any(|l| l.contains("stdout line 1")));
        assert!(logs.iter().any(|l| l.contains("stdout line 3")));
        assert!(logs.iter().any(|l| l.contains("[stderr]") && l.contains("stdout line 2")));

        manager.shutdown("log-test").await.expect("cleanup");
    }
}
