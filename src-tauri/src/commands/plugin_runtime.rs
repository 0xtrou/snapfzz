// A020/PluginArtifact: Tauri commands for plugin runtime lifecycle —
// install, register, and spawn plugin-declared managed processes.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use snapfzz_kernel::process::ProcessFactoryRegistry;
use snapfzz_packs::runtime::python::PythonRuntime;
use tauri::{Manager, State};

use crate::factories::plugin_runtime::PluginProcessFactory;

/// Declaration from the plugin manifest describing a runtime process.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntimeDeclaration {
    pub runtime_id: String,
    pub plugin_id: String,
    /// Relative path from plugin root to the Python package directory.
    pub package_dir: String,
    /// Command to run (binary name + args), e.g. "orchestrator app".
    pub command: String,
    /// Health check endpoint path, e.g. "/health".
    pub health_check: String,
    pub health_interval_ms: Option<u64>,
    pub max_memory_mb: Option<u64>,
    pub max_restarts: Option<u32>,
    pub requires_database: Option<bool>,
    pub env: Option<HashMap<String, String>>,
    /// CLI flag for host binding (e.g. "--host"). If None, host is only injected via env var.
    pub host_flag: Option<String>,
    /// CLI flag for port binding (e.g. "--port"). If None, port is only injected via env var.
    pub port_flag: Option<String>,
    /// Additional CLI args appended after command and host/port flags.
    pub additional_args: Option<Vec<String>>,
}

/// Resolve the plugins directory — always `~/.snapfzz/plugins/`.
fn resolve_plugins_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "cannot resolve home directory".to_string())?;
    Ok(home.join(".snapfzz").join("plugins"))
}

/// Info about an installed plugin discovered on disk.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPluginInfo {
    pub plugin_id: String,
    pub manifest_path: String,
    pub dist_path: String,
}

/// Scan `~/.snapfzz/plugins/` for installed plugins that have a manifest.json.
/// Returns metadata for each discovered plugin so the frontend can load them.
#[tauri::command]
pub async fn list_installed_plugins() -> Result<Vec<InstalledPluginInfo>, String> {
    let plugins_dir = resolve_plugins_dir()?;

    if !plugins_dir.exists() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();

    let entries = std::fs::read_dir(&plugins_dir)
        .map_err(|e| format!("failed to read plugins dir: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("failed to read dir entry: {e}"))?;
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        // Follow symlinks to resolve the actual directory
        let resolved = std::fs::canonicalize(&path)
            .unwrap_or_else(|_| path.clone());

        let manifest_path = resolved.join("manifest.json");
        if !manifest_path.exists() {
            continue;
        }

        let dist_path = resolved.join("dist").join("index.js");

        // Plugin ID is the directory name (e.g. "snapfzz.orchestrator")
        let plugin_id = entry
            .file_name()
            .to_string_lossy()
            .to_string();

        results.push(InstalledPluginInfo {
            plugin_id,
            manifest_path: manifest_path.to_string_lossy().to_string(),
            dist_path: dist_path.to_string_lossy().to_string(),
        });
    }

    Ok(results)
}

/// Whitelisted system plugins that ship with the app.
/// Maps plugin ID → (source dir name, bundle resource prefix).
const SYSTEM_PLUGINS: &[(&str, &str)] = &[
    ("snapfzz.orchestrator", "orchestrator"),
];

/// Resolve the project root (parent of src-tauri/) at compile time.
/// In dev mode this path exists; in production it doesn't.
const PROJECT_ROOT: &str = env!("CARGO_MANIFEST_DIR");

fn is_dev_mode() -> bool {
    std::path::Path::new(PROJECT_ROOT).exists()
}

fn dev_source_dir(dir_name: &str) -> PathBuf {
    PathBuf::from(PROJECT_ROOT)
        .parent()
        .expect("src-tauri has a parent")
        .join("plugins")
        .join(dir_name)
}

/// Install a whitelisted system plugin into `~/.snapfzz/plugins/{plugin_id}/`.
///
/// - **Dev mode**: symlinks source directory (live reload, instant changes)
/// - **Production**: copies bundled artifacts from app resources
///
/// Only whitelisted plugin IDs are allowed.
#[tauri::command]
pub async fn install_system_plugin<R: tauri::Runtime>(
    plugin_id: String,
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let dir_name = SYSTEM_PLUGINS
        .iter()
        .find(|(id, _)| *id == plugin_id)
        .map(|(_, dir)| *dir)
        .ok_or_else(|| format!("plugin '{}' is not a whitelisted system plugin", plugin_id))?;

    let plugins_dir = resolve_plugins_dir()?;
    std::fs::create_dir_all(&plugins_dir)
        .map_err(|e| format!("failed to create plugins dir: {e}"))?;

    let target = plugins_dir.join(&plugin_id);

    if is_dev_mode() {
        install_dev_symlink(dir_name, &target)
    } else {
        install_production_copy(&app, &plugin_id, &target)
    }
}

/// Dev mode: symlink source tree → plugins dir
fn install_dev_symlink(dir_name: &str, target: &std::path::Path) -> Result<String, String> {
    let source = dev_source_dir(dir_name);
    if !source.exists() {
        return Err(format!("system plugin source not found at {}", source.display()));
    }

    // If symlink already correct, skip
    if target.exists() {
        if let Ok(meta) = std::fs::symlink_metadata(target) {
            if meta.file_type().is_symlink() {
                if let Ok(link_dest) = std::fs::read_link(target) {
                    if link_dest == source {
                        return Ok(format!("already installed: {} → {}", target.display(), source.display()));
                    }
                }
            }
        }
        remove_target(target)?;
    }

    #[cfg(unix)]
    std::os::unix::fs::symlink(&source, target)
        .map_err(|e| format!("failed to symlink {} → {}: {e}", target.display(), source.display()))?;

    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(&source, target)
        .map_err(|e| format!("failed to symlink {} → {}: {e}", target.display(), source.display()))?;

    let msg = format!("dev: symlinked {} → {}", target.display(), source.display());
    eprintln!("[plugin] {msg}");
    Ok(msg)
}

/// Production mode: copy bundled artifacts from app resources → plugins dir
fn install_production_copy<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    plugin_id: &str,
    target: &std::path::Path,
) -> Result<String, String> {
    let resource_dir = app.path()
        .resource_dir()
        .map_err(|e| format!("failed to resolve resource dir: {e}"))?;

    let bundle_source = resource_dir.join("plugins").join(plugin_id);
    if !bundle_source.exists() {
        return Err(format!(
            "bundled plugin not found at {} — app bundle may be incomplete",
            bundle_source.display()
        ));
    }

    // If target already exists with all expected artifacts, skip
    if target.exists() && target.is_dir() {
        let has_intelligence = target.join("intelligence").exists();
        let has_dist = target.join("dist").join("index.js").exists();
        let has_manifest = target.join("manifest.json").exists();
        if has_intelligence && has_dist && has_manifest {
            return Ok(format!("already installed: {}", target.display()));
        }
        remove_target(target)?;
    }

    // Recursive copy from bundle to plugins dir
    copy_dir_recursive(&bundle_source, target)
        .map_err(|e| format!("failed to copy bundled plugin: {e}"))?;

    let msg = format!("production: copied {} → {}", bundle_source.display(), target.display());
    eprintln!("[plugin] {msg}");
    Ok(msg)
}

