use std::path::PathBuf;

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

pub fn validate_open_path_target(path: &str) -> Result<(), String> {
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
