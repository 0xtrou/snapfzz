use std::path::PathBuf;

use snapfzz_kernel::components::{DownloadStatus, SystemComponent};
use snapfzz_packs::{detect_platform, PythonComponent, UvComponent};

fn python_major_minor(version: &str) -> String {
    let mut parts = version.split('.');
    let major = parts.next().expect("python version major");
    let minor = parts.next().expect("python version minor");
    format!("{major}.{minor}")
}

fn find_python_binary(root: &std::path::Path) -> PathBuf {
    let mut stack = vec![root.to_path_buf()];
    while let Some(current) = stack.pop() {
        for entry in std::fs::read_dir(&current).expect("read python install dir") {
            let path = entry.expect("python install entry").path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }

            if path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| {
                    #[cfg(windows)]
                    {
                        name.eq_ignore_ascii_case("python.exe")
                    }
                    #[cfg(not(windows))]
                    {
                        name == "python" || name.starts_with("python3")
                    }
                })
            {
                return path;
            }
        }
    }

    panic!("python binary should exist under {:?}", root);
}

#[tokio::test]
async fn test_uv_download_actually_works() {
    let temp_dir = tempfile::tempdir().expect("tempdir");
    let platform = detect_platform().expect("supported platform");
    let uv = UvComponent::new(temp_dir.path().to_path_buf(), platform.clone());

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
async fn test_python_install_via_uv_writes_runtime_files() {
    let temp_dir = tempfile::tempdir().expect("tempdir");
    let platform = detect_platform().expect("supported platform");
    let uv = UvComponent::new(temp_dir.path().join("bin"), platform.clone());

    uv.download().await.expect("uv download should succeed");

    let python_version = "3.12".to_string();
    let python_install_dir = temp_dir.path().join("python");
    let python = PythonComponent::new(
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
    assert!(
        python_install_dir.exists(),
        "python install dir should exist at {:?}",
        python_install_dir
    );

    let python_binary = find_python_binary(&python_install_dir);
    assert!(python_binary.exists(), "python binary should exist at {:?}", python_binary);

    assert!(python.is_installed(), "python should be discoverable via uv after install");

    let expected_version_prefix = format!("Python {}", python_major_minor(&python_version));
    let version = python.verify().await.expect("python verify should succeed");
    assert!(
        version.starts_with(&expected_version_prefix),
        "unexpected python version output: {version}"
    );
}
