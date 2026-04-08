use snapfzz_kernel::settings::SettingsManager;
use std::path::PathBuf;
use std::process::Command;
use tauri::State;

#[tauri::command]
pub async fn python_pip_install_packages(
    packages: Vec<String>,
    settings: State<'_, SettingsManager>,
) -> Result<String, String> {
    let settings_guard = settings.read().await;
    let runtime_dir = settings_guard
        .get("runtime_dir")
        .and_then(|v| v.as_str())
        .unwrap_or("~/.snapfzz/runtime");
    
    let runtime_path = shellexpand::tilde(runtime_dir).to_string();
    let python_bin = PathBuf::from(&runtime_path)
        .join("bin")
        .join("python");
    
    if !python_bin.exists() {
        return Err("Python not installed. Please install Python first.".to_string());
    }
    
    // Use uv pip to install packages
    let uv_bin = PathBuf::from(&runtime_path)
        .join("bin")
        .join("uv");
    
    let output = Command::new(&uv_bin)
        .arg("pip")
        .arg("install")
        .args(&packages)
        .env("PATH", format!("{}/bin:{}", runtime_path, std::env::var("PATH").unwrap_or_default()))
        .output()
        .map_err(|e| format!("Failed to run uv pip: {}", e))?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format!(
            "pip install failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}
