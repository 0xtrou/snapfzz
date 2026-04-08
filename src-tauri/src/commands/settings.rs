use serde_json::json;
use snapfzz_kernel::settings::{Settings, SettingsManager};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Emitter;

use crate::helpers;

pub(crate) fn do_save_settings(settings_mgr: &SettingsManager, settings: &Settings) -> Result<(), String> {
    settings_mgr.save(settings).map_err(|e| e.to_string())
}

pub(crate) fn pointer_path_from_home(home: PathBuf) -> PathBuf {
    home.join(".snapfzz").join("pointer.json")
}

pub(crate) fn build_data_dir_pointer(new_path: &str) -> Result<String, String> {
    serde_json::to_string_pretty(&json!({"dataDir": new_path})).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_settings(
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
) -> Result<Settings, String> {
    settings_mgr.load().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
    settings: Settings,
) -> Result<(), String> {
    do_save_settings(&settings_mgr, &settings)?;
    let _ = app.emit("settings-changed", ());
    Ok(())
}

#[tauri::command]
pub async fn get_data_dir() -> Result<String, String> {
    Ok(helpers::resolve_data_dir().to_string_lossy().to_string())
}

#[tauri::command]
pub async fn set_data_dir(new_path: String) -> Result<(), String> {
    std::fs::create_dir_all(PathBuf::from(&new_path)).map_err(|e| e.to_string())?;

    let pointer_path = pointer_path_from_home(dirs::home_dir().unwrap_or_default());
    if let Some(parent) = pointer_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::write(pointer_path, build_data_dir_pointer(&new_path)?)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex as StdMutex, OnceLock};
    use tauri::{test::{mock_builder, mock_context, noop_assets}, Manager};

    fn env_lock() -> &'static StdMutex<()> {
        static LOCK: OnceLock<StdMutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| StdMutex::new(()))
    }

    #[test]
    fn a014_commands_settings_do_save_settings_persists_values() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mgr = SettingsManager::new(temp.path().to_path_buf());
        let mut settings = Settings::default();
        settings.theme = "dark".to_string();
        settings.agentscope_host = "0.0.0.0".to_string();
        settings.agentscope_port = "9001".to_string();

        super::do_save_settings(&mgr, &settings).expect("save through pure helper");

        assert_eq!(mgr.load().expect("reload settings"), settings);
    }

    #[test]
    fn a014_commands_settings_pointer_helpers_generate_expected_json_and_path() {
        let home = PathBuf::from("/tmp/home-test");
        let pointer = super::pointer_path_from_home(home.clone());
        assert_eq!(pointer, home.join(".snapfzz").join("pointer.json"));

        let payload = super::build_data_dir_pointer("/tmp/custom-data").expect("pointer json");
        let parsed: serde_json::Value = serde_json::from_str(&payload).expect("parse payload");
        assert_eq!(parsed.get("dataDir").and_then(|v| v.as_str()), Some("/tmp/custom-data"));
    }

    #[test]
    fn a014_commands_settings_get_data_dir_returns_path_string() {
        let result = tauri::async_runtime::block_on(super::get_data_dir()).expect("get data dir");
        assert!(!result.is_empty());
    }

    #[test]
    fn a014_commands_settings_get_settings_returns_state_defaults() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mgr = Arc::new(SettingsManager::new(temp.path().to_path_buf()));
        let app = mock_builder()
            .manage(mgr)
            .build(mock_context(noop_assets()))
            .expect("build test app");

        let loaded = tauri::async_runtime::block_on(super::get_settings(
            app.state::<Arc<SettingsManager>>(),
        ))
        .expect("get settings should succeed");

        assert_eq!(loaded, Settings::default());
    }

    #[test]
    fn a014_commands_settings_save_settings_persists_values() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mgr = Arc::new(SettingsManager::new(temp.path().to_path_buf()));
        let app = mock_builder()
            .manage(mgr.clone())
            .build(mock_context(noop_assets()))
            .expect("build test app");

        let mut settings = Settings::default();
        settings.theme = "dark".to_string();
        settings.agentscope_host = "0.0.0.0".to_string();
        settings.agentscope_port = "9001".to_string();

        tauri::async_runtime::block_on(super::save_settings(
            app.handle().clone(),
            app.state::<Arc<SettingsManager>>(),
            settings.clone(),
        ))
        .expect("save settings should succeed");

        assert_eq!(mgr.load().expect("reload settings"), settings);
    }

    #[test]
    fn a014_commands_settings_set_data_dir_rejects_invalid_path() {
        let invalid_path = "/dev/null/snapfzz-not-a-dir";
        let result = tauri::async_runtime::block_on(super::set_data_dir(invalid_path.to_string()));
        assert!(result.is_err());
    }

    #[test]
    fn a014_commands_settings_set_data_dir_writes_pointer_on_success() {
        let _guard = env_lock().lock().expect("env lock");
        let temp_home = tempfile::tempdir().expect("temp home");
        let previous_home = std::env::var("HOME").ok();
        unsafe { std::env::set_var("HOME", temp_home.path()) };

        let new_data = temp_home.path().join("custom-data").join("nested");
        let result = tauri::async_runtime::block_on(super::set_data_dir(
            new_data.to_string_lossy().to_string(),
        ));

        match previous_home {
            Some(value) => unsafe { std::env::set_var("HOME", value) },
            None => unsafe { std::env::remove_var("HOME") },
        }

        assert!(result.is_ok());
        assert!(new_data.exists());

        let pointer_path = temp_home.path().join(".snapfzz").join("pointer.json");
        let pointer = std::fs::read_to_string(pointer_path).expect("read pointer");
        let parsed: serde_json::Value = serde_json::from_str(&pointer).expect("parse pointer");
        assert_eq!(
            parsed.get("dataDir").and_then(|v| v.as_str()),
            Some(new_data.to_string_lossy().as_ref())
        );
    }
}
