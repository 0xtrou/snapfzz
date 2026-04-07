use serde_json::json;
use snapfzz_kernel::settings::{Settings, SettingsManager};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Emitter;

use crate::helpers;

#[tauri::command]
pub async fn get_settings(
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
) -> Result<Settings, String> {
    settings_mgr.load().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_settings(
    app: tauri::AppHandle,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
    settings: Settings,
) -> Result<(), String> {
    settings_mgr.save(&settings).map_err(|e| e.to_string())?;
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

    let pointer_path = dirs::home_dir()
        .unwrap_or_default()
        .join(".snapfzz")
        .join("pointer.json");
    if let Some(parent) = pointer_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::write(
        pointer_path,
        serde_json::to_string_pretty(&json!({"dataDir": new_path})).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn a014_commands_settings_module_exports_getters_and_setters() {
        let _get_settings = super::get_settings;
        let _save_settings = super::save_settings;
        let _get_data_dir = super::get_data_dir;
        let _set_data_dir = super::set_data_dir;
    }
}
