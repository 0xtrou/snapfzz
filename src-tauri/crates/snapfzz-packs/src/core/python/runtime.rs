use crate::core::component::ComponentError;
use crate::core::constants::{binaries, dirs, packages, services, versions};
use crate::core::platform::PlatformInfo;
use crate::core::status::{InstallStep, PipPackageInfo, PythonRuntimeStatus};
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
        package_spec(packages::AGENTSCOPE, versions::AGENTSCOPE),
        package_spec(packages::AGENTSCOPE_RUNTIME, versions::AGENTSCOPE_RUNTIME),
        package_spec(packages::ORCHESTRATOR, versions::ORCHESTRATOR),
        format!("{}=={}", packages::LITELLM_PROXY, versions::LITELLM),
        packages::DISKCACHE.to_string(),
        packages::PRISMA.to_string(),
        packages::GREENLET.to_string(),
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
        self.runtime_dir.join(dirs::PYTHON).join(dirs::BIN)
    }

    pub fn uv_binary(&self) -> PathBuf {
        self.bin_dir()
            .join(format!("uv{}", self.platform.exe_suffix))
    }

    pub fn python_install_dir(&self) -> PathBuf {
        self.bin_dir().join(dirs::PYTHON)
    }

    pub fn venv_dir(&self) -> PathBuf {
        self.runtime_dir.join(dirs::PYTHON).join(dirs::VENV)
    }

    pub fn venv_python(&self) -> PathBuf {
        self.venv_dir().join(dirs::BIN).join(binaries::PYTHON3)
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

                    let py3 = entry.path().join(dirs::BIN).join(binaries::PYTHON3);
                    if py3.exists() {
                        return Some(py3);
                    }

                    let py = entry.path().join(dirs::BIN).join(dirs::PYTHON);
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
        let python_path = self.venv_python();
        let python_str = python_path.to_string_lossy();
        let args: Vec<&str> = std::iter::once("pip")
            .chain(std::iter::once("install"))
            .chain(std::iter::once("--python"))
            .chain(std::iter::once(python_str.as_ref()))
            .chain(std::iter::once("--prerelease=allow"))
            .chain(specs.iter().map(|s| s.as_str()))
            .collect();

        let output = self.run_uv(args)?;

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

        let agentscope_version = Self::package_version_from_list(packages::AGENTSCOPE, &installed_packages);
        let agentscope_runtime_version =
            Self::package_version_from_list(packages::AGENTSCOPE_RUNTIME, &installed_packages);
        let orchestrator_version =
            Self::package_version_from_list(packages::ORCHESTRATOR, &installed_packages);
        let litellm_version = Self::package_version_from_list(packages::LITELLM, &installed_packages);

        let agentscope_is_installed = agentscope_version.is_some();
        let agentscope_runtime_is_installed = agentscope_runtime_version.is_some();
        let orchestrator_is_installed = orchestrator_version.is_some();
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
                name: packages::AGENTSCOPE.to_string(),
                version: agentscope_version.unwrap_or_default(),
                is_installed: agentscope_is_installed,
            },
            agentscope_runtime: PipPackageInfo {
                name: packages::AGENTSCOPE_RUNTIME.to_string(),
                version: agentscope_runtime_version.unwrap_or_default(),
                is_installed: agentscope_runtime_is_installed,
            },
            orchestrator: PipPackageInfo {
                name: packages::ORCHESTRATOR.to_string(),
                version: orchestrator_version.unwrap_or_default(),
                is_installed: orchestrator_is_installed,
            },
            litellm: PipPackageInfo {
                name: packages::LITELLM.to_string(),
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
                    id: dirs::PYTHON.into(),
                    label: format!("Python {}", versions::PYTHON),
                    is_installed: python_installed,
                },
                InstallStep {
                    id: dirs::VENV.into(),
                    label: "Virtual Environment".into(),
                    is_installed: venv_exists,
                },
                InstallStep {
                    id: packages::AGENTSCOPE.into(),
                    label: "AgentScope".into(),
                    is_installed: agentscope_is_installed,
                },
                InstallStep {
                    id: packages::AGENTSCOPE_RUNTIME.into(),
                    label: "AgentScope Runtime".into(),
                    is_installed: agentscope_runtime_is_installed,
                },
                InstallStep {
                    id: binaries::ORCHESTRATOR.into(),
                    label: services::AGENTSCOPE_NAME.into(),
                    is_installed: orchestrator_is_installed,
                },
                InstallStep {
                    id: packages::LITELLM.into(),
                    label: services::LITELLM_NAME.into(),
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
        assert_eq!(specs.len(), 7);
        assert!(specs[0].starts_with("agentscope=="));
        assert!(specs[1].starts_with("agentscope-runtime=="));
        assert!(specs[2].starts_with("snapfzz-orchestrator=="));
        assert!(specs[3].starts_with("litellm[proxy]=="));
        assert_eq!(specs[4], "diskcache");
        assert_eq!(specs[5], "prisma");
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
        assert_eq!(status.install_steps.len(), 7);
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

    // ── find_python_binary: fallback order ───────────────────────────────────

    #[test]
    fn t32_python_runtime_find_python_binary_falls_back_to_python3_then_python() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path();
        let cpython_dir = install_dir.join("cpython-3.12.0");
        std::fs::create_dir_all(cpython_dir.join("bin")).expect("create bin");

        // Only python3 present (no versioned binary)
        std::fs::write(cpython_dir.join("bin").join("python3"), "").expect("write python3");
        let found = PythonRuntime::find_python_binary(install_dir);
        assert!(found.is_some());
        assert!(found.unwrap().ends_with("python3"));

        // Remove python3, leave only python
        std::fs::remove_file(cpython_dir.join("bin").join("python3")).expect("remove");
        std::fs::write(cpython_dir.join("bin").join("python"), "").expect("write python");
        let found = PythonRuntime::find_python_binary(install_dir);
        assert!(found.is_some());
        assert!(found.unwrap().ends_with("python"));
    }

    #[test]
    fn t32_python_runtime_find_python_binary_ignores_non_cpython_dirs() {
        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path();

        // dir that does NOT start with "cpython-"
        let other_dir = install_dir.join("pypy-3.12.0");
        std::fs::create_dir_all(other_dir.join("bin")).expect("create bin");
        std::fs::write(other_dir.join("bin").join("python3"), "").expect("write");

        let found = PythonRuntime::find_python_binary(install_dir);
        assert!(found.is_none());
    }

    // ── create_venv: venv already exists ─────────────────────────────────────

    #[test]
    fn t32_python_runtime_create_venv_skips_when_venv_already_exists() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        // Pre-create the venv directory so create_venv sees it exists
        std::fs::create_dir_all(runtime.venv_dir()).expect("create venv dir");

        let result = runtime.create_venv();
        assert!(result.is_ok(), "create_venv should succeed when venv already exists");
    }

    // ── create_venv: python not found ────────────────────────────────────────

    #[test]
    fn t32_python_runtime_create_venv_errors_when_python_not_installed() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        // No venv dir, no python binary → should fail with Internal error
        let err = runtime.create_venv().expect_err("should fail");
        assert!(matches!(err, ComponentError::Internal(_)));
    }

    // ── install_package: uv binary missing → Io error ────────────────────────

    #[test]
    fn t32_python_runtime_install_package_errors_when_uv_missing() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        // uv binary doesn't exist → Command::new will fail with Io error
        let err = runtime.install_package("requests").expect_err("should fail");
        assert!(matches!(err, ComponentError::Io(_)));
    }

    // ── uninstall_package: uv binary missing → Io error ──────────────────────

    #[test]
    fn t32_python_runtime_uninstall_package_errors_when_uv_missing() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        let err = runtime.uninstall_package("requests").expect_err("should fail");
        assert!(matches!(err, ComponentError::Io(_)));
    }

    // ── install_all_packages: guards ─────────────────────────────────────────

    #[test]
    fn t32_python_runtime_install_all_packages_errors_when_uv_not_ready() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        let err = runtime.install_all_packages().expect_err("should fail");
        assert!(matches!(err, ComponentError::Internal(_)));
        assert!(err.to_string().contains("uv"));
    }

    #[test]
    fn t32_python_runtime_install_all_packages_errors_when_python_not_installed() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        // Create uv binary so uv check passes
        std::fs::create_dir_all(runtime.bin_dir()).expect("create bin dir");
        std::fs::write(runtime.uv_binary(), "").expect("create fake uv");

        let err = runtime.install_all_packages().expect_err("should fail");
        assert!(matches!(err, ComponentError::Internal(_)));
        assert!(err.to_string().contains("Python"));
    }

    // ── status: uv binary present, python absent ──────────────────────────────

    #[test]
    fn t32_python_runtime_status_reports_uv_installed_when_binary_exists() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        // Place a real binary that will be invoked with --version
        // We use `true` (unix) or just an empty file — either way uv_installed = true
        std::fs::create_dir_all(runtime.bin_dir()).expect("create bin dir");
        // Write a shell stub that exits 0 and prints a version string
        let uv_path = runtime.uv_binary();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::write(&uv_path, b"#!/bin/sh\necho 'uv 0.1.0'\n").expect("write stub");
            std::fs::set_permissions(&uv_path, std::fs::Permissions::from_mode(0o755))
                .expect("chmod");
        }
        #[cfg(not(unix))]
        {
            std::fs::write(&uv_path, b"").expect("write stub");
        }

        let status = runtime.status();
        assert!(status.uv_installed);
        // uv_version may or may not be populated depending on platform; just ensure no panic
    }

    // ── list_venv_packages: uv/venv absent → empty list ──────────────────────

    #[test]
    fn t32_python_runtime_list_venv_packages_returns_empty_when_uv_absent() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        // is_uv_ready = false → list_venv_packages returns vec![]
        // status() calls list_venv_packages internally
        let status = runtime.status();
        assert!(status.installed_packages.is_empty());
    }

    // ── package_version_from_list: hyphen/underscore normalization ────────────

    #[test]
    fn t32_python_runtime_package_version_from_list_normalizes_hyphens() {
        let packages = vec![
            ("agentscope_runtime".to_string(), "0.2.0".to_string()),
        ];

        let v = PythonRuntime::package_version_from_list("agentscope-runtime", &packages);
        assert_eq!(v, Some("0.2.0".to_string()));
    }

    // ── package_version: delegates to list_venv_packages ─────────────────────

    #[test]
    fn t32_python_runtime_package_version_returns_none_when_venv_absent() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        let v = runtime.package_version("agentscope");
        assert!(v.is_none());
    }

    // ── is_uv_ready ──────────────────────────────────────────────────────────

    #[test]
    fn t32_python_runtime_is_uv_ready_returns_true_when_binary_exists() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        assert!(!runtime.is_uv_ready());
        std::fs::create_dir_all(runtime.bin_dir()).expect("create bin dir");
        std::fs::write(runtime.uv_binary(), b"").expect("write");
        assert!(runtime.is_uv_ready());
    }

    // ── install_all_packages: venv exists → uv command executes (fails w/ bad binary) ──

    #[test]
    fn t32_python_runtime_install_all_packages_errors_with_uv_and_python_ready_but_bad_binary() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        // Satisfy uv check
        std::fs::create_dir_all(runtime.bin_dir()).expect("create bin dir");
        std::fs::write(runtime.uv_binary(), b"").expect("create fake uv");

        // Satisfy python check
        let install_dir = runtime.python_install_dir();
        let cpython_dir = install_dir.join("cpython-3.12.0");
        std::fs::create_dir_all(cpython_dir.join("bin")).expect("create python dir");
        std::fs::write(cpython_dir.join("bin").join("python3.12"), b"").expect("create python binary");

        // Create venv dir so the venv check passes
        let venv_bin = runtime.venv_dir().join("bin");
        std::fs::create_dir_all(&venv_bin).expect("create venv bin");
        std::fs::write(runtime.venv_python(), b"").expect("create venv python");

        // uv binary is empty (not executable) → Command execution should produce Io error
        let err = runtime.install_all_packages().expect_err("should fail");
        // On macOS an empty file yields Io (exec format) or os-level error
        assert!(
            matches!(err, ComponentError::Io(_)) || matches!(err, ComponentError::Internal(_)),
            "unexpected error: {err}"
        );
    }

    // ── create_venv: python binary found but uv binary bad → Io error ────────

    #[test]
    fn t32_python_runtime_create_venv_errors_when_uv_binary_is_invalid() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        // Set up a python binary (so ok_or_else doesn't fire)
        let install_dir = runtime.python_install_dir();
        let cpython_dir = install_dir.join("cpython-3.12.0");
        std::fs::create_dir_all(cpython_dir.join("bin")).expect("create python dir");
        std::fs::write(cpython_dir.join("bin").join("python3.12"), b"").expect("create python binary");

        // Put an empty (non-executable) uv binary in place
        std::fs::create_dir_all(runtime.bin_dir()).expect("create bin dir");
        std::fs::write(runtime.uv_binary(), b"").expect("create invalid uv");

        // venv dir does NOT exist → create_venv will try to run uv
        let err = runtime.create_venv().expect_err("should fail");
        // Empty binary → Io error (exec format error)
        assert!(
            matches!(err, ComponentError::Io(_)) || matches!(err, ComponentError::Internal(_)),
            "unexpected error: {err}"
        );
    }

    // ── status: both uv and python ready (stubs) ──────────────────────────────

    #[test]
    fn t32_python_runtime_status_with_uv_and_python_stubs_reports_installed() {
        let temp = tempfile::tempdir().expect("tempdir");
        let platform = make_platform();
        let runtime = PythonRuntime::new(temp.path().to_path_buf(), platform);

        // Set up stub uv binary (executable shell script)
        std::fs::create_dir_all(runtime.bin_dir()).expect("create bin dir");
        let uv_path = runtime.uv_binary();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::write(&uv_path, b"#!/bin/sh\necho 'uv 0.5.0'\n").expect("write uv stub");
            std::fs::set_permissions(&uv_path, std::fs::Permissions::from_mode(0o755))
                .expect("chmod uv");
        }
        #[cfg(not(unix))]
        std::fs::write(&uv_path, b"").expect("write uv stub");

        // Set up python binary (non-executable placeholder)
        let install_dir = runtime.python_install_dir();
        let cpython_dir = install_dir.join("cpython-3.12.0");
        std::fs::create_dir_all(cpython_dir.join("bin")).expect("create python dir");
        std::fs::write(cpython_dir.join("bin").join("python3.12"), b"not-a-real-binary")
            .expect("create python binary");

        let status = runtime.status();

        assert!(status.uv_installed);
        assert!(status.python_installed);
        assert!(!status.venv_exists);
        assert_eq!(status.install_steps.len(), 7);
        assert!(status.install_steps.iter().any(|s| s.id == "uv" && s.is_installed));
        assert!(status.install_steps.iter().any(|s| s.id == "python" && s.is_installed));
        assert!(status.install_steps.iter().any(|s| s.id == "venv" && !s.is_installed));
    }

    // ── python_pack_specs: verify litellm proxy spec ──────────────────────────

    #[test]
    fn t32_python_runtime_pack_specs_has_litellm_proxy_and_prisma() {
        let specs = python_pack_specs();
        assert!(specs.iter().any(|s| s.contains("litellm[proxy]==")));
        assert!(specs.iter().any(|s| s == "prisma"));
        assert!(specs.iter().any(|s| s == "greenlet"));
    }
}
