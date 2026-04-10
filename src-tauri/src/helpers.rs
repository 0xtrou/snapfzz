use serde::Serialize;
use snapfzz_kernel::boot::{OnPreflightReady, PreflightContext, PreflightError};
use snapfzz_kernel::settings::SettingsManager;
use std::fs;
use std::path::PathBuf;
use tauri::Emitter;

fn snapfzz_home() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".snapfzz")
}

pub(crate) fn resolve_data_dir_from(home: PathBuf) -> PathBuf {
    let pointer_path = home.join("pointer.json");
    if !pointer_path.exists() {
        return home;
    }

    if let Ok(content) = fs::read_to_string(&pointer_path) {
        if let Ok(pointer) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(dir) = pointer.get("dataDir").and_then(|v| v.as_str()) {
                let custom = PathBuf::from(dir);
                if custom.exists() {
                    return custom;
                }
            }
        }
    }

    home
}

pub fn resolve_data_dir() -> PathBuf {
    resolve_data_dir_from(snapfzz_home())
}

pub fn agentscope_base_url(settings_mgr: &SettingsManager) -> String {
    let settings = settings_mgr.load().unwrap_or_default();
    let host = if settings.agentscope_host.is_empty() {
        "127.0.0.1".to_string()
    } else {
        settings.agentscope_host
    };
    let port: u16 = if settings.agentscope_port.is_empty() {
        8090
    } else {
        settings.agentscope_port.parse().unwrap_or(8090)
    };
    format!("http://{host}:{port}")
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SupervisorEvent {
    event_type: String,
    process: String,
    message: String,
    timestamp: u64,
}

fn build_supervisor_event(event_type: &str, process: &str, message: String) -> SupervisorEvent {
    SupervisorEvent {
        event_type: event_type.into(),
        process: process.into(),
        message,
        timestamp: now_ms(),
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn emit_supervisor<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    event_type: &str,
    process: &str,
    message: String,
) {
    let _ = app.emit(
        "supervisor-event",
        build_supervisor_event(event_type, process, message),
    );
}

pub struct BootLogger;

impl OnPreflightReady for BootLogger {
    fn on_preflight_ready(&self, ctx: &PreflightContext) -> Result<(), PreflightError> {
        let preset = ctx.registry().preset.read().unwrap();
        eprintln!(
            "[preflight] Ready: preset={}, data_dir={}",
            preset.name,
            ctx.data_dir.display()
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use snapfzz_kernel::{
        budget::{preset::PresetName, BudgetRegistry},
        settings::Settings,
    };
    use std::sync::{Arc, Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn a004_persistence_resolve_data_dir_returns_default_when_no_pointer_exists() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        assert_eq!(resolve_data_dir_from(home.clone()), home);
    }

    #[test]
    fn a004_persistence_resolve_data_dir_reads_custom_path_from_pointer_json() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        let custom = tmp.path().join("custom_data");
        fs::create_dir_all(&custom).unwrap();
        fs::write(
            home.join("pointer.json"),
            serde_json::to_string(&serde_json::json!({"dataDir": custom.to_str().unwrap()}))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(resolve_data_dir_from(home), custom);
    }

    #[test]
    fn a004_persistence_resolve_data_dir_falls_back_when_pointer_path_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        fs::write(
            home.join("pointer.json"),
            serde_json::to_string(&serde_json::json!({"dataDir": "/this/path/does/not/exist/xyz"}))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(resolve_data_dir_from(home.clone()), home);
    }

    #[test]
    fn a004_persistence_resolve_data_dir_falls_back_when_pointer_is_corrupt() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        fs::write(home.join("pointer.json"), "not { valid json").unwrap();
        assert_eq!(resolve_data_dir_from(home.clone()), home);
    }

    #[test]
    fn a004_persistence_resolve_data_dir_falls_back_when_pointer_json_has_no_data_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        fs::write(
            home.join("pointer.json"),
            serde_json::to_string(&serde_json::json!({"other": "value"})).unwrap(),
        )
        .unwrap();

        assert_eq!(resolve_data_dir_from(home.clone()), home);
    }

    #[test]
    fn a014_helpers_agentscope_base_url_uses_defaults_when_host_or_port_invalid() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = SettingsManager::new(tmp.path().to_path_buf());
        let mut settings = Settings::default();
        settings.agentscope_host = String::new();
        settings.agentscope_port = "invalid-port".to_string();
        mgr.save(&settings).unwrap();

        assert_eq!(agentscope_base_url(&mgr), "http://127.0.0.1:8090");
    }

    #[test]
    fn a014_helpers_agentscope_base_url_honors_configured_host_and_port() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = SettingsManager::new(tmp.path().to_path_buf());
        let mut settings = Settings::default();
        settings.agentscope_host = "0.0.0.0".to_string();
        settings.agentscope_port = "9150".to_string();
        mgr.save(&settings).unwrap();

        assert_eq!(agentscope_base_url(&mgr), "http://0.0.0.0:9150");
    }

    #[test]
    fn a014_helpers_resolve_data_dir_uses_snapfzz_home_pointer_when_present() {
        let _guard = env_lock().lock().unwrap();
        let temp_home = tempfile::tempdir().unwrap();
        let previous_home = std::env::var("HOME").ok();
        unsafe {
            std::env::set_var("HOME", temp_home.path());
        }

        let snapfzz_home = temp_home.path().join(".snapfzz");
        std::fs::create_dir_all(&snapfzz_home).unwrap();
        let custom = temp_home.path().join("custom-data-home");
        std::fs::create_dir_all(&custom).unwrap();

        std::fs::write(
            snapfzz_home.join("pointer.json"),
            serde_json::to_string(&serde_json::json!({"dataDir": custom.to_string_lossy()}))
                .unwrap(),
        )
        .unwrap();

        assert_eq!(resolve_data_dir(), custom);

        match previous_home {
            Some(value) => unsafe { std::env::set_var("HOME", value) },
            None => unsafe { std::env::remove_var("HOME") },
        }
    }

    #[test]
    fn a014_helpers_resolve_data_dir_from_falls_back_when_pointer_content_is_unreadable() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        let pointer_dir = home.join("pointer.json");
        std::fs::create_dir_all(&pointer_dir).unwrap();

        assert_eq!(resolve_data_dir_from(home.clone()), home);
    }

    #[test]
    fn a014_helpers_snapfzz_home_uses_current_home_directory() {
        let _guard = env_lock().lock().unwrap();
        let temp_home = tempfile::tempdir().unwrap();
        let previous_home = std::env::var("HOME").ok();
        unsafe {
            std::env::set_var("HOME", temp_home.path());
        }

        let resolved = super::snapfzz_home();

        match previous_home {
            Some(value) => unsafe { std::env::set_var("HOME", value) },
            None => unsafe { std::env::remove_var("HOME") },
        }

        assert_eq!(resolved, temp_home.path().join(".snapfzz"));
    }

    #[test]
    fn a014_helpers_now_ms_returns_positive_timestamp() {
        assert!(super::now_ms() > 0);
    }

    #[test]
    fn a014_helpers_agentscope_base_url_uses_default_host_with_custom_numeric_port() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = SettingsManager::new(tmp.path().to_path_buf());
        let mut settings = Settings::default();
        settings.agentscope_host = String::new();
        settings.agentscope_port = "9002".to_string();
        mgr.save(&settings).unwrap();

        assert_eq!(agentscope_base_url(&mgr), "http://127.0.0.1:9002");
    }

    #[test]
    fn a014_helpers_build_supervisor_event_sets_expected_fields() {
        let event = super::build_supervisor_event(
            "success",
            "agentscope",
            "AgentScope Runtime started successfully".to_string(),
        );

        let value = serde_json::to_value(&event).expect("serialize event");
        assert_eq!(value["eventType"], "success");
        assert_eq!(value["process"], "agentscope");
        assert_eq!(value["message"], "AgentScope Runtime started successfully");
        assert!(value["timestamp"].as_u64().unwrap_or_default() > 0);
    }

    #[test]
    fn a014_helpers_boot_logger_reports_ready_context() {
        let logger = BootLogger;
        let mut ctx = PreflightContext::new(std::path::PathBuf::from("/tmp/snapfzz"));
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Balanced));
        ctx.set_registry(registry);

        logger
            .on_preflight_ready(&ctx)
            .expect("boot logger should succeed");
    }
}
