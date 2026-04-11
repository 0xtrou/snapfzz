use snapfzz_cef::paths::cef_data_dir;

#[test]
fn t32_paths_cef_data_dir_resolves_under_platform_convention() {
    let path = cef_data_dir().expect("cef_data_dir should resolve");
    let rendered = path.to_string_lossy().replace('\\', "/");

    // The path must end with snapfzz/runtime/cef regardless of platform.
    assert!(
        rendered.ends_with("snapfzz/runtime/cef"),
        "cef_data_dir should end with snapfzz/runtime/cef, got: {rendered}"
    );

    if cfg!(target_os = "macos") {
        assert!(
            rendered.contains("/Library/Application Support/"),
            "macOS path should go through Library/Application Support, got: {rendered}"
        );
    } else if cfg!(target_os = "windows") {
        assert!(
            rendered.contains("AppData") || rendered.contains("APPDATA"),
            "Windows path should go through AppData, got: {rendered}"
        );
    } else {
        assert!(
            rendered.contains("/.local/share/"),
            "Linux path should go through .local/share, got: {rendered}"
        );
    }
}
