use snapfzz_packs::{detect_platform, versions, DownloadStatus, SystemComponent, UvDownloader, PythonDownloader};

fn validate_runtime_path(path: &std::path::Path, expected_subdir: &str) {
    let home = dirs::home_dir().expect("home directory");
    let snapfzz_runtime = home.join(".snapfzz").join("runtime");
    
    assert!(
        path.starts_with(&snapfzz_runtime),
        "Path {:?} must be under ~/.snapfzz/runtime",
        path
    );
    
    let relative = path.strip_prefix(&snapfzz_runtime).expect("path should be under snapfzz/runtime");
    let first_component = relative.components().next().expect("should have subdirectory");
    let first_dir = first_component.as_os_str().to_string_lossy();
    
    assert!(
        first_dir == expected_subdir,
        "Path {:?} must be under ~/.snapfzz/runtime/{}, got ~/.snapfzz/runtime/{}",
        path,
        expected_subdir,
        first_dir
    );
}

#[test]
fn t32_paths_uv_installs_under_runtime_python() {
    let home = dirs::home_dir().expect("home directory");
    let runtime_dir = home.join(".snapfzz").join("runtime");
    let python_bin_dir = runtime_dir.join("python").join("bin");
    
    let platform = detect_platform().expect("supported platform");
    let uv = UvDownloader::new(python_bin_dir.clone(), platform);
    
    validate_runtime_path(uv.install_dir(), "python");
    validate_runtime_path(&uv.binary_path().parent().unwrap().to_path_buf(), "python");
}

#[test]
fn t32_paths_python_installs_under_runtime_python() {
    let home = dirs::home_dir().expect("home directory");
    let runtime_dir = home.join(".snapfzz").join("runtime");
    let python_bin_dir = runtime_dir.join("python").join("bin");
    let uv_bin = python_bin_dir.join("uv");
    let python_install_dir = python_bin_dir.join("python");
    
    let platform = detect_platform().expect("supported platform");
    let python = PythonDownloader::new(
        uv_bin,
        python_install_dir.clone(),
        platform,
        versions::PYTHON.to_string(),
    );
    
    validate_runtime_path(python.install_dir(), "python");
}

#[tokio::test]
async fn test_uv_download_actually_works() {
    let temp_dir = tempfile::tempdir().expect("tempdir");
    let platform = detect_platform().expect("supported platform");
    let uv = UvDownloader::new(temp_dir.path().to_path_buf(), platform.clone());

    let progress = uv.download().await.expect("uv download should succeed");

    assert!(
        progress.iter().any(|event| event.status == DownloadStatus::Ready),
        "uv download should report ready status"
    );

    let binary_path = temp_dir
        .path()
        .join(format!("uv{}", platform.exe_suffix));
    assert!(
        binary_path.exists(),
        "uv binary should exist at {:?}",
        binary_path
    );
    assert!(binary_path.is_file(), "uv binary should be a file");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(&binary_path).expect("uv metadata");
        let mode = metadata.permissions().mode();
        assert!(mode & 0o111 != 0, "uv should be executable, mode={mode:o}");
    }

    let version = uv.verify().await.expect("uv verify should succeed");
    assert!(version.starts_with("uv "), "unexpected uv version output: {version}");
}

#[tokio::test]
async fn test_python_install_via_uv_registers_with_uv() {
    // PythonDownloader uses `uv python install` which manages Python in uv's cache,
    // not in a custom install_dir. This test verifies that after install:
    // 1. is_installed() returns true (uv can find the Python version)
    // 2. verify() returns the Python path from uv's managed cache
    let temp_dir = tempfile::tempdir().expect("tempdir");
    let platform = detect_platform().expect("supported platform");
    let uv = UvDownloader::new(temp_dir.path().join("bin"), platform.clone());

    uv.download().await.expect("uv download should succeed");

    let python_version = versions::PYTHON.to_string();
    // install_dir is stored but uv manages Python in its own cache
    let python_install_dir = temp_dir.path().join("python");
    let python = PythonDownloader::new(
        uv.binary_path(),
        python_install_dir.clone(),
        platform,
        python_version.clone(),
    );

    let progress = python
        .download()
        .await
        .expect("python install via uv should succeed");

    assert!(
        progress.iter().any(|event| event.status == DownloadStatus::Ready),
        "python install should report ready status"
    );

    // is_installed() checks if uv can find the installed Python version
    assert!(
        python.is_installed(),
        "python should be discoverable via uv python find after install"
    );

    // verify() returns the Python path from uv's managed cache
    let python_path = python.verify().await.expect("python verify should succeed");
    assert!(
        python_path.contains("cpython-") 
            && python_path.contains("/bin/python"),
        "verify should return a Python binary path in the cpython install directory, got: {python_path}"
    );
}
