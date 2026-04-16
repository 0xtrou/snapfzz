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
/// Manifest content is returned inline to avoid asset:// CSP issues.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPluginInfo {
    pub plugin_id: String,
    /// The parsed manifest.json content (inline, no fetch needed).
    pub manifest: serde_json::Value,
    /// Absolute path to dist/index.js for dynamic import via convertFileSrc.
    pub dist_path: String,
}

/// Scan `~/.snapfzz/plugins/` for installed plugins that have a manifest.json.
/// Returns manifest content inline so the frontend doesn't need to fetch via asset://.
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

        // Use the symlink path (not canonicalized) so asset:// URLs
        // stay within the scoped $HOME/.snapfzz/plugins/** path.
        let manifest_path = path.join("manifest.json");
        if !manifest_path.exists() {
            continue;
        }

        // Read and parse manifest inline (follows symlinks transparently)
        let manifest_content = std::fs::read_to_string(&manifest_path)
            .map_err(|e| format!("failed to read {}: {e}", manifest_path.display()))?;
        let manifest: serde_json::Value = serde_json::from_str(&manifest_content)
            .map_err(|e| format!("invalid manifest.json in {}: {e}", manifest_path.display()))?;

        // dist_path uses the symlink path so asset:// scope matches
        let dist_path = path.join("dist").join("index.js");

        let plugin_id = entry
            .file_name()
            .to_string_lossy()
            .to_string();

        results.push(InstalledPluginInfo {
            plugin_id,
            manifest,
            dist_path: dist_path.to_string_lossy().to_string(),
        });
    }

    Ok(results)
}

/// Whitelisted system plugins that ship with the app.
/// Maps plugin ID → (source dir name, bundle resource prefix).
/// Public so boot.rs can iterate and install them before frontend discovery.
pub const SYSTEM_PLUGINS: &[(&str, &str)] = &[
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

/// Artifact directories to copy from source → ~/.snapfzz/plugins/{id}/.
/// intelligence/ contains Python source (for pip install) and pack/ (config).
/// No node_modules, tests, or TypeScript source copied.
const PLUGIN_ARTIFACT_DIRS: &[&str] = &["dist", "intelligence"];
const PLUGIN_ARTIFACT_FILES: &[&str] = &["manifest.json"];

/// Install a whitelisted system plugin into `~/.snapfzz/plugins/{plugin_id}/`.
///
/// Copies only artifacts needed to run (no source code, no symlinks):
///   dist/          — compiled UI (JS)
///   intelligence/  — Python backend package
///   pack/          — configuration (YAML, prompts)
///   manifest.json  — plugin metadata
///
/// Dev mode: copies from source tree. Production: copies from app bundle.
/// No symlinks — asset:// protocol requires real files in the scoped path.
/// Tauri command wrapper — called from frontend during plugin activation.
/// Pass `force: true` to skip the "already installed" check (reinstall).
#[tauri::command]
pub async fn install_system_plugin<R: tauri::Runtime>(
    plugin_id: String,
    force: Option<bool>,
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    let (_dir_name, source) = resolve_system_plugin_source(&plugin_id, Some(&app))?;
    do_install_system_plugin(&plugin_id, &source, force.unwrap_or(false))
}

/// Sync version called from boot.rs — before frontend loads. Never forces.
pub fn install_system_plugin_sync<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    plugin_id: &str,
) -> Result<String, String> {
    let (_dir_name, source) = resolve_system_plugin_source(plugin_id, Some(app))?;
    do_install_system_plugin(plugin_id, &source, false)
}

/// Resolve source directory for a system plugin.
fn resolve_system_plugin_source<R: tauri::Runtime>(
    plugin_id: &str,
    app: Option<&tauri::AppHandle<R>>,
) -> Result<(&'static str, PathBuf), String> {
    let dir_name = SYSTEM_PLUGINS
        .iter()
        .find(|(id, _)| *id == plugin_id)
        .map(|(_, dir)| *dir)
        .ok_or_else(|| format!("plugin '{}' is not a whitelisted system plugin", plugin_id))?;

    let source = if is_dev_mode() {
        dev_source_dir(dir_name)
    } else {
        let app = app.ok_or("app handle required in production mode")?;
        let resource_dir = app.path()
            .resource_dir()
            .map_err(|e| format!("failed to resolve resource dir: {e}"))?;
        resource_dir.join("plugins").join(plugin_id)
    };

    if !source.exists() {
        return Err(format!("plugin source not found at {}", source.display()));
    }

    Ok((dir_name, source))
}

/// Core install logic — copies artifacts from source to ~/.snapfzz/plugins/{id}/.
/// When `force` is true, always re-copies even if artifacts exist (reinstall).
fn do_install_system_plugin(plugin_id: &str, source: &std::path::Path, force: bool) -> Result<String, String> {
    let plugins_dir = resolve_plugins_dir()?;
    std::fs::create_dir_all(&plugins_dir)
        .map_err(|e| format!("failed to create plugins dir: {e}"))?;

    let target = plugins_dir.join(plugin_id);

    // Skip if all artifacts are present and up-to-date (unless force reinstall)
    if !force && target.is_dir() {
        let all_present = PLUGIN_ARTIFACT_DIRS.iter().all(|d| target.join(d).exists())
            && PLUGIN_ARTIFACT_FILES.iter().all(|f| target.join(f).exists());

        if all_present {
            let needs_update = is_dev_mode() && {
                let src_mtime = std::fs::metadata(source.join("dist").join("index.js"))
                    .and_then(|m| m.modified()).ok();
                let dst_mtime = std::fs::metadata(target.join("dist").join("index.js"))
                    .and_then(|m| m.modified()).ok();
                src_mtime > dst_mtime
            };

            if !needs_update {
                return Ok(format!("[plugin] already installed: {}", target.display()));
            }
        }
    }

    // Clean and recreate target
    if target.exists() {
        remove_target(&target)?;
    }
    std::fs::create_dir_all(&target)
        .map_err(|e| format!("failed to create {}: {e}", target.display()))?;

    for dir in PLUGIN_ARTIFACT_DIRS {
        let src = source.join(dir);
        if src.exists() {
            copy_dir_recursive(&src, &target.join(dir))
                .map_err(|e| format!("failed to copy {dir}/: {e}"))?;
        }
    }

    for file in PLUGIN_ARTIFACT_FILES {
        let src = source.join(file);
        if src.exists() {
            std::fs::copy(&src, target.join(file))
                .map_err(|e| format!("failed to copy {file}: {e}"))?;
        }
    }

    let mode = if is_dev_mode() { "dev" } else { "production" };
    Ok(format!("[plugin] {mode}: installed {plugin_id} artifacts to {}", target.display()))
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
            manifest: serde_json::json!({"id": "snapfzz.orchestrator", "name": "Orchestrator"}),
            dist_path: "/home/test/.snapfzz/plugins/snapfzz.orchestrator/dist/index.js".to_string(),
        };
        let json = serde_json::to_value(&info).expect("serialize");
        assert_eq!(json["pluginId"], "snapfzz.orchestrator");
        assert_eq!(json["manifest"]["id"], "snapfzz.orchestrator");
        assert_eq!(json["distPath"], "/home/test/.snapfzz/plugins/snapfzz.orchestrator/dist/index.js");
    }
}
