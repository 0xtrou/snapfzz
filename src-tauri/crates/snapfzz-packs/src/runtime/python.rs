use crate::component::ComponentError;
use crate::constants::versions;
use crate::platform::PlatformInfo;
use crate::status::{InstallStep, PipPackageInfo, PythonRuntimeStatus};
use std::path::{Path, PathBuf};
use std::process::Command;

fn normalize_package_name(name: &str) -> String {
    name.split('=')
        .next()
        .unwrap_or(name)
        .split('[')
        .next()
        .unwrap_or(name)
        .replace('-', "_")
        .to_lowercase()
}

fn package_spec(name: &str, version: &str) -> String {
    format!("{name}=={version}")
}

fn python_pack_specs() -> Vec<String> {
    vec![
        package_spec("agentscope", versions::AGENTSCOPE),
        package_spec("agentscope-runtime", versions::AGENTSCOPE_RUNTIME),
        package_spec("litellm", versions::LITELLM),
    ]
}

#[derive(Debug, Clone)]
pub struct PythonRuntime {
    runtime_dir: PathBuf,
    platform: PlatformInfo,
}

impl PythonRuntime {
    pub fn new(runtime_dir: PathBuf, platform: PlatformInfo) -> Self {
        Self {
            runtime_dir,
            platform,
        }
    }

    pub fn runtime_dir(&self) -> &Path {
        &self.runtime_dir
    }

    pub fn bin_dir(&self) -> PathBuf {
        self.runtime_dir.join("python").join("bin")
    }

    pub fn uv_binary(&self) -> PathBuf {
        self.bin_dir()
            .join(format!("uv{}", self.platform.exe_suffix))
    }

    pub fn python_install_dir(&self) -> PathBuf {
        self.bin_dir().join("python")
    }

    pub fn venv_dir(&self) -> PathBuf {
        self.runtime_dir.join("python").join("venv")
    }

    pub fn venv_python(&self) -> PathBuf {
        self.venv_dir().join("bin").join("python3")
    }

