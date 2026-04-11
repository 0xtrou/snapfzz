// A038/PostgresRuntime: Embedded PostgreSQL lifecycle managed as runtime infrastructure
use std::path::{Path, PathBuf};

use thiserror::Error;

// A038/PostgresError: Normalize postgresql_embedded errors for runtime lifecycle operations.
#[derive(Debug, Error)]
pub enum PostgresError {
    #[error("postgres runtime operation failed: {0}")]
    Runtime(#[from] postgresql_embedded::Error),
}

pub struct PostgresRuntime {
    data_dir: PathBuf,
    pg: Option<postgresql_embedded::PostgreSQL>,
}

impl PostgresRuntime {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { data_dir, pg: None }
    }

    // A038/setup: Download binaries + initdb (idempotent, cached after first download)
    pub async fn setup(&mut self) -> Result<(), PostgresError> {
        let settings = postgresql_embedded::SettingsBuilder::new()
            .installation_dir(self.data_dir.join("runtime").join("postgres"))
            .data_dir(self.data_dir.join("data").join("postgres"))
            .host("127.0.0.1")
            .port(0)
            .username("postgres")
            .password("snapfzz")
            .temporary(false)
            .build();

        let mut pg = postgresql_embedded::PostgreSQL::new(settings);
        pg.setup().await?;
        self.pg = Some(pg);
        Ok(())
    }

    // A038/start: Start PostgreSQL server.
    // Cleans up stale postmaster.pid from a previous crash before attempting to start.
    pub async fn start(&mut self) -> Result<(), PostgresError> {
        self.cleanup_stale_postmaster();
        if let Some(pg) = self.pg.as_mut() {
            pg.start().await?;
        }
        Ok(())
    }

    // A038/cleanup: Kill orphan PostgreSQL from a previous crash and remove its stale PID lock.
    // postgresql_embedded writes postmaster.pid to the data directory. If the app exits without
    // calling pg.stop(), the file survives and pg_ctl refuses to start ("another server might be
    // running"). This reads the PID, kills the stale process, and removes the file.
    fn cleanup_stale_postmaster(&self) {
        let postmaster_pid = self.data_dir.join("data").join("postgres").join("postmaster.pid");
        if let Some(pid) = Self::read_postmaster_pid(&postmaster_pid) {
            Self::kill_if_alive(pid);
            let _ = std::fs::remove_file(&postmaster_pid);
            eprintln!("[postgres] cleaned up stale postmaster (pid={pid})");
        }
    }

    // A038/read_postmaster_pid: Parse PID from PostgreSQL's postmaster.pid file.
    // Format: first line is the PID as a decimal integer.
    fn read_postmaster_pid(path: &Path) -> Option<u32> {
        let content = std::fs::read_to_string(path).ok()?;
        content.lines().next()?.trim().parse::<u32>().ok().filter(|&p| p > 0)
    }

    #[cfg(unix)]
    fn kill_if_alive(pid: u32) {
        let mut system = sysinfo::System::new();
        system.refresh_processes(
            sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]),
            true,
        );
        if system.process(sysinfo::Pid::from_u32(pid)).is_some() {
            unsafe {
                libc::kill(-(pid as i32), libc::SIGKILL);
                libc::kill(pid as i32, libc::SIGKILL);
            }
        }
    }

    #[cfg(not(unix))]
    fn kill_if_alive(pid: u32) {
        let mut system = sysinfo::System::new();
        system.refresh_processes(
            sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]),
            true,
        );
        if let Some(process) = system.process(sysinfo::Pid::from_u32(pid)) {
            process.kill();
        }
    }

    // A038/stop: Stop PostgreSQL server
    pub async fn stop(&self) -> Result<(), PostgresError> {
        if let Some(pg) = self.pg.as_ref() {
            pg.stop().await?;
        }
        Ok(())
    }

    // A038/create_database: Create a database for a service (idempotent — ignores "already exists")
    pub async fn create_database(&self, name: &str) -> Result<(), PostgresError> {
        if let Some(pg) = self.pg.as_ref() {
            match pg.create_database(name).await {
                Ok(()) => {}
                Err(e) if e.to_string().contains("already exists") => {}
                Err(e) => return Err(e.into()),
            }
        }
        Ok(())
    }

    // A038/connection_url: Get postgres:// URL for a specific database
    // MUST be called AFTER start() — port is 0 until then
    pub fn connection_url(&self, database: &str) -> Option<String> {
        self.pg.as_ref().map(|pg| pg.settings().url(database))
    }

    pub fn is_ready(&self) -> bool {
        self.pg.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::PostgresRuntime;

    #[test]
    fn t38_postgres_runtime_new() {
        // A038/new: Constructor stores root data dir and starts with uninitialized runtime handle.
        let temp = tempfile::tempdir().expect("tempdir");
        let runtime = PostgresRuntime::new(temp.path().to_path_buf());
        assert!(!runtime.is_ready());
    }

    #[test]
    fn t38_postgres_runtime_is_ready_false_initially() {
        // A038/is_ready: Runtime is not ready before setup initializes PostgreSQL handle.
        let temp = tempfile::tempdir().expect("tempdir");
        let runtime = PostgresRuntime::new(temp.path().to_path_buf());
        assert!(!runtime.is_ready());
    }

    #[test]
    fn t38_postgres_runtime_connection_url_none_before_start() {
        // A038/connection_url: URL is unavailable before setup/start creates a live PostgreSQL instance.
        let temp = tempfile::tempdir().expect("tempdir");
        let runtime = PostgresRuntime::new(temp.path().to_path_buf());
        assert_eq!(runtime.connection_url("litellm"), None);
    }
}
