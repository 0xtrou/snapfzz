// A038/PostgresRuntime: Embedded PostgreSQL lifecycle managed as runtime infrastructure
use std::path::{Path, PathBuf};
use std::time::Instant;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

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
    // A039/PostgresMetrics: Track when the server was started for uptime calculation
    started_at: Option<Instant>,
    // A039/PostgresHealth: Port of the tiny HTTP health server (None if not started)
    health_port: Arc<TokioMutex<Option<u16>>>,
}

impl PostgresRuntime {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            pg: None,
            started_at: None,
            health_port: Arc::new(TokioMutex::new(None)),
        }
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
    // A039/PostgresMetrics: Records started_at for uptime tracking.
    // A039/PostgresHealth: Starts a tiny HTTP health server on a random port.
    // A039/PostgresLogs: Patches postgresql.conf for structured logging, starts log tailer.
    pub async fn start(&mut self) -> Result<(), PostgresError> {
        self.cleanup_stale_postmaster();
        self.patch_postgresql_conf();
        if let Some(pg) = self.pg.as_mut() {
            pg.start().await?;
            self.started_at = Some(Instant::now());
            self.start_health_server().await;
        }
        Ok(())
    }

    // A039/PostgresLogs: Patch postgresql.conf to enable structured logging.
    // Sets log_destination=stderr, logging_collector=on, log_directory, log_filename,
    // log_line_prefix with timestamp+pid, and reasonable log verbosity.
    fn patch_postgresql_conf(&self) {
        let conf_path = self.data_dir.join("data").join("postgres").join("postgresql.conf");
        if !conf_path.exists() {
            return;
        }

        let snapfzz_marker = "# snapfzz-managed logging";
        if let Ok(content) = std::fs::read_to_string(&conf_path) {
            if content.contains(snapfzz_marker) {
                return; // Already patched
            }
        }

        let log_dir = self.data_dir.join("data").join("postgres").join("log");
        let _ = std::fs::create_dir_all(&log_dir);

        let patch = format!(
            "\n{snapfzz_marker}\n\
             logging_collector = on\n\
             log_directory = '{}'\n\
             log_filename = 'postgresql.log'\n\
             log_truncate_on_rotation = on\n\
             log_rotation_age = 0\n\
             log_rotation_size = 10240\n\
             log_line_prefix = '%t [%p] '\n\
             log_statement = 'ddl'\n\
             log_connections = on\n\
             log_disconnections = on\n",
            log_dir.display()
        );

        if let Err(e) = std::fs::OpenOptions::new()
            .append(true)
            .open(&conf_path)
            .and_then(|mut f| {
                use std::io::Write;
                f.write_all(patch.as_bytes())
            })
        {
            eprintln!("[postgres] failed to patch postgresql.conf: {e}");
        } else {
            eprintln!("[postgres] patched postgresql.conf for structured logging");
        }
    }

    /// Path to the PostgreSQL log file (available after setup + start with patched config).
    pub fn log_file_path(&self) -> PathBuf {
        self.data_dir.join("data").join("postgres").join("log").join("postgresql.log")
    }

    // A039/PostgresHealth: Tiny HTTP server that responds to GET /health with 200 OK
    // when PostgreSQL is running. Used by the health monitoring system and shown in the
    // Processes UI. Does NOT expose database credentials.
    async fn start_health_server(&self) {
        let health_port = self.health_port.clone();
        let data_dir = self.data_dir.clone();
        tokio::spawn(async move {
            let listener = match tokio::net::TcpListener::bind("127.0.0.1:0").await {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("[postgres/health] failed to bind: {e}");
                    return;
                }
            };
            let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
            *health_port.lock().await = Some(port);
            eprintln!("[postgres/health] listening on 127.0.0.1:{port}");

            loop {
                let (mut stream, _) = match listener.accept().await {
                    Ok(conn) => conn,
                    Err(_) => break,
                };

                let is_alive = Self::read_postmaster_pid(
                    &data_dir.join("data").join("postgres").join("postmaster.pid"),
                ).is_some();

                let response = if is_alive {
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 22\r\n\r\n{\"status\":\"healthy\"}\r\n"
                } else {
                    "HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\nContent-Length: 24\r\n\r\n{\"status\":\"unhealthy\"}\r\n"
                };

                use tokio::io::{AsyncReadExt, AsyncWriteExt};
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf).await;
                let _ = stream.write_all(response.as_bytes()).await;
            }
        });
    }

    // A039/PostgresHealth: Returns the health endpoint URL (http://127.0.0.1:PORT/health)
    pub async fn health_url(&self) -> String {
        match *self.health_port.lock().await {
            Some(port) => format!("http://127.0.0.1:{port}/health"),
            None => String::new(),
        }
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
    // A039/PostgresMetrics: Clears started_at so uptime resets to 0.
    pub async fn stop(&mut self) -> Result<(), PostgresError> {
        if let Some(pg) = self.pg.as_ref() {
            pg.stop().await?;
        }
        self.started_at = None;
        // A039/PostgresHealth: Clear health port so the health URL reports empty
        // and is_ready() returns false. The spawned health server will exit on its
        // own since postmaster.pid is gone (responds 503 until the task is dropped).
        *self.health_port.lock().await = None;
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

    // A039/PostgresMetrics: Read PID from the live postmaster.pid file.
    // The first line of data_dir/data/postgres/postmaster.pid is the server PID.
    // Returns None when the server is not running or the file is absent.
    pub fn pid(&self) -> Option<u32> {
        let postmaster_pid = self.data_dir.join("data").join("postgres").join("postmaster.pid");
        Self::read_postmaster_pid(&postmaster_pid)
    }

    // A039/PostgresMetrics: Elapsed seconds since the server was started.
    // Returns 0 when the server has not been started or was stopped.
    pub fn uptime_secs(&self) -> u64 {
        self.started_at
            .map(|t| t.elapsed().as_secs())
            .unwrap_or(0)
    }

    // A039/PostgresMetrics: Resident-set size in MB for the postgres server process.
    // Uses sysinfo to query the OS for memory usage via the live PID.
    // Returns None when the PID is unavailable or sysinfo cannot find the process.
    pub fn rss_mb(&self) -> Option<f64> {
        let pid = self.pid()?;
        let sysinfo_pid = sysinfo::Pid::from_u32(pid);
        let mut system = sysinfo::System::new();
        system.refresh_processes(
            sysinfo::ProcessesToUpdate::Some(&[sysinfo_pid]),
            true,
        );
        system
            .process(sysinfo_pid)
            .map(|p| p.memory() as f64 / (1024.0 * 1024.0))
    }

    // A038/connection_url: Get postgres:// URL for a specific database
    // MUST be called AFTER start() — port is 0 until then
    pub fn connection_url(&self, database: &str) -> Option<String> {
        self.pg.as_ref().map(|pg| pg.settings().url(database))
    }

    pub fn is_ready(&self) -> bool {
        // A039/PostgresMetrics: Ready = pg instance exists AND server was started (started_at set).
        // After stop(), started_at is None so is_ready returns false even though pg is Some.
        self.pg.is_some() && self.started_at.is_some()
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

    // ── read_postmaster_pid ──────────────────────────────────────────────────

    #[test]
    fn t38_postgres_read_postmaster_pid_valid() {
        // A038/read_postmaster_pid: Returns parsed PID when first line is a positive integer.
        let temp = tempfile::tempdir().expect("tempdir");
        let pid_file = temp.path().join("postmaster.pid");
        std::fs::write(&pid_file, "12345\n").expect("write");
        assert_eq!(PostgresRuntime::read_postmaster_pid(&pid_file), Some(12345));
    }

    #[test]
    fn t38_postgres_read_postmaster_pid_multiline_uses_first_line() {
        // A038/read_postmaster_pid: Only the first line is parsed; subsequent lines are ignored.
        let temp = tempfile::tempdir().expect("tempdir");
        let pid_file = temp.path().join("postmaster.pid");
        std::fs::write(&pid_file, "42\nsomething else\n").expect("write");
        assert_eq!(PostgresRuntime::read_postmaster_pid(&pid_file), Some(42));
    }

    #[test]
    fn t38_postgres_read_postmaster_pid_empty_file() {
        // A038/read_postmaster_pid: Returns None for an empty file (no lines to parse).
        let temp = tempfile::tempdir().expect("tempdir");
        let pid_file = temp.path().join("postmaster.pid");
        std::fs::write(&pid_file, "").expect("write");
        assert_eq!(PostgresRuntime::read_postmaster_pid(&pid_file), None);
    }

    #[test]
    fn t38_postgres_read_postmaster_pid_non_numeric() {
        // A038/read_postmaster_pid: Returns None when first line cannot be parsed as u32.
        let temp = tempfile::tempdir().expect("tempdir");
        let pid_file = temp.path().join("postmaster.pid");
        std::fs::write(&pid_file, "not-a-pid\n").expect("write");
        assert_eq!(PostgresRuntime::read_postmaster_pid(&pid_file), None);
    }

    #[test]
    fn t38_postgres_read_postmaster_pid_zero_rejected() {
        // A038/read_postmaster_pid: Returns None when PID is 0 — PID 0 is never a valid process.
        let temp = tempfile::tempdir().expect("tempdir");
        let pid_file = temp.path().join("postmaster.pid");
        std::fs::write(&pid_file, "0\n").expect("write");
        assert_eq!(PostgresRuntime::read_postmaster_pid(&pid_file), None);
    }

    #[test]
    fn t38_postgres_read_postmaster_pid_missing_file() {
        // A038/read_postmaster_pid: Returns None when the file does not exist.
        let temp = tempfile::tempdir().expect("tempdir");
        let pid_file = temp.path().join("nonexistent.pid");
        assert_eq!(PostgresRuntime::read_postmaster_pid(&pid_file), None);
    }

    #[test]
    fn t38_postgres_read_postmaster_pid_whitespace_trimmed() {
        // A038/read_postmaster_pid: Trims surrounding whitespace before parsing.
        let temp = tempfile::tempdir().expect("tempdir");
        let pid_file = temp.path().join("postmaster.pid");
        std::fs::write(&pid_file, "  7890  \n").expect("write");
        assert_eq!(PostgresRuntime::read_postmaster_pid(&pid_file), Some(7890));
    }

    // ── cleanup_stale_postmaster ─────────────────────────────────────────────

    #[test]
    fn t38_postgres_cleanup_stale_postmaster_no_file_is_noop() {
        // A038/cleanup_stale_postmaster: No-op when postmaster.pid does not exist — does not panic.
        let temp = tempfile::tempdir().expect("tempdir");
        let runtime = PostgresRuntime::new(temp.path().to_path_buf());
        // Must not panic even though the data dir hierarchy does not exist.
        runtime.cleanup_stale_postmaster();
    }

    #[test]
    fn t38_postgres_cleanup_stale_postmaster_dead_pid_removes_file() {
        // A038/cleanup_stale_postmaster: PID file with a surely-dead PID is removed after cleanup.
        let temp = tempfile::tempdir().expect("tempdir");
        let pg_data = temp.path().join("data").join("postgres");
        std::fs::create_dir_all(&pg_data).expect("mkdir");
        let pid_file = pg_data.join("postmaster.pid");
        // PID 99999999 is guaranteed not to be a live process on any supported system.
        std::fs::write(&pid_file, "99999999\n").expect("write pid file");
        assert!(pid_file.exists(), "precondition: file must exist before cleanup");

        let runtime = PostgresRuntime::new(temp.path().to_path_buf());
        runtime.cleanup_stale_postmaster();

        assert!(!pid_file.exists(), "postmaster.pid must be removed after cleanup of dead PID");
    }

    #[test]
    fn t38_postgres_cleanup_stale_postmaster_invalid_pid_leaves_file() {
        // A038/cleanup_stale_postmaster: File with non-numeric content is not parseable so no removal occurs.
        let temp = tempfile::tempdir().expect("tempdir");
        let pg_data = temp.path().join("data").join("postgres");
        std::fs::create_dir_all(&pg_data).expect("mkdir");
        let pid_file = pg_data.join("postmaster.pid");
        std::fs::write(&pid_file, "garbage\n").expect("write pid file");

        let runtime = PostgresRuntime::new(temp.path().to_path_buf());
        runtime.cleanup_stale_postmaster();

        // No valid PID parsed — file should remain untouched.
        assert!(pid_file.exists(), "file with unparseable content must not be removed");
    }

    // ── kill_if_alive ────────────────────────────────────────────────────────

    #[test]
    fn t38_postgres_kill_if_alive_dead_pid_is_noop() {
        // A038/kill_if_alive: Calling with a surely-dead PID neither panics nor errors.
        // PID 99999999 is virtually guaranteed to not exist on any supported platform.
        PostgresRuntime::kill_if_alive(99999999);
    }

    // ── stop (pg = None) ─────────────────────────────────────────────────────

    #[tokio::test]
    async fn t38_postgres_stop_when_pg_none_is_noop() {
        // A038/stop: stop() returns Ok immediately when no PostgreSQL instance has been set up.
        let temp = tempfile::tempdir().expect("tempdir");
        let mut runtime = PostgresRuntime::new(temp.path().to_path_buf());
        let result = runtime.stop().await;
        assert!(result.is_ok(), "stop() with pg=None must succeed");
    }

    // ── start (pg = None) ────────────────────────────────────────────────────

    #[tokio::test]
    async fn t38_postgres_start_when_pg_none_runs_cleanup_only() {
        // A038/start: start() with pg=None runs cleanup_stale_postmaster but skips pg.start().
        // Verified by confirming no panic and Ok return without a live PostgreSQL.
        let temp = tempfile::tempdir().expect("tempdir");
        let mut runtime = PostgresRuntime::new(temp.path().to_path_buf());
        let result = runtime.start().await;
        assert!(result.is_ok(), "start() with pg=None must succeed without a live pg instance");
        assert!(!runtime.is_ready(), "pg handle must remain None after start() without setup()");
    }

    // ── create_database (pg = None) ──────────────────────────────────────────

    #[tokio::test]
    async fn t38_postgres_create_database_when_pg_none_is_noop() {
        // A038/create_database: Returns Ok immediately when no PostgreSQL instance has been set up.
        let temp = tempfile::tempdir().expect("tempdir");
        let runtime = PostgresRuntime::new(temp.path().to_path_buf());
        let result = runtime.create_database("mydb").await;
        assert!(result.is_ok(), "create_database() with pg=None must succeed");
    }

    // ── pid (A039/PostgresMetrics) ──────────────────────────────────────────

    #[test]
    fn t39_postgres_pid_returns_none_before_start() {
        // A039/PostgresMetrics: PID is unavailable when no postmaster.pid exists.
        let temp = tempfile::tempdir().expect("tempdir");
        let runtime = PostgresRuntime::new(temp.path().to_path_buf());
        assert_eq!(runtime.pid(), None);
    }

    #[test]
    fn t39_postgres_pid_reads_from_postmaster_pid_file() {
        // A039/PostgresMetrics: PID is read from data/postgres/postmaster.pid when the file exists.
        let temp = tempfile::tempdir().expect("tempdir");
        let pg_data = temp.path().join("data").join("postgres");
        std::fs::create_dir_all(&pg_data).expect("mkdir");
        std::fs::write(pg_data.join("postmaster.pid"), "54321\n").expect("write pid");

        let runtime = PostgresRuntime::new(temp.path().to_path_buf());
        assert_eq!(runtime.pid(), Some(54321));
    }

    // ── uptime_secs (A039/PostgresMetrics) ──────────────────────────────────

    #[test]
    fn t39_postgres_uptime_secs_zero_before_start() {
        // A039/PostgresMetrics: Uptime is 0 when the server has never been started.
        let temp = tempfile::tempdir().expect("tempdir");
        let runtime = PostgresRuntime::new(temp.path().to_path_buf());
        assert_eq!(runtime.uptime_secs(), 0);
    }

    #[tokio::test]
    async fn t39_postgres_uptime_secs_zero_after_stop() {
        // A039/PostgresMetrics: Uptime resets to 0 after stop (without a live pg, stop is a no-op
        // but started_at stays None).
        let temp = tempfile::tempdir().expect("tempdir");
        let mut runtime = PostgresRuntime::new(temp.path().to_path_buf());
        runtime.stop().await.expect("stop");
        assert_eq!(runtime.uptime_secs(), 0);
    }

    // ── rss_mb (A039/PostgresMetrics) ───────────────────────────────────────

    #[test]
    fn t39_postgres_rss_mb_returns_none_without_pid() {
        // A039/PostgresMetrics: RSS is unavailable when no PID file exists.
        let temp = tempfile::tempdir().expect("tempdir");
        let runtime = PostgresRuntime::new(temp.path().to_path_buf());
        assert_eq!(runtime.rss_mb(), None);
    }

    #[test]
    fn t39_postgres_rss_mb_returns_none_for_dead_pid() {
        // A039/PostgresMetrics: RSS is None when the PID file references a non-existent process.
        let temp = tempfile::tempdir().expect("tempdir");
        let pg_data = temp.path().join("data").join("postgres");
        std::fs::create_dir_all(&pg_data).expect("mkdir");
        std::fs::write(pg_data.join("postmaster.pid"), "99999999\n").expect("write pid");

        let runtime = PostgresRuntime::new(temp.path().to_path_buf());
        assert_eq!(runtime.rss_mb(), None);
    }

    #[test]
    fn t39_postgres_rss_mb_returns_some_for_self_pid() {
        // A039/PostgresMetrics: RSS returns a positive value for a known-live process (our own PID).
        let temp = tempfile::tempdir().expect("tempdir");
        let pg_data = temp.path().join("data").join("postgres");
        std::fs::create_dir_all(&pg_data).expect("mkdir");
        let self_pid = std::process::id();
        std::fs::write(
            pg_data.join("postmaster.pid"),
            format!("{self_pid}\n"),
        )
        .expect("write pid");

        let runtime = PostgresRuntime::new(temp.path().to_path_buf());
        let rss = runtime.rss_mb();
        assert!(rss.is_some(), "RSS must be available for own process");
        assert!(rss.unwrap() > 0.0, "RSS must be positive for a live process");
    }
}
