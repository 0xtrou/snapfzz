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
