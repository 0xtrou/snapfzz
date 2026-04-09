use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use snapfzz_kernel::components::{
    ComponentError, ComponentInfo, DownloadProgress, DownloadStatus, SystemComponent,
};

use crate::platform::PlatformInfo;
use crate::uv::UvComponent;
use crate::versions;

fn normalize_package_name(name: &str) -> String {
    name.split('=').next().unwrap_or(name)
        .split('[').next().unwrap_or(name)
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
        package_spec("litellm[proxy]", versions::LITELLM),
    ]
}

#[derive(Debug, Clone)]
pub struct PythonRuntime {
    runtime_dir: PathBuf,
    platform: PlatformInfo,
}

impl PythonRuntime {
    pub fn new(runtime_dir: PathBuf, platform: PlatformInfo) -> Self {
        Self { runtime_dir, platform }
    }

    pub fn runtime_dir(&self) -> &Path {
        &self.runtime_dir
    }

    pub fn bin_dir(&self) -> PathBuf {
        self.runtime_dir.join("python").join("bin")
    }

    pub fn uv_binary(&self) -> PathBuf {
        self.bin_dir().join(format!("uv{}", self.platform.exe_suffix))
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

    pub async fn ensure_uv(&self) -> Result<(), ComponentError> {
        let uv_bin = self.uv_binary();
        if uv_bin.exists() {
            return Ok(());
        }

        std::fs::create_dir_all(self.bin_dir())?;
        let component = UvComponent::new(self.bin_dir(), self.platform.clone());
        let _ = component.download().await?;
        Ok(())
    }

    pub fn ensure_python_installed(&self) -> Result<(), ComponentError> {
        if Self::find_python_binary(&self.python_install_dir()).is_some() {
            return Ok(());
        }

        std::fs::create_dir_all(self.python_install_dir())?;
        let output = self.run_uv([
            "python",
            "install",
            versions::PYTHON,
            "--install-dir",
            self.python_install_dir().to_string_lossy().as_ref(),
        ])?;

        if !output.status.success() {
            return Err(ComponentError::internal(format!(
                "python install failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        if Self::find_python_binary(&self.python_install_dir()).is_none() {
            return Err(ComponentError::not_found("Python installed but binary not found"));
        }

        Ok(())
    }

    pub fn ensure_venv(&self) -> Result<(), ComponentError> {
        if self.venv_python().exists() {
            return Ok(());
        }

        std::fs::create_dir_all(self.venv_dir())?;
        let python_bin = Self::find_python_binary(&self.python_install_dir())
            .ok_or_else(|| ComponentError::not_found("Python not found for venv creation"))?;

        let output = self.run_uv([
            "venv",
            "--python",
            python_bin.to_string_lossy().as_ref(),
            self.venv_dir().to_string_lossy().as_ref(),
        ])?;

        if !output.status.success() {
            return Err(ComponentError::internal(format!(
                "venv creation failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        if !self.venv_python().exists() {
            return Err(ComponentError::not_found("Venv created but python binary not found"));
        }

        Ok(())
    }

    pub async fn ensure_runtime_ready(&self) -> Result<(), ComponentError> {
        self.ensure_uv().await?;
        self.ensure_python_installed()?;
        self.ensure_venv()?;
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

    pub async fn install_all_with_progress(&self) -> Result<Vec<DownloadProgress>, ComponentError> {
        let mut progress = vec![DownloadProgress {
            component_id: "python-pack".into(),
            bytes_downloaded: 0,
            bytes_total: 4,
            percent: 0.0,
            status: DownloadStatus::Downloading,
        }];

        self.ensure_uv().await?;
        progress.push(DownloadProgress {
            component_id: "uv".into(),
            bytes_downloaded: 1,
            bytes_total: 4,
            percent: 25.0,
            status: DownloadStatus::Ready,
        });

        self.ensure_python_installed()?;
        progress.push(DownloadProgress {
            component_id: "python".into(),
            bytes_downloaded: 2,
            bytes_total: 4,
            percent: 50.0,
            status: DownloadStatus::Ready,
        });

        self.ensure_venv()?;
        progress.push(DownloadProgress {
            component_id: "venv".into(),
            bytes_downloaded: 3,
            bytes_total: 4,
            percent: 75.0,
            status: DownloadStatus::Ready,
        });

        self.install_all_packages()?;
        progress.push(DownloadProgress {
            component_id: "pip".into(),
            bytes_downloaded: 4,
            bytes_total: 4,
            percent: 100.0,
            status: DownloadStatus::Ready,
        });

        Ok(progress)
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
                    .or_else(|| output.as_ref().and_then(|o| String::from_utf8(o.stderr.clone()).ok()))
                    .map(|s| s.trim().replace("Python ", ""));
                (true, version, Some(pb.to_string_lossy().to_string()))
            }
            None => (false, None, None),
        };

        let (uv_installed, uv_version) = if self.uv_binary().exists() {
            let output = Command::new(self.uv_binary()).arg("--version").output().ok();
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
            installed_packages: installed_packages.iter().map(|(name, _)| name.clone()).collect(),
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
}

#[derive(serde::Serialize, Clone)]
pub struct PipPackageInfo {
    pub name: String,
    pub version: String,
    pub is_installed: bool,
}

#[derive(serde::Serialize, Clone)]
pub struct InstallStep {
    pub id: String,
    pub label: String,
    pub is_installed: bool,
}

#[derive(serde::Serialize, Clone)]
pub struct PythonRuntimeStatus {
    pub python_installed: bool,
    pub python_version: Option<String>,
    pub python_path: Option<String>,
    pub uv_installed: bool,
    pub uv_version: Option<String>,
    pub venv_exists: bool,
    pub installed_packages: Vec<String>,
    pub agentscope: PipPackageInfo,
    pub agentscope_runtime: PipPackageInfo,
    pub litellm: PipPackageInfo,
    pub install_steps: Vec<InstallStep>,
}

#[derive(Debug, Clone)]
pub struct PipPackComponent {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    license: &'static str,
    pip_package: String,
    runtime: PythonRuntime,
    venv_dir: PathBuf,
    platform: PlatformInfo,
    repository_url: &'static str,
    website_url: &'static str,
    cancelled: Arc<AtomicBool>,
}

impl PipPackComponent {
    pub fn new(
        id: &'static str,
        name: &'static str,
        description: &'static str,
        license: &'static str,
        pip_package: String,
        runtime: PythonRuntime,
        platform: PlatformInfo,
        repository_url: &'static str,
        website_url: &'static str,
    ) -> Self {
        let venv_dir = runtime.venv_dir();
        Self {
            id,
            name,
            description,
            license,
            pip_package,
            runtime,
            venv_dir,
            platform,
            repository_url,
            website_url,
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[async_trait::async_trait]
impl SystemComponent for PipPackComponent {
    fn id(&self) -> &str {
        self.id
    }

    fn name(&self) -> &str {
        self.name
    }

    fn install_dir(&self) -> &Path {
        self.venv_dir.as_path()
    }

    fn repository_url(&self) -> &str {
        self.repository_url
    }

    fn website_url(&self) -> &str {
        self.website_url
    }

    fn is_installed(&self) -> bool {
        self.runtime.package_version(self.id).is_some()
    }

    async fn resolve(&self) -> Result<ComponentInfo, ComponentError> {
        Ok(ComponentInfo {
            id: self.id.into(),
            name: self.name.into(),
            description: self.description.into(),
            license: self.license.into(),
            version: "latest".into(),
            platform: self.platform.platform.clone(),
            platform_display: self.platform.display.to_string(),
            download_url: String::new(),
            install_path: self.runtime.venv_dir().to_string_lossy().into_owned(),
            size: 0,
            checksum: String::new(),
            checksum_algorithm: String::new(),
            is_installed: self.is_installed(),
            repository_url: self.repository_url.into(),
            website_url: self.website_url.into(),
        })
    }

    async fn download(&self) -> Result<Vec<DownloadProgress>, ComponentError> {
        if self.cancelled.load(Ordering::SeqCst) {
            return Ok(vec![DownloadProgress {
                component_id: self.id.into(),
                bytes_downloaded: 0,
                bytes_total: 0,
                percent: 0.0,
                status: DownloadStatus::Cancelled,
            }]);
        }

        self.runtime.ensure_runtime_ready().await?;

        let mut progress = vec![DownloadProgress {
            component_id: self.id.into(),
            bytes_downloaded: 0,
            bytes_total: 1,
            percent: 0.0,
            status: DownloadStatus::Downloading,
        }];

        let _ = self.runtime.install_package(&self.pip_package)?;

        progress.push(DownloadProgress {
            component_id: self.id.into(),
            bytes_downloaded: 1,
            bytes_total: 1,
            percent: 100.0,
            status: DownloadStatus::Ready,
        });

        Ok(progress)
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    fn clear_cancel(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }

    async fn verify(&self) -> Result<String, ComponentError> {
        self.runtime
            .package_version(self.id)
            .ok_or_else(|| ComponentError::not_found(format!("{} is not installed", self.id)))
    }

    async fn extract(&self) -> Result<(), ComponentError> {
        Ok(())
    }
}

pub fn make_python_package_component(
    id: &'static str,
    name: &'static str,
    description: &'static str,
    license: &'static str,
    pip_package: String,
    runtime_dir: PathBuf,
    platform: PlatformInfo,
    repository_url: &'static str,
    website_url: &'static str,
    ) -> PipPackComponent {
    let runtime = PythonRuntime::new(runtime_dir, platform.clone());
    PipPackComponent::new(
        id,
        name,
        description,
        license,
        pip_package,
        runtime,
        platform,
        repository_url,
        website_url,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_script(path: &Path, script: &str) {
        std::fs::write(path, script.as_bytes()).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = std::fs::metadata(path).unwrap().permissions();
            permissions.set_mode(0o755);
            std::fs::set_permissions(path, permissions).unwrap();
        }
    }

    fn setup_runtime(script: &str) -> (tempfile::TempDir, PythonRuntime) {
        let temp = tempfile::tempdir().unwrap();
        let runtime_dir = temp.path().join("runtime");
        let platform = test_platform();
        let runtime = PythonRuntime::new(runtime_dir.clone(), platform.clone());

        std::fs::create_dir_all(runtime.bin_dir()).unwrap();
        write_script(&runtime.uv_binary(), script);

        (temp, runtime)
    }

    fn test_platform() -> PlatformInfo {
        PlatformInfo {
            os: "macos",
            arch: "aarch64",
            platform: "macos-arm64".to_string(),
            display: "macOS (Apple Silicon)",
            exe_suffix: "",
            archive_ext: ".tar.gz",
        }
    }

    fn make_test_component(runtime: PythonRuntime, id: &'static str) -> PipPackComponent {
        PipPackComponent::new(
            id,
            "Test Package",
            "A test package",
            "MIT",
            id.to_string(),
            runtime,
            test_platform(),
            "https://example.com/repo",
            "https://example.com/docs",
        )
    }

    #[test]
    fn t32_pip_pack_is_installed_false_when_venv_missing() {
        let (_temp, runtime) = setup_runtime("#!/bin/sh\nexit 0\n");
        let component = make_test_component(runtime, "agentscope");
        assert!(!component.is_installed());
    }

    #[test]
    fn t32_python_runtime_parses_installed_packages() {
        let (_temp, runtime) = setup_runtime("#!/bin/sh\nif [ \"$1\" = \"pip\" ] && [ \"$2\" = \"list\" ]; then echo '[{\"name\":\"agentscope\",\"version\":\"1.0.18\"}]'; exit 0; fi\nexit 0\n");
        std::fs::create_dir_all(runtime.venv_dir().join("bin")).unwrap();
        write_script(&runtime.venv_python(), "#!/bin/sh\nexit 0\n");

        assert_eq!(runtime.package_version("agentscope"), Some("1.0.18".to_string()));
        assert_eq!(runtime.package_version("litellm"), None);
    }

    #[test]
    fn t32_pip_pack_is_installed_true_when_venv_has_package() {
        let (_temp, runtime) = setup_runtime("#!/bin/sh\nif [ \"$1\" = \"pip\" ] && [ \"$2\" = \"list\" ]; then echo '[{\"name\":\"agentscope\",\"version\":\"1.0.0\"}]'; exit 0; fi\nexit 1\n");
        std::fs::create_dir_all(runtime.venv_dir().join("bin")).unwrap();
        write_script(&runtime.venv_python(), "#!/bin/sh\nexit 0\n");
        let component = make_test_component(runtime, "agentscope");
        assert!(component.is_installed());
    }

    #[test]
    fn t32_pip_pack_cancel_and_clear_cancel_toggle_flag() {
        let (_temp, runtime) = setup_runtime("#!/bin/sh\nexit 0\n");
        let component = make_test_component(runtime, "agentscope");
        assert!(!component.cancelled.load(Ordering::SeqCst));
        component.cancel();
        assert!(component.cancelled.load(Ordering::SeqCst));
        component.clear_cancel();
        assert!(!component.cancelled.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn t32_pip_pack_download_returns_cancelled_when_pre_cancelled() {
        let (_temp, runtime) = setup_runtime("#!/bin/sh\nexit 0\n");
        let component = make_test_component(runtime, "agentscope");
        component.cancel();

        let events = component.download().await.unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].status, DownloadStatus::Cancelled);
    }

    #[tokio::test]
    async fn t32_pip_pack_resolve_returns_component_info() {
        let (_temp, runtime) = setup_runtime("#!/bin/sh\nexit 1\n");
        let component = make_test_component(runtime.clone(), "agentscope");

        let info = component.resolve().await.unwrap();

        assert_eq!(info.id, "agentscope");
        assert_eq!(info.name, "Test Package");
        assert_eq!(info.license, "MIT");
        assert_eq!(info.install_path, runtime.venv_dir().to_string_lossy().to_string());
        assert!(!info.is_installed);
    }

    #[tokio::test]
    async fn t32_pip_pack_extract_returns_ok_for_pip_packages() {
        let (_temp, runtime) = setup_runtime("#!/bin/sh\nexit 0\n");
        let component = make_test_component(runtime, "litellm");

        assert!(component.extract().await.is_ok());
    }
}
