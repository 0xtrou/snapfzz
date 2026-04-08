use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use tauri::State;
use snapfzz_kernel::settings::SettingsManager;

fn get_runtime_dir(settings: &State<'_, Arc<SettingsManager>>) -> String {
    dirs::home_dir()
        .map(|h| h.join(".snapfzz").join("runtime").to_string_lossy().to_string())
        .unwrap_or_else(|| "~/.snapfzz/runtime".to_string())
}

#[tauri::command]
pub async fn python_pip_install_packages(
    settings: State<'_, Arc<SettingsManager>>,
) -> Result<String, String> {
    let runtime_path = get_runtime_dir(&settings);
    let python_bin = PathBuf::from(&runtime_path).join("bin").join("python");
    
    if !python_bin.exists() {
        return Err("Python not installed. Please install Python first.".to_string());
    }
    
    let uv_bin = PathBuf::from(&runtime_path).join("bin").join("uv");
    
    // Install specific versions
    let packages = vec![
        "agentscope==1.0.18",
        "agentscope-runtime==1.1.3",
        "litellm==1.83.4",
    ];
    
    let output = Command::new(&uv_bin)
        .arg("pip")
        .arg("install")
        .args(&packages)
        .env("PATH", format!("{}/bin:{}", runtime_path, std::env::var("PATH").unwrap_or_default()))
        .output()
        .map_err(|e| format!("Failed to run uv pip: {}", e))?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(format!(
            "pip install failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

#[derive(serde::Serialize, Clone)]
pub struct PipPackageInfo {
    pub name: String,
    pub version: String,
    pub is_installed: bool,
}

#[derive(serde::Serialize)]
pub struct PythonRuntimeStatus {
    pub python_installed: bool,
    pub python_version: Option<String>,
    pub python_path: Option<String>,
    pub uv_installed: bool,
    pub uv_version: Option<String>,
    pub installed_packages: Vec<String>,
    pub agentscope: PipPackageInfo,
    pub agentscope_runtime: PipPackageInfo,
    pub litellm: PipPackageInfo,
}

fn find_package_in_list(package_name: &str, installed_packages: &[String]) -> Option<String> {
    installed_packages.iter().find(|pkg| {
        let name = pkg.split('=').next().unwrap_or("").split('[').next().unwrap_or("").to_lowercase();
        name == package_name.to_lowercase() || name.starts_with(&format!("{}-", package_name.to_lowercase()))
    }).map(|pkg| {
        pkg.split('=').nth(1).unwrap_or("unknown").to_string()
    })
}

#[tauri::command]
pub async fn python_runtime_status(
    settings: State<'_, Arc<SettingsManager>>,
) -> Result<PythonRuntimeStatus, String> {
    let runtime_path = get_runtime_dir(&settings);
    let python_bin = PathBuf::from(&runtime_path).join("bin").join("python");
    let uv_bin = PathBuf::from(&runtime_path).join("bin").join("uv");
    
    let (python_installed, python_version, python_path) = if python_bin.exists() {
        let output = Command::new(&python_bin)
            .arg("--version")
            .output()
            .ok();
        let version = output
            .as_ref()
            .and_then(|o| String::from_utf8(o.stdout.clone()).ok())
            .or_else(|| output.as_ref().and_then(|o| String::from_utf8(o.stderr.clone()).ok()))
            .map(|s| s.trim().replace("Python ", ""));
        (true, version, Some(python_bin.to_string_lossy().to_string()))
    } else {
        (false, None, None)
    };
    
    let (uv_installed, uv_version) = if uv_bin.exists() {
        let output = Command::new(&uv_bin)
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
    
    let installed_packages: Vec<String> = if uv_installed && python_installed {
        let output = Command::new(&uv_bin)
            .arg("pip")
            .arg("list")
            .arg("--format")
            .arg("freeze")
            .output()
            .ok();
        output
            .as_ref()
            .and_then(|o| String::from_utf8(o.stdout.clone()).ok())
            .map(|s| {
                s.lines()
                    .filter(|line| !line.is_empty())
                    .map(|line| line.to_string())
                    .collect()
            })
            .unwrap_or_default()
    } else {
        vec![]
    };
    
    // Check for specific packages
    let agentscope_version = find_package_in_list("agentscope", &installed_packages);
    let agentscope_is_installed = agentscope_version.is_some();
    let agentscope_runtime_version = find_package_in_list("agentscope-runtime", &installed_packages);
    let agentscope_runtime_is_installed = agentscope_runtime_version.is_some();
    let litellm_version = find_package_in_list("litellm", &installed_packages);
    let litellm_is_installed = litellm_version.is_some();
    
    Ok(PythonRuntimeStatus {
        python_installed,
        python_version,
        python_path,
        uv_installed,
        uv_version,
        installed_packages: installed_packages.iter().map(|s| s.split('=').next().unwrap_or(s).to_string()).collect(),
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
    })
}
