// A020/PluginArtifact: Tauri commands for plugin runtime lifecycle —
// install, register, and spawn plugin-declared managed processes.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use serde::Deserialize;
use snapfzz_kernel::process::ProcessFactoryRegistry;
use snapfzz_packs::runtime::python::PythonRuntime;
use tauri::State;

use crate::factories::plugin_runtime::PluginProcessFactory;

/// Declaration from the plugin manifest describing a runtime process.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntimeDeclaration {
    pub runtime_id: String,
    pub plugin_id: String,
    /// Relative path from plugin root to the Python package directory.
    pub package_dir: String,
    /// Command to run (binary name + args), e.g. "orchestrator --serve".
    pub command: String,
    /// Health check endpoint path, e.g. "/health".
    pub health_check: String,
    pub health_interval_ms: Option<u64>,
    pub max_memory_mb: Option<u64>,
    pub max_restarts: Option<u32>,
    pub requires_database: Option<bool>,
    pub env: Option<HashMap<String, String>>,
}

/// Resolve the plugins directory — always `~/.snapfzz/plugins/`.
fn resolve_plugins_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "cannot resolve home directory".to_string())?;
    Ok(home.join(".snapfzz").join("plugins"))
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
}