fn remove_target(target: &std::path::Path) -> Result<(), String> {
    let is_symlink = target.symlink_metadata()
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false);

    if is_symlink {
        std::fs::remove_file(target)
            .map_err(|e| format!("failed to remove stale link: {e}"))
    } else if target.is_dir() {
        std::fs::remove_dir_all(target)
            .map_err(|e| format!("failed to remove stale dir: {e}"))
    } else {
        std::fs::remove_file(target)
            .map_err(|e| format!("failed to remove stale file: {e}"))
    }
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

/// Install a plugin's Python runtime: pip install the package, copy binary to runtime dir.
///
/// Steps:
/// 1. Resolve plugin dir at `~/.snapfzz/plugins/{plugin_id}/`
/// 2. Run `uv pip install --editable {plugin_dir}/{package_dir}` using PythonRuntime's uv binary
/// 3. Copy the generated binary from venv/bin/ to `~/.snapfzz/plugins/{plugin_id}/runtime/bin/`
#[tauri::command]
pub async fn install_plugin_runtime(
    declaration: PluginRuntimeDeclaration,
    python_runtime: State<'_, Arc<PythonRuntime>>,
) -> Result<(), String> {
    let plugins_dir = resolve_plugins_dir()?;
    let plugin_dir = plugins_dir.join(&declaration.plugin_id);
    let package_dir = plugin_dir.join(&declaration.package_dir);

    if !package_dir.exists() {
        return Err(format!(
            "plugin package directory not found at {}",
            package_dir.display()
        ));
    }

    // Ensure the runtime bin directory exists
    let runtime_bin_dir = plugin_dir.join("runtime").join("bin");
    std::fs::create_dir_all(&runtime_bin_dir).map_err(|e| {
        format!(
            "failed to create runtime bin dir {}: {e}",
            runtime_bin_dir.display()
        )
    })?;

    // Run `uv pip install --editable {package_dir}` using the system venv
    let uv_bin = python_runtime.uv_binary();
    if !uv_bin.exists() {
        return Err(format!("uv binary not found at {}", uv_bin.display()));
    }

    let venv_dir = python_runtime.venv_dir();
    let output = tokio::process::Command::new(&uv_bin)
        .args([
            "pip",
            "install",
            "--editable",
            &package_dir.to_string_lossy(),
            "--python",
            &venv_dir.join("bin").join("python").to_string_lossy(),
        ])
        .output()
        .await
        .map_err(|e| format!("failed to run uv pip install: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "uv pip install failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Extract binary name (first word of command) and copy from venv/bin to plugin runtime/bin
    let binary_name = declaration
        .command
        .split_whitespace()
        .next()
        .ok_or_else(|| "empty command in declaration".to_string())?;

    let venv_binary = venv_dir.join("bin").join(binary_name);
    let target_binary = runtime_bin_dir.join(binary_name);

    if venv_binary.exists() {
        std::fs::copy(&venv_binary, &target_binary).map_err(|e| {
            format!(
                "failed to copy binary from {} to {}: {e}",
                venv_binary.display(),
                target_binary.display()
            )
        })?;

        // Ensure the binary is executable on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&target_binary, std::fs::Permissions::from_mode(0o755));
        }

        eprintln!(
            "[plugin] installed binary '{}' to {}",
            binary_name,
            target_binary.display()
        );
    } else {
        return Err(format!(
            "expected binary '{}' not found in venv at {}",
            binary_name,
            venv_binary.display()
        ));
    }

    Ok(())
}

/// Register a plugin runtime as a managed process factory in the ProcessFactoryRegistry.
#[tauri::command]
pub async fn register_plugin_runtime(
    declaration: PluginRuntimeDeclaration,
    factory_registry: State<'_, Arc<tokio::sync::RwLock<ProcessFactoryRegistry>>>,
) -> Result<(), String> {
    let plugins_dir = resolve_plugins_dir()?;

    let factory = PluginProcessFactory::new(
        declaration.runtime_id.clone(),
        declaration.plugin_id,
        declaration.command,
        declaration.health_check,
        declaration.health_interval_ms.unwrap_or(2000),
        declaration.max_memory_mb.unwrap_or(512),
        declaration.max_restarts.unwrap_or(5),
        declaration.requires_database.unwrap_or(false),
        declaration.env.unwrap_or_default(),
        declaration.host_flag,
        declaration.port_flag,
        declaration.additional_args.unwrap_or_default(),
        plugins_dir,
    );

    let mut registry = factory_registry.write().await;
    registry.register(Arc::new(factory));

    eprintln!(
        "[plugin] registered runtime factory '{}'",
        declaration.runtime_id
    );

    Ok(())
}

/// Unregister a plugin runtime factory and remove its process entry.
/// Called during plugin deactivation to prevent duplicate registrations on reactivation.
#[tauri::command]
pub async fn unregister_plugin_runtime(
    runtime_id: String,
    factory_registry: State<'_, Arc<tokio::sync::RwLock<ProcessFactoryRegistry>>>,
) -> Result<(), String> {
    let mut registry = factory_registry.write().await;
    registry.unregister(&runtime_id);
    eprintln!("[plugin] unregistered runtime factory '{runtime_id}'");
    Ok(())
}

/// Spawn a registered plugin runtime process by its runtime_id.
#[tauri::command]
pub async fn spawn_plugin_runtime(
    runtime_id: String,
    factory_registry: State<'_, Arc<tokio::sync::RwLock<ProcessFactoryRegistry>>>,
) -> Result<(), String> {
    let mut registry = factory_registry.write().await;
    registry
        .spawn(&runtime_id)
        .await
        .map_err(|e| format!("failed to spawn plugin runtime '{}': {e}", runtime_id))
}

/// Installation status for a plugin, used by the plugin host to check readiness.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallStatus {
    pub installed: bool,
    pub has_dist: bool,
    pub has_manifest: bool,
    pub has_runtime: bool,
    pub plugin_dir: String,
}

