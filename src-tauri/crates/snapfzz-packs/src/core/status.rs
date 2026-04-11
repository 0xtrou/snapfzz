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
    pub venv_path: String,
    pub installed_packages: Vec<String>,
    pub agentscope: PipPackageInfo,
    pub agentscope_runtime: PipPackageInfo,
    pub litellm: PipPackageInfo,
    pub install_steps: Vec<InstallStep>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn t32_status_pip_package_info_serializes() {
        let info = PipPackageInfo {
            name: "agentscope".into(),
            version: "1.0.0".into(),
            is_installed: true,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"name\":\"agentscope\""));
        assert!(json.contains("\"is_installed\":true"));
    }

    #[test]
    fn t32_status_install_step_serializes() {
        let step = InstallStep {
            id: "python".into(),
            label: "Python Runtime".into(),
            is_installed: false,
        };
        let json = serde_json::to_string(&step).unwrap();
        assert!(json.contains("\"is_installed\":false"));
    }

    #[test]
    fn t32_status_python_runtime_status_serializes_all_fields() {
        let status = PythonRuntimeStatus {
            python_installed: true,
            python_version: Some("3.12.0".into()),
            python_path: Some("/usr/bin/python3".into()),
            uv_installed: true,
            uv_version: Some("0.6.6".into()),
            venv_exists: false,
            venv_path: "/Users/test/.snapfzz/runtime/python/venv".into(),
            installed_packages: vec!["requests".into()],
            agentscope: PipPackageInfo {
                name: "agentscope".into(),
                version: "1.0.0".into(),
                is_installed: true,
            },
            agentscope_runtime: PipPackageInfo {
                name: "agentscope-runtime".into(),
                version: "1.1.0".into(),
                is_installed: false,
            },
            litellm: PipPackageInfo {
                name: "litellm".into(),
                version: "1.0.0".into(),
                is_installed: false,
            },
            install_steps: vec![],
        };

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"python_installed\":true"));
        assert!(json.contains("\"python_version\":\"3.12.0\""));
        assert!(json.contains("\"installed_packages\":[\"requests\"]"));
    }
}
