use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct PipPackageInfo {
    pub name: String,
    pub version: String,
    pub is_installed: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallStep {
    pub id: String,
    pub label: String,
    pub is_installed: bool,
}

#[derive(Debug, Clone, Serialize)]
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
