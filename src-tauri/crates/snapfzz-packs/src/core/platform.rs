use crate::core::component::ComponentError;

#[derive(Debug, Clone)]
pub struct PlatformInfo {
    pub os: &'static str,
    pub arch: &'static str,
    pub platform: String,
    pub display: &'static str,
    pub exe_suffix: &'static str,
    pub archive_ext: &'static str,
}

pub fn detect_platform() -> Result<PlatformInfo, ComponentError> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let exe_suffix = if os == "windows" { ".exe" } else { "" };
    let archive_ext = if os == "windows" { ".zip" } else { ".tar.gz" };

    let (platform, display) = match (os, arch) {
        ("macos", "aarch64") => ("macos-arm64", "macOS (Apple Silicon)"),
        ("macos", "x86_64") => ("macos-x64", "macOS (Intel)"),
        ("linux", "x86_64") => ("linux-x64", "Linux (x86_64)"),
        ("linux", "aarch64") => ("linux-arm64", "Linux (ARM64)"),
        ("windows", "x86_64") => ("windows-x64", "Windows (x64)"),
        ("windows", "aarch64") => ("windows-arm64", "Windows (ARM64)"),
        _ => return Err(ComponentError::UnsupportedPlatform(format!("{os}-{arch}"))),
    };

    Ok(PlatformInfo {
        os,
        arch,
        platform: platform.to_string(),
        display,
        exe_suffix,
        archive_ext,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn t32_platform_detect_matches_supported_or_returns_unsupported() {
        let detected = detect_platform();
        match (std::env::consts::OS, std::env::consts::ARCH) {
            ("macos", "aarch64")
            | ("macos", "x86_64")
            | ("linux", "x86_64")
            | ("linux", "aarch64")
            | ("windows", "x86_64")
            | ("windows", "aarch64") => {
                let info = detected.expect("supported platform should resolve");
                assert_eq!(info.os, std::env::consts::OS);
                assert_eq!(info.arch, std::env::consts::ARCH);
                assert!(!info.platform.is_empty());
                assert!(!info.display.is_empty());
                if std::env::consts::OS == "windows" {
                    assert_eq!(info.exe_suffix, ".exe");
                    assert_eq!(info.archive_ext, ".zip");
                } else {
                    assert_eq!(info.exe_suffix, "");
                    assert_eq!(info.archive_ext, ".tar.gz");
                }
            }
            _ => assert!(matches!(
                detected,
                Err(ComponentError::UnsupportedPlatform(_))
            )),
        }
    }

    // ── PlatformInfo: struct construction and field access ────────────────────

    #[test]
    fn t32_platform_info_fields_are_accessible() {
        let info = PlatformInfo {
            os: "linux",
            arch: "x86_64",
            platform: "linux-x64".to_string(),
            display: "Linux (x86_64)",
            exe_suffix: "",
            archive_ext: ".tar.gz",
        };

        assert_eq!(info.os, "linux");
        assert_eq!(info.arch, "x86_64");
        assert_eq!(info.platform, "linux-x64");
        assert_eq!(info.display, "Linux (x86_64)");
        assert_eq!(info.exe_suffix, "");
        assert_eq!(info.archive_ext, ".tar.gz");
    }

    #[test]
    fn t32_platform_info_clone_produces_equal_fields() {
        let info = PlatformInfo {
            os: "macos",
            arch: "aarch64",
            platform: "macos-arm64".to_string(),
            display: "macOS (Apple Silicon)",
            exe_suffix: "",
            archive_ext: ".tar.gz",
        };
        let cloned = info.clone();
        assert_eq!(cloned.os, info.os);
        assert_eq!(cloned.platform, info.platform);
    }

    #[test]
    fn t32_platform_info_debug_contains_platform() {
        let info = PlatformInfo {
            os: "windows",
            arch: "x86_64",
            platform: "windows-x64".to_string(),
            display: "Windows (x64)",
            exe_suffix: ".exe",
            archive_ext: ".zip",
        };
        let debug_str = format!("{info:?}");
        assert!(debug_str.contains("windows-x64"));
    }

    #[test]
    fn t32_platform_detect_returns_err_for_unsupported_platform_message() {
        // We cannot override env::consts at runtime, but we can verify the error type
        // and message format on the current host indirectly via an artificial match.
        // Here we just confirm the error variant carries the platform string.
        let err = ComponentError::UnsupportedPlatform("riscv-riscv64".to_string());
        assert!(err.to_string().contains("riscv-riscv64"));
        assert!(matches!(err, ComponentError::UnsupportedPlatform(_)));
    }
}