/// Query the installation status of a plugin by its ID.
///
/// Returns which artifacts are present in `~/.snapfzz/plugins/{plugin_id}/`,
/// letting the plugin host decide whether the plugin is ready to load.
#[tauri::command]
pub async fn get_plugin_info(plugin_id: String) -> Result<PluginInstallStatus, String> {
    let plugins_dir = resolve_plugins_dir()?;
    let plugin_dir = plugins_dir.join(&plugin_id);

    Ok(PluginInstallStatus {
        installed: plugin_dir.exists(),
        has_dist: plugin_dir.join("dist").join("index.js").exists(),
        has_manifest: plugin_dir.join("manifest.json").exists(),
        has_runtime: plugin_dir.join("runtime").join("bin").exists(),
        plugin_dir: plugin_dir.to_string_lossy().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a020_resolve_plugins_dir_returns_snapfzz_plugins_path() {
        let dir = resolve_plugins_dir().expect("plugins dir");
        assert!(
            dir.to_string_lossy().contains(".snapfzz/plugins"),
            "expected .snapfzz/plugins in path, got: {}",
            dir.display()
        );
    }

    #[test]
    fn a020_declaration_deserializes_from_json() {
        let json = r#"{
            "runtimeId": "my-runtime",
            "pluginId": "my-plugin",
            "packageDir": "packages/runtime",
            "command": "my-binary --serve",
            "healthCheck": "/health",
            "healthIntervalMs": 3000,
            "maxMemoryMb": 256,
            "maxRestarts": 3,
            "requiresDatabase": true,
            "env": {"MY_VAR": "my_value"}
        }"#;
        let decl: PluginRuntimeDeclaration =
            serde_json::from_str(json).expect("deserialize declaration");
        assert_eq!(decl.runtime_id, "my-runtime");
        assert_eq!(decl.plugin_id, "my-plugin");
        assert_eq!(decl.package_dir, "packages/runtime");
        assert_eq!(decl.command, "my-binary --serve");
        assert_eq!(decl.health_check, "/health");
        assert_eq!(decl.health_interval_ms, Some(3000));
        assert_eq!(decl.max_memory_mb, Some(256));
        assert_eq!(decl.max_restarts, Some(3));
        assert_eq!(decl.requires_database, Some(true));
        assert_eq!(
            decl.env.as_ref().unwrap().get("MY_VAR"),
            Some(&"my_value".to_string())
        );
    }

    #[test]
    fn a020_declaration_deserializes_with_optional_fields_missing() {
        let json = r#"{
            "runtimeId": "minimal",
            "pluginId": "minimal-plugin",
            "packageDir": ".",
            "command": "run",
            "healthCheck": "/health"
        }"#;
        let decl: PluginRuntimeDeclaration =
            serde_json::from_str(json).expect("deserialize minimal declaration");
        assert_eq!(decl.runtime_id, "minimal");
        assert!(decl.health_interval_ms.is_none());
        assert!(decl.max_memory_mb.is_none());
        assert!(decl.max_restarts.is_none());
        assert!(decl.requires_database.is_none());
        assert!(decl.env.is_none());
    }

    #[test]
    fn a020_plugin_install_status_serializes_to_camel_case() {
        let status = PluginInstallStatus {
            installed: true,
            has_dist: true,
            has_manifest: false,
            has_runtime: true,
            plugin_dir: "/home/test/.snapfzz/plugins/my.plugin".to_string(),
        };
        let json = serde_json::to_value(&status).expect("serialize");
        assert_eq!(json["installed"], true);
        assert_eq!(json["hasDist"], true);
        assert_eq!(json["hasManifest"], false);
        assert_eq!(json["hasRuntime"], true);
        assert_eq!(json["pluginDir"], "/home/test/.snapfzz/plugins/my.plugin");
    }

    #[tokio::test]
    async fn a020_get_plugin_info_returns_not_installed_for_missing_plugin() {
        let result = get_plugin_info("nonexistent.plugin.id".to_string())
            .await
            .expect("should not error");
        assert!(!result.installed);
        assert!(!result.has_dist);
        assert!(!result.has_manifest);
        assert!(!result.has_runtime);
    }

    #[tokio::test]
    async fn a020_list_installed_plugins_returns_ok() {
        // Should not error even if ~/.snapfzz/plugins/ doesn't exist
        let result = list_installed_plugins().await;
        assert!(result.is_ok());
    }

    #[test]
    fn a020_installed_plugin_info_serializes_to_camel_case() {
        let info = InstalledPluginInfo {
            plugin_id: "snapfzz.orchestrator".to_string(),
            manifest_path: "/home/test/.snapfzz/plugins/snapfzz.orchestrator/manifest.json".to_string(),
            dist_path: "/home/test/.snapfzz/plugins/snapfzz.orchestrator/dist/index.js".to_string(),
        };
        let json = serde_json::to_value(&info).expect("serialize");
        assert_eq!(json["pluginId"], "snapfzz.orchestrator");
        assert_eq!(json["manifestPath"], "/home/test/.snapfzz/plugins/snapfzz.orchestrator/manifest.json");
        assert_eq!(json["distPath"], "/home/test/.snapfzz/plugins/snapfzz.orchestrator/dist/index.js");
    }
}
