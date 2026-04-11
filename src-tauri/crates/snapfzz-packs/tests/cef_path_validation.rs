use snapfzz_packs::cef::download::CefDownloader;

fn validate_runtime_path(path: &std::path::Path, expected_subdir: &str) {
    let home = dirs::home_dir().expect("home directory");
    let snapfzz_runtime = home.join(".snapfzz").join("runtime");

    assert!(
        path.starts_with(&snapfzz_runtime),
        "Path {:?} must be under ~/.snapfzz/runtime",
        path
    );

    let relative = path
        .strip_prefix(&snapfzz_runtime)
        .expect("path should be under snapfzz/runtime");
    let first_component = relative
        .components()
        .next()
        .expect("should have subdirectory");
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
fn t32_paths_cef_installs_under_runtime_cef() {
    let home = dirs::home_dir().expect("home directory");
    let runtime_dir = home.join(".snapfzz").join("runtime");
    let cef_dir = runtime_dir.join("cef");

    let cef = CefDownloader::new(cef_dir.clone(), "macos-arm64".to_string());

    validate_runtime_path(cef.install_dir(), "cef");
}
