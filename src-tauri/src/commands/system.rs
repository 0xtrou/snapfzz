use serde::Serialize;
use snapfzz_kernel::boot::PhaseTimingDto;
use snapfzz_kernel::budget::BudgetRegistry;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use tauri::Manager;

#[derive(Serialize, Debug)]
pub struct HealthStatus {
    status: String,
}

fn resolve_open_target(path: &str) -> Result<PathBuf, String> {
    let expanded = if let Some(rest) = path.strip_prefix("~/") {
        dirs::home_dir().unwrap_or_default().join(rest)
    } else {
        PathBuf::from(path)
    };

    if let Ok(canonical) = expanded.canonicalize() {
        return Ok(canonical);
    }

    if let Some(parent) = expanded.parent() {
        if let Ok(parent_canonical) = parent.canonicalize() {
            return Ok(match expanded.file_name() {
                Some(name) => parent_canonical.join(name),
                None => parent_canonical,
            });
        }
    }

    Err("Only URLs or paths under ~/.snapfzz are allowed".to_string())
}

fn snapfzz_home() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".snapfzz")
}

fn validate_open_path_target(path: &str) -> Result<(), String> {
    if path.starts_with("http://") || path.starts_with("https://") {
        return Ok(());
    }

    let target = resolve_open_target(path)?;
    let snapfzz_root = snapfzz_home();
    let allowed_root = snapfzz_root.canonicalize().unwrap_or_else(|_| snapfzz_root.clone());

    if target.starts_with(&allowed_root) {
        return Ok(());
    }

    Err("Only URLs or paths under ~/.snapfzz are allowed".to_string())
}

pub(crate) fn preferences_webview_url() -> tauri::WebviewUrl {
    #[cfg(debug_assertions)]
    {
        tauri::WebviewUrl::External("http://localhost:5175".parse().unwrap())
    }

    #[cfg(not(debug_assertions))]
    {
        tauri::WebviewUrl::App("preferences.html".into())
    }
}

pub(crate) fn open_command_for_platform() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        return "open";
    }
    #[cfg(target_os = "linux")]
    {
        return "xdg-open";
    }
    #[cfg(target_os = "windows")]
    {
        return "explorer";
    }
    #[allow(unreachable_code)]
    "open"
}

pub(crate) fn build_open_command(path: &str) -> Command {
    let mut command = Command::new(open_command_for_platform());
    command.arg(path);
    command
}

