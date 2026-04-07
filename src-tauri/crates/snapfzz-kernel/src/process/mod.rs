use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;

use snapfzz_budget::{
    supervised::{ProcessBudget, ProcessLocation},
    BudgetRegistry,
};
use snapfzz_budget::metrics::ProcessStatus;
use crate::process::health::{apply_health_check, wait_until_healthy};
use crate::process::logs::ProcessLogs;
use crate::process::runtime::{piped_stdio, RuntimeState};
use crate::process::supervisor::{apply_memory_limit, restart_runtime, wait_for_shutdown};

pub mod health;
pub mod logs;
pub mod runtime;
pub mod supervisor;

#[derive(Debug)]
pub enum ProcessError {
    Io(std::io::Error),
    RuntimeNotRunning { name: String },
    UnknownProcess { name: String },
    HealthTimeout { name: String, timeout_ms: u64 },
    SpawnFailed(String),
}

impl std::fmt::Display for ProcessError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "{error}"),
            Self::RuntimeNotRunning { name } => write!(f, "process '{name}' is not running"),
            Self::UnknownProcess { name } => write!(f, "unknown process '{name}'"),
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
        if name != "agentscope" {
            return Err(ProcessError::UnknownProcess {
                name: name.to_string(),
            });
        }

        cleanup_stale_pid(self.logs.data_dir(), name);

        let mut command = tokio::process::Command::new("uv");
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
            guard.child = Some(child);
            guard.child_pid = Some(child_pid);
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
                restart_count: if is_restart {
                    prev_restart_count + 1
                } else {
                    0
                },
                status: ProcessStatus::Starting,
                started_at: Some(Instant::now()),
                owner: "system".to_string(),
            },
        );

        wait_until_healthy(registry, name, 120, Duration::from_secs(1)).await?;
        Ok(child_pid)
    }

    pub async fn shutdown(&self, name: &str) -> Result<(), ProcessError> {
        if name != "agentscope" {
            return Err(ProcessError::UnknownProcess {
                name: name.to_string(),
            });
        }

        let mut guard = self.state.lock().await;

        if guard.child.is_none() {
            guard.child_pid = None;
            return Ok(());
        }

        let pid = guard.child_pid;

        if let Some(mut child) = guard.child.take() {
            if let Some(pid) = pid {
                let is_alive = child.try_wait().ok().flatten().is_none();
                if is_alive {
                    #[cfg(unix)]
                    unsafe {
                        libc::kill(-(pid as i32), libc::SIGKILL);
                        libc::kill(pid as i32, libc::SIGKILL);
                    }
                    #[cfg(not(unix))]
                    {
                        let _ = child.start_kill();
                    }
                }
            }
            wait_for_shutdown(&mut child).await;
        }

        guard.child_pid = None;
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
        if name != "agentscope" {
            return Err(ProcessError::UnknownProcess {
                name: name.to_string(),
            });
        }

        let pid = self
            .state
            .blocking_lock()
            .child_pid
            .ok_or_else(|| ProcessError::RuntimeNotRunning {
                name: name.to_string(),
            })?;

        #[cfg(unix)]
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
            libc::kill(pid as i32, libc::SIGKILL);
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
