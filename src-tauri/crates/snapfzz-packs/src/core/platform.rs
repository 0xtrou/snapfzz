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
}
