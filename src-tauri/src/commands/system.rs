use serde::Serialize;
use snapfzz_kernel::boot::PhaseTimingDto;
use snapfzz_kernel::budget::BudgetRegistry;
use std::path::PathBuf;
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
    let allowed_root = snapfzz_root.canonicalize().unwrap_or(snapfzz_root);

    if target.starts_with(&allowed_root) {
        return Ok(());
    }

    Err("Only URLs or paths under ~/.snapfzz are allowed".to_string())
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

#[tauri::command]
pub async fn open_preferences(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    if let Some(window) = app.get_webview_window("preferences") {
        window
            .show()
            .map_err(|e: tauri::Error| e.to_string())?;
        window
            .set_focus()
            .map_err(|e: tauri::Error| e.to_string())?;
        return Ok(());
    }

    let url = if cfg!(debug_assertions) {
        WebviewUrl::External("http://localhost:5175".parse().unwrap())
    } else {
        WebviewUrl::App("preferences.html".into())
    };

    WebviewWindowBuilder::new(&app, "preferences", url)
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
pub async fn open_path(path: String) -> Result<(), String> {
    validate_open_path_target(&path)?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
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
