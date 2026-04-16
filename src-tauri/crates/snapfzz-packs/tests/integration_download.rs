use snapfzz_packs::{detect_platform, DownloadStatus, SystemComponent, UvDownloader};

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
