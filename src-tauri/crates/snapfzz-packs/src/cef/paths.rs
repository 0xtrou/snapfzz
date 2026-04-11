use std::path::PathBuf;

use crate::cef::types::CefError;

fn platform_base_dir(home: &PathBuf) -> PathBuf {
    if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support")
    } else if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData").join("Roaming"))
    } else {
        home.join(".local").join("share")
    }
}

fn runtime_cef_dir(base_dir: PathBuf) -> PathBuf {
    base_dir.join("snapfzz").join("runtime").join("cef")
}

pub fn cef_data_dir() -> Result<PathBuf, CefError> {
    let home = dirs::home_dir().ok_or_else(|| CefError::internal("home directory unavailable"))?;
    Ok(runtime_cef_dir(platform_base_dir(&home)))
}

pub fn cef_binary_path() -> Result<PathBuf, CefError> {
    Ok(cef_data_dir()?.join("cef_binary"))
}

pub fn cef_cache_path() -> Result<PathBuf, CefError> {
    Ok(cef_data_dir()?.join("cache"))
}

pub fn ensure_cef_dirs() -> Result<PathBuf, CefError> {
    let dir = cef_data_dir()?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| CefError::internal(&format!("create cef dir: {e}")))?;
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{cef_binary_path, cef_cache_path, cef_data_dir, ensure_cef_dirs};

    #[test]
    fn a015_paths_platform_data_dir_matches_os_convention() {
        let path = cef_data_dir().expect("data dir should resolve");
        let rendered = path.to_string_lossy().replace('\\', "/");

        if cfg!(target_os = "macos") {
            assert!(rendered.contains("/Library/Application Support/snapfzz/runtime/cef"));
        } else if cfg!(target_os = "windows") {
            assert!(rendered.ends_with("/snapfzz/runtime/cef"));
            assert!(rendered.contains("AppData") || rendered.contains("APPDATA"));
        } else {
            assert!(rendered.contains("/.local/share/snapfzz/runtime/cef"));
        }
    }

    #[test]
    fn a015_paths_binary_and_cache_paths_are_nested_under_cef_data_dir() {
        let base = cef_data_dir().expect("base dir should resolve");
        assert_eq!(
            cef_binary_path().expect("binary path"),
            base.join("cef_binary")
        );
        assert_eq!(cef_cache_path().expect("cache path"), base.join("cache"));
    }

    #[test]
    fn a015_paths_ensure_cef_dirs_creates_target_directory() {
        let dir = ensure_cef_dirs().expect("ensure dir should work");
        assert!(dir.exists());
        assert!(dir.is_dir());
    }

    #[test]
    fn a015_paths_runtime_cef_dir_appends_snapfzz_runtime_cef() {
        let base = PathBuf::from("/tmp/snapfzz-tests");
        let full = super::runtime_cef_dir(base.clone());
        assert_eq!(full, base.join("snapfzz").join("runtime").join("cef"));
    }

    #[test]
    fn a015_paths_platform_base_dir_appends_local_share_on_unix_like_targets() {
        let home = PathBuf::from("/Users/example");
        let base = super::platform_base_dir(&home);

        if cfg!(target_os = "macos") {
            assert_eq!(base, home.join("Library").join("Application Support"));
        } else if cfg!(target_os = "windows") {
            let rendered = base.to_string_lossy();
            assert!(rendered.contains("AppData") || rendered.contains("APPDATA"));
        } else {
            assert_eq!(base, home.join(".local").join("share"));
        }
    }
}
