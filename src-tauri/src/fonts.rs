use std::fs;
use std::path::PathBuf;

use crate::helpers;

fn fonts_dir() -> std::path::PathBuf {
    helpers::resolve_data_dir().join("fonts")
}

#[tauri::command]
pub async fn install_font_from_url(url: String, name: String) -> Result<String, String> {
    if !url.starts_with("https://") {
        return Err("Only https:// font URLs are allowed".to_string());
    }

    fs::create_dir_all(fonts_dir()).map_err(|e| e.to_string())?;
    let bytes = reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let ext = if url.contains(".woff2") {
        "woff2"
    } else if url.contains(".woff") {
        "woff"
    } else if url.contains(".otf") {
        "otf"
    } else {
        "ttf"
    };
    let path = fonts_dir().join(format!("{name}.{ext}"));
    fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn install_font_from_file(source_path: String, name: String) -> Result<String, String> {
    fs::create_dir_all(fonts_dir()).map_err(|e| e.to_string())?;
    let source = PathBuf::from(source_path);
    let dest = fonts_dir().join(format!(
        "{name}.{}",
        source
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("ttf")
    ));
    fs::copy(&source, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn list_installed_fonts() -> Result<Vec<String>, String> {
    let dir = fonts_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut names = vec![];
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let name = entry
            .map_err(|e| e.to_string())?
            .file_name()
            .to_string_lossy()
            .to_string();
        if let Some(stem) = name.split('.').next() {
            if !stem.is_empty() {
                names.push(stem.to_string());
            }
        }
    }

    Ok(names)
}

#[tauri::command]
pub async fn remove_font(name: String) -> Result<(), String> {
    let dir = fonts_dir();
    if !dir.exists() {
        return Err("Fonts directory does not exist".to_string());
    }

    let mut removed_any = false;
    for ext in ["ttf", "otf", "woff", "woff2"] {
        let path = dir.join(format!("{name}.{ext}"));
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
            removed_any = true;
        }
    }

    if !removed_any {
        return Err(format!("No font found with name '{name}'"));
    }

    Ok(())
}

