use std::path::PathBuf;
use std::sync::Arc;

use snapfzz_kernel::settings::SettingsManager;
use snapfzz_packs::{detect_platform, PlatformInfo, PythonRuntime, PythonRuntimeStatus};
use tauri::State;

fn get_runtime_dir(_settings: &State<'_, Arc<SettingsManager>>) -> PathBuf {
    dirs::home_dir()
        .map(|h| h.join(".snapfzz").join("runtime"))
        .unwrap_or_else(|| PathBuf::from("~/.snapfzz/runtime"))
}

fn detect_runtime_platform() -> Result<PlatformInfo, String> {
    detect_platform().map_err(|e| format!("Platform detection failed: {}", e))
}

fn runtime_for(settings: &State<'_, Arc<SettingsManager>>) -> Result<PythonRuntime, String> {
    let runtime_dir = get_runtime_dir(settings);
    let platform = detect_runtime_platform()?;
    Ok(PythonRuntime::new(runtime_dir, platform))
}

#[tauri::command]
pub async fn python_pack_install_all(
    settings: State<'_, Arc<SettingsManager>>,
) -> Result<String, String> {
    let runtime = runtime_for(&settings)?;
    runtime
        .install_all_packages()
        .map_err(|e| e.to_string())?;

    let status = runtime.status();
    if status.agentscope.is_installed
        && status.agentscope_runtime.is_installed
        && status.litellm.is_installed
    {
        Ok("Python runtime and package ecosystem installed".to_string())
    } else {
        Err("Python runtime install completed but one or more packages are missing".to_string())
    }
}

#[tauri::command]
pub async fn python_runtime_status(
    settings: State<'_, Arc<SettingsManager>>,
) -> Result<PythonRuntimeStatus, String> {
    let runtime = runtime_for(&settings)?;
    Ok(runtime.status())
}