    pub fn find_python_binary(install_dir: &Path) -> Option<PathBuf> {
        if let Ok(entries) = std::fs::read_dir(install_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.starts_with("cpython-") {
                    let preferred = entry
                        .path()
                        .join("bin")
                        .join(format!("python{}", versions::PYTHON));
                    if preferred.exists() {
                        return Some(preferred);
                    }

                    let py3 = entry.path().join("bin").join("python3");
                    if py3.exists() {
                        return Some(py3);
                    }

                    let py = entry.path().join("bin").join("python");
                    if py.exists() {
                        return Some(py);
                    }
                }
            }
        }
        None
    }

    fn run_uv<I, S>(&self, args: I) -> Result<std::process::Output, ComponentError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<std::ffi::OsStr>,
    {
        Command::new(self.uv_binary())
            .args(args)
            .output()
            .map_err(ComponentError::from)
    }

    pub fn is_uv_ready(&self) -> bool {
        self.uv_binary().exists()
    }

    pub fn is_python_installed(&self) -> bool {
        Self::find_python_binary(&self.python_install_dir()).is_some()
    }

    pub fn is_venv_created(&self) -> bool {
        self.venv_python().exists()
    }

    pub fn is_runtime_ready(&self) -> bool {
        self.is_uv_ready() && self.is_python_installed() && self.is_venv_created()
    }

    pub fn create_venv(&self) -> Result<(), ComponentError> {
        if self.venv_dir().exists() {
            return Ok(());
        }

        let python_bin = Self::find_python_binary(&self.python_install_dir())
            .ok_or_else(|| ComponentError::internal("Python not found in install directory"))?;

        let output = self.run_uv([
            "venv",
            "--python",
            python_bin.to_string_lossy().as_ref(),
            self.venv_dir().to_string_lossy().as_ref(),
        ])?;

        if !output.status.success() {
            return Err(ComponentError::internal(format!(
                "uv venv failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        Ok(())
    }

    pub fn install_package(&self, package: &str) -> Result<String, ComponentError> {
        let output = self.run_uv([
            "pip",
            "install",
            "--python",
            self.venv_python().to_string_lossy().as_ref(),
            "--prerelease=allow",
            package,
        ])?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(ComponentError::internal(format!(
                "pip install failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )))
        }
    }

    pub fn uninstall_package(&self, package_name: &str) -> Result<(), ComponentError> {
        let output = self.run_uv([
            "pip",
            "uninstall",
            "--python",
            self.venv_python().to_string_lossy().as_ref(),
            "-y",
            package_name,
        ])?;

        if output.status.success() {
            Ok(())
        } else {
            Err(ComponentError::internal(format!(
                "pip uninstall failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )))
        }
    }

    pub fn install_all_packages(&self) -> Result<String, ComponentError> {
        if !self.is_uv_ready() {
            return Err(ComponentError::internal("uv is not installed"));
        }

        if !self.is_python_installed() {
            return Err(ComponentError::internal("Python is not installed"));
        }

        if !self.is_venv_created() {
            self.create_venv()?;
        }

        let specs = python_pack_specs();
        let output = self.run_uv([
            "pip",
            "install",
            "--python",
            self.venv_python().to_string_lossy().as_ref(),
            "--prerelease=allow",
            specs[0].as_str(),
            specs[1].as_str(),
            specs[2].as_str(),
        ])?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(ComponentError::internal(format!(
                "pip install failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )))
        }
    }

    fn list_venv_packages(&self) -> Vec<(String, String)> {
        if !self.uv_binary().exists() || !self.venv_python().exists() {
            return vec![];
        }

        let output = self
            .run_uv([
                "pip",
                "list",
                "--python",
                self.venv_python().to_string_lossy().as_ref(),
                "--format",
                "json",
            ])
            .ok();

        output
            .as_ref()
            .and_then(|o| String::from_utf8(o.stdout.clone()).ok())
            .and_then(|json| serde_json::from_str::<Vec<serde_json::Value>>(&json).ok())
            .map(|packages| {
                packages
                    .into_iter()
                    .filter_map(|pkg| {
                        let name = pkg.get("name")?.as_str()?.to_string();
                        let version = pkg.get("version")?.as_str()?.to_string();
                        Some((name, version))
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    fn package_version_from_list(
        package_name: &str,
        installed_packages: &[(String, String)],
    ) -> Option<String> {
        let target = normalize_package_name(package_name);
        installed_packages
            .iter()
            .find(|(name, _)| normalize_package_name(name) == target)
            .map(|(_, version)| version.clone())
    }

    pub fn package_version(&self, package_name: &str) -> Option<String> {
        let packages = self.list_venv_packages();
        Self::package_version_from_list(package_name, &packages)
    }

    pub fn status(&self) -> PythonRuntimeStatus {
        let python_bin = Self::find_python_binary(&self.python_install_dir());

        let (python_installed, python_version, python_path) = match &python_bin {
            Some(pb) => {
                let output = Command::new(pb).arg("--version").output().ok();
                let version = output
                    .as_ref()
                    .and_then(|o| String::from_utf8(o.stdout.clone()).ok())
                    .or_else(|| {
                        output
                            .as_ref()
                            .and_then(|o| String::from_utf8(o.stderr.clone()).ok())
                    })
                    .map(|s| s.trim().replace("Python ", ""));
                (true, version, Some(pb.to_string_lossy().to_string()))
            }
            None => (false, None, None),
        };

        let (uv_installed, uv_version) = if self.uv_binary().exists() {
            let output = Command::new(self.uv_binary())
                .arg("--version")
                .output()
                .ok();
            let version = output
                .as_ref()
                .and_then(|o| String::from_utf8(o.stdout.clone()).ok())
                .map(|s| s.trim().replace("uv ", ""));
            (true, version)
        } else {
            (false, None)
        };

        let venv_exists = self.venv_python().exists();
        let installed_packages = if venv_exists {
            self.list_venv_packages()
        } else {
            vec![]
        };

        let agentscope_version = Self::package_version_from_list("agentscope", &installed_packages);
        let agentscope_runtime_version =
            Self::package_version_from_list("agentscope-runtime", &installed_packages);
        let litellm_version = Self::package_version_from_list("litellm", &installed_packages);

        let agentscope_is_installed = agentscope_version.is_some();
        let agentscope_runtime_is_installed = agentscope_runtime_version.is_some();
        let litellm_is_installed = litellm_version.is_some();

        PythonRuntimeStatus {
            python_installed,
            python_version,
            python_path,
            uv_installed,
            uv_version,
            venv_exists,
            venv_path: self.venv_dir().to_string_lossy().into_owned(),
            installed_packages: installed_packages
                .iter()
                .map(|(name, _)| name.clone())
                .collect(),
            agentscope: PipPackageInfo {
                name: "agentscope".to_string(),
                version: agentscope_version.unwrap_or_default(),
                is_installed: agentscope_is_installed,
            },
            agentscope_runtime: PipPackageInfo {
                name: "agentscope-runtime".to_string(),
                version: agentscope_runtime_version.unwrap_or_default(),
                is_installed: agentscope_runtime_is_installed,
            },
            litellm: PipPackageInfo {
                name: "litellm".to_string(),
                version: litellm_version.unwrap_or_default(),
                is_installed: litellm_is_installed,
            },
            install_steps: vec![
                InstallStep {
                    id: "uv".into(),
                    label: "uv (Python Package Manager)".into(),
                    is_installed: uv_installed,
                },
                InstallStep {
                    id: "python".into(),
                    label: format!("Python {}", versions::PYTHON),
                    is_installed: python_installed,
                },
                InstallStep {
                    id: "venv".into(),
                    label: "Virtual Environment".into(),
                    is_installed: venv_exists,
                },
                InstallStep {
                    id: "agentscope".into(),
                    label: "AgentScope".into(),
                    is_installed: agentscope_is_installed,
                },
                InstallStep {
                    id: "agentscope-runtime".into(),
                    label: "AgentScope Runtime".into(),
                    is_installed: agentscope_runtime_is_installed,
                },
                InstallStep {
                    id: "litellm".into(),
                    label: "LiteLLM Gateway".into(),
                    is_installed: litellm_is_installed,
                },
            ],
        }
    }

    pub fn uninstall_all(&self) -> Result<(), ComponentError> {
        let python_dir = self.runtime_dir.join("python");
        if python_dir.exists() {
            std::fs::remove_dir_all(&python_dir)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_platform() -> PlatformInfo {
        PlatformInfo {
            os: "macos",
            arch: "aarch64",
            platform: "macos-arm64".to_string(),
            display: "macOS (Apple Silicon)",
            exe_suffix: "",
            archive_ext: ".tar.gz",
        }
    }

    #[test]
    fn t32_python_normalize_package_name_strips_version_and_extras() {
        assert_eq!(normalize_package_name("agentscope"), "agentscope");
        assert_eq!(normalize_package_name("agentscope==0.1.0"), "agentscope");
        assert_eq!(normalize_package_name("package[extra]"), "package");
        assert_eq!(normalize_package_name("some-pkg==2.0"), "some_pkg");
    }

    #[test]
    fn t32_python_package_spec_creates_equality_spec() {
        assert_eq!(package_spec("agentscope", "0.1.0"), "agentscope==0.1.0");
        assert_eq!(package_spec("litellm", "1.0.0"), "litellm==1.0.0");
    }

    #[test]
    fn t32_python_pack_specs_returns_all_required_packages() {
        let specs = python_pack_specs();
        assert_eq!(specs.len(), 3);
        assert!(specs[0].starts_with("agentscope=="));
        assert!(specs[1].starts_with("agentscope-runtime=="));
        assert!(specs[2].starts_with("litellm=="));
    }

    #[test]
    fn t32_python_runtime_new_creates_instance_with_paths() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        assert_eq!(runtime.runtime_dir(), temp.path());
        assert!(runtime.bin_dir().ends_with("python/bin"));
        assert!(runtime.uv_binary().ends_with("bin/uv"));
        assert!(runtime.python_install_dir().ends_with("bin/python"));
        assert!(runtime.venv_dir().ends_with("python/venv"));
        assert!(runtime.venv_python().ends_with("venv/bin/python3"));
    }

    #[test]
    fn t32_python_runtime_bin_dir_includes_exe_suffix_on_windows() {
        let platform = PlatformInfo {
            os: "windows",
            arch: "x86_64",
            platform: "windows-x64".to_string(),
            display: "Windows (x64)",
            exe_suffix: ".exe",
            archive_ext: ".zip",
        };
        let temp = tempfile::tempdir().expect("tempdir");
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        assert!(runtime.uv_binary().ends_with("uv.exe"));
    }

    #[test]
    fn t32_python_runtime_is_runtime_ready_checks_all_components() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        assert!(!runtime.is_runtime_ready());

        let bin_dir = runtime.bin_dir();
        std::fs::create_dir_all(&bin_dir).expect("create bin dir");
        std::fs::write(runtime.uv_binary(), "").expect("create uv binary");

        let install_dir = runtime.python_install_dir();
        let cpython_dir = install_dir.join("cpython-3.12.0");
        std::fs::create_dir_all(cpython_dir.join("bin")).expect("create python dir");
        std::fs::write(cpython_dir.join("bin").join("python3.12"), "")
            .expect("create python binary");

        let venv_bin = runtime.venv_dir().join("bin");
        std::fs::create_dir_all(&venv_bin).expect("create venv bin");
        std::fs::write(runtime.venv_python(), "").expect("create venv python");

        assert!(runtime.is_runtime_ready());
    }

    #[test]
    fn t32_python_runtime_is_python_installed_checks_binary() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        assert!(!runtime.is_python_installed());

        let install_dir = runtime.python_install_dir();
        let cpython_dir = install_dir.join("cpython-3.12.0");
        std::fs::create_dir_all(cpython_dir.join("bin")).expect("create python dir");
        std::fs::write(cpython_dir.join("bin").join("python3.12"), "")
            .expect("create python binary");

        assert!(runtime.is_python_installed());
    }

    #[test]
    fn t32_python_runtime_is_venv_created_checks_python_binary() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        assert!(!runtime.is_venv_created());

        let venv_bin = runtime.venv_dir().join("bin");
        std::fs::create_dir_all(&venv_bin).expect("create venv bin");
        std::fs::write(runtime.venv_python(), "").expect("create venv python");

        assert!(runtime.is_venv_created());
    }

    #[test]
    fn t32_python_runtime_find_python_binary_searches_cpython_dirs() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("bin").join("python");
        let cpython_dir = install_dir.join("cpython-3.12.0");

        assert!(PythonRuntime::find_python_binary(&install_dir).is_none());

        std::fs::create_dir_all(cpython_dir.join("bin")).expect("create python dir");
        std::fs::write(cpython_dir.join("bin").join("python3.12"), "").expect("create python3.12");

        let found = PythonRuntime::find_python_binary(&install_dir);
        assert!(found.is_some());
        assert!(found.unwrap().ends_with("python3.12"));
    }

    #[test]
    fn t32_python_runtime_find_python_binary_prefers_exact_version() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join("bin").join("python");
        let cpython_dir = install_dir.join("cpython-3.12.0");

        std::fs::create_dir_all(cpython_dir.join("bin")).expect("create python dir");
        std::fs::write(cpython_dir.join("bin").join("python3"), "").expect("create python3");
        std::fs::write(cpython_dir.join("bin").join("python3.12"), "").expect("create python3.12");

        let found = PythonRuntime::find_python_binary(&install_dir);
        assert!(found.unwrap().ends_with("python3.12"));
    }

    #[test]
    fn t32_python_runtime_package_version_from_list_finds_normalized_match() {
        let packages = vec![
            ("AgentScope".to_string(), "0.1.0".to_string()),
            ("litellm".to_string(), "1.0.0".to_string()),
        ];

        let version = PythonRuntime::package_version_from_list("agentscope", &packages);
        assert_eq!(version, Some("0.1.0".to_string()));

        let version = PythonRuntime::package_version_from_list("litellm", &packages);
        assert_eq!(version, Some("1.0.0".to_string()));

        let version = PythonRuntime::package_version_from_list("missing", &packages);
        assert_eq!(version, None);
    }

    #[test]
    fn t32_python_runtime_status_returns_complete_info() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        let status = runtime.status();

        assert!(!status.python_installed);
        assert!(status.python_version.is_none());
        assert!(status.python_path.is_none());
        assert!(!status.uv_installed);
        assert!(status.uv_version.is_none());
        assert!(!status.venv_exists);
        assert!(status.installed_packages.is_empty());
        assert!(!status.agentscope.is_installed);
        assert!(!status.agentscope_runtime.is_installed);
        assert!(!status.litellm.is_installed);
        assert_eq!(status.install_steps.len(), 6);
    }

    #[test]
    fn t32_python_runtime_uninstall_all_removes_python_directory() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        let python_dir = temp.path().join("python");
        std::fs::create_dir_all(&python_dir).expect("create python dir");
        std::fs::write(python_dir.join("test.txt"), "data").expect("create file");

        assert!(python_dir.exists());
        runtime.uninstall_all().expect("uninstall all");
        assert!(!python_dir.exists());
    }

    #[test]
    fn t32_python_runtime_uninstall_all_handles_missing_directory() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        let result = runtime.uninstall_all();
        assert!(result.is_ok());
    }
}