pub(crate) fn open_path_with_command(path: &str) -> Result<(), String> {
    validate_open_path_target(path)?;
    build_open_command(path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn agent_health(
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<HealthStatus, String> {
    Ok(HealthStatus {
        status: if registry.supervised.check_health("agentscope").await {
            "connected"
        } else {
            "disconnected"
        }
        .into(),
    })
}

pub(crate) fn focus_existing_preferences_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("preferences") {
        window
            .show()
            .map_err(|e: tauri::Error| e.to_string())?;
        window
            .set_focus()
            .map_err(|e: tauri::Error| e.to_string())?;
        return Ok(true);
    }

    Ok(false)
}

pub(crate) fn build_preferences_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    use tauri::WebviewWindowBuilder;

    WebviewWindowBuilder::new(app, "preferences", preferences_webview_url())
        .title("Snapfzz Preferences")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn open_preferences<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    if focus_existing_preferences_window(&app)? {
        return Ok(());
    }

    build_preferences_window(&app)
}

#[tauri::command]
pub async fn open_path(path: String) -> Result<(), String> {
    open_path_with_command(&path)
}

#[tauri::command]
pub async fn pick_folder(default_path: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(path) = default_path {
        dialog = dialog.set_directory(path);
    }
    Ok(dialog.pick_folder().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn preflight_status(
    timings: tauri::State<'_, Vec<PhaseTimingDto>>,
) -> Result<Vec<PhaseTimingDto>, String> {
    Ok(timings.inner().clone())
}

#[cfg(test)]
mod tests {
    use snapfzz_kernel::boot::PhaseTimingDto;
    use snapfzz_kernel::budget::{preset::PresetName, BudgetRegistry};
    use std::sync::{Arc, Mutex as StdMutex, OnceLock};
    use tauri::{
        test::{mock_builder, mock_context, noop_assets},
        Manager,
    };

    fn env_lock() -> &'static StdMutex<()> {
        static LOCK: OnceLock<StdMutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| StdMutex::new(()))
    }

    #[test]
    fn a014_commands_system_agent_health_reports_disconnected_without_process() {
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Performance));
        let app = mock_builder()
            .manage(registry)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let status = tauri::async_runtime::block_on(super::agent_health(
            app.state::<Arc<BudgetRegistry>>(),
        ))
        .expect("agent_health response");

        let value = serde_json::to_value(status).expect("serialize health");
        assert_eq!(value.get("status").and_then(|v| v.as_str()), Some("disconnected"));
    }

    #[tokio::test]
    async fn a014_commands_system_agent_health_reports_connected_for_healthy_runtime() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind health listener");
        let addr = listener.local_addr().expect("listener address");
        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buf = [0_u8; 1024];
                let _ = socket.read(&mut buf).await;
                let _ = socket
                    .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK")
                    .await;
                let _ = socket.shutdown().await;
            }
        });

        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Performance));
        registry.register_process(
            "agentscope",
            snapfzz_kernel::budget::supervised::ProcessBudget {
                pid: None,
                max_memory_mb: 512,
                health_url: format!("http://{addr}/health"),
                health_interval_ms: 1000,
                max_health_failures: 3,
                max_restarts: 3,
                location: snapfzz_kernel::budget::supervised::ProcessLocation::Local,
                consecutive_failures: 0,
                restart_count: 0,
                status: snapfzz_kernel::budget::metrics::ProcessStatus::Starting,
                started_at: None,
                owner: "system".to_string(),
            },
        );

        let app = mock_builder()
            .manage(registry)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let status = super::agent_health(app.state::<Arc<BudgetRegistry>>())
            .await
            .expect("agent health");
        let value = serde_json::to_value(status).expect("serialize health");
        assert_eq!(value.get("status").and_then(|v| v.as_str()), Some("connected"));
    }

    #[test]
    fn a014_commands_system_open_path_and_preflight_status_cover_results() {
        let timings = vec![PhaseTimingDto {
            phase: 1,
            name: "filesystem".to_string(),
            duration_ms: 12,
            status: "ok".to_string(),
            detail: None,
        }];

        let app = mock_builder()
            .manage(timings.clone())
            .build(mock_context(noop_assets()))
            .expect("build app");

        let open_error = tauri::async_runtime::block_on(super::open_path(
            "/tmp/outside-snapfzz-root".to_string(),
        ))
        .expect_err("open_path should reject outside root");
        assert_eq!(open_error, "Only URLs or paths under ~/.snapfzz are allowed");

        let preflight = tauri::async_runtime::block_on(super::preflight_status(
            app.state::<Vec<PhaseTimingDto>>(),
        ))
        .expect("preflight response");
        assert_eq!(preflight.len(), 1);
        assert_eq!(preflight[0].name, "filesystem");
    }

    #[test]
    fn a014_commands_system_preflight_status_returns_managed_timings() {
        let timings = vec![
            PhaseTimingDto {
                phase: 1,
                name: "filesystem".to_string(),
                duration_ms: 12,
                status: "ok".to_string(),
                detail: None,
            },
            PhaseTimingDto {
                phase: 2,
                name: "budget".to_string(),
                duration_ms: 8,
                status: "ok".to_string(),
                detail: Some("configured".to_string()),
            },
        ];

        let app = mock_builder()
            .manage(timings)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let preflight = tauri::async_runtime::block_on(super::preflight_status(
            app.state::<Vec<PhaseTimingDto>>(),
        ))
        .expect("preflight response");

        assert_eq!(preflight.len(), 2);
        assert_eq!(preflight[1].name, "budget");
        assert_eq!(preflight[1].detail.as_deref(), Some("configured"));
    }

    #[test]
    fn a014_commands_system_open_path_accepts_https_url() {
        let result = tauri::async_runtime::block_on(super::open_path(
            "https://snapfzz.com".to_string(),
        ));
        assert!(result.is_ok());
    }

    #[test]
    fn a014_commands_system_resolve_open_target_expands_tilde_paths() {
        let home = dirs::home_dir().unwrap_or_default();
        let resolved = super::resolve_open_target("~/snapfzz-test-target").expect("resolve path");
        assert!(resolved.starts_with(home));
        assert!(resolved.ends_with("snapfzz-test-target"));
    }

    #[test]
    fn a014_commands_system_resolve_open_target_returns_error_for_missing_relative_parent() {
        let result = super::resolve_open_target("definitely-missing-dir/child");
        assert!(result.is_err());
    }

    #[test]
    fn a014_commands_system_validate_open_path_target_accepts_https_and_http() {
        assert!(super::validate_open_path_target("https://snapfzz.com").is_ok());
        assert!(super::validate_open_path_target("http://localhost:5173").is_ok());
    }

    #[test]
    fn a014_commands_system_validate_open_path_target_rejects_non_snapfzz_paths() {
        let result = super::validate_open_path_target("/tmp/outside-snapfzz-root");
        assert!(result.is_err());
        assert_eq!(
            result.expect_err("must reject"),
            "Only URLs or paths under ~/.snapfzz are allowed"
        );
    }

    #[test]
    fn a014_commands_system_validate_open_path_target_allows_snapfzz_subpaths() {
        let _guard = env_lock().lock().expect("env lock");
        let temp_home = tempfile::tempdir().expect("temp home");
        let previous_home = std::env::var("HOME").ok();
        unsafe { std::env::set_var("HOME", temp_home.path()) };

        let allowed_file = temp_home.path().join(".snapfzz").join("logs").join("agent.log");
        std::fs::create_dir_all(allowed_file.parent().expect("parent dir")).expect("create parent");
        std::fs::write(&allowed_file, "ok").expect("write allowed file");

        let result = super::validate_open_path_target(&allowed_file.to_string_lossy());

        match previous_home {
            Some(value) => unsafe { std::env::set_var("HOME", value) },
            None => unsafe { std::env::remove_var("HOME") },
        }

        assert!(result.is_ok());
    }

    #[test]
    fn a014_commands_system_snapfzz_home_uses_home_directory() {
        let home = dirs::home_dir().unwrap_or_default();
        let snapfzz_home = super::snapfzz_home();
        assert!(snapfzz_home.starts_with(home));
        assert!(snapfzz_home.ends_with(".snapfzz"));
    }

    #[test]
    fn a014_commands_system_validate_open_path_target_rejects_file_url() {
        let result = super::validate_open_path_target("file:///etc/passwd");
        assert!(result.is_err());
    }

    #[test]
    fn a014_commands_system_resolve_open_target_returns_parent_for_missing_leaf() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("child-that-does-not-exist");

        let resolved = super::resolve_open_target(&path.to_string_lossy()).expect("resolve target");
        assert_eq!(resolved.file_name().and_then(|name| name.to_str()), Some("child-that-does-not-exist"));
        assert!(resolved.parent().expect("resolved parent").exists());
    }

    #[test]
    fn a014_commands_system_resolve_open_target_uses_absolute_path() {
        let resolved = super::resolve_open_target("/etc/hosts").expect("resolve absolute path");
        assert!(resolved.is_absolute());
    }

    #[test]
    fn a014_commands_system_health_status_serializes() {
        let status = super::HealthStatus {
            status: "connected".to_string(),
        };
        let json = serde_json::to_value(&status).expect("serialize health status");
        assert_eq!(json["status"], "connected");
    }

    #[test]
    fn a014_commands_system_open_command_for_platform_matches_runtime_target() {
        let cmd = super::open_command_for_platform();
        #[cfg(target_os = "macos")]
        assert_eq!(cmd, "open");
        #[cfg(target_os = "linux")]
        assert_eq!(cmd, "xdg-open");
        #[cfg(target_os = "windows")]
        assert_eq!(cmd, "explorer");
    }

    #[test]
    fn a014_commands_system_build_open_command_binds_path_argument() {
        let path = "https://snapfzz.com";
        let command = super::build_open_command(path);
        let program = command.get_program().to_string_lossy().to_string();
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();

        assert!(program.contains(super::open_command_for_platform()));
        assert_eq!(args, vec![path.to_string()]);
    }

    #[test]
    fn a014_commands_system_open_path_with_command_rejects_invalid_targets() {
        let err = super::open_path_with_command("/tmp/outside-snapfzz-root")
            .expect_err("outside root should fail");
        assert_eq!(err, "Only URLs or paths under ~/.snapfzz are allowed");
    }

    #[test]
    fn a014_commands_system_open_path_with_command_accepts_http_urls() {
        let result = super::open_path_with_command("https://snapfzz.com");
        assert!(result.is_ok());
    }

    #[test]
    fn a014_commands_system_build_preferences_window_creates_preferences_window() {
        let app = mock_builder()
            .build(mock_context(noop_assets()))
            .expect("build app");

        super::build_preferences_window(app.handle()).expect("build preferences window");
        assert!(app.get_webview_window("preferences").is_some());
    }

    #[test]
    fn a014_commands_system_preferences_webview_url_uses_expected_target() {
        let url = super::preferences_webview_url();
        match url {
            #[cfg(debug_assertions)]
            tauri::WebviewUrl::External(url) => {
                assert!(url.as_str().contains("localhost:5175"));
            }
            #[cfg(not(debug_assertions))]
            tauri::WebviewUrl::App(path) => {
                assert_eq!(path.to_string_lossy(), "preferences.html");
            }
            other => panic!("unexpected webview url: {other:?}"),
        }
    }

    #[test]
    fn a014_commands_system_focus_existing_preferences_window_returns_false_without_window() {
        let app = mock_builder()
            .build(mock_context(noop_assets()))
            .expect("build app");

        let focused = super::focus_existing_preferences_window(app.handle())
            .expect("focus should not fail");
        assert!(!focused);
    }

    #[test]
    fn a014_commands_system_open_preferences_builds_window_when_missing() {
        let app = mock_builder()
            .build(mock_context(noop_assets()))
            .expect("build app");

        tauri::async_runtime::block_on(super::open_preferences(app.handle().clone()))
            .expect("open preferences should succeed");

        assert!(app.get_webview_window("preferences").is_some());
    }
}
