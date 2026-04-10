# T34: LiteLLM Integration

## Goal

Wire LiteLLM gateway as a managed service alongside AgentScope, enabling start/stop/restart from the Processes UI plugin.

## Spec Reference

- **A013-llm-providers.md** — LLM provider architecture (LiteLLM gateway)
- **A033-managed-service-refactor** — ManagedService trait pattern

## What Already Exists

| Piece | Location | Status |
|---|---|---|
| `LiteLLMService` | `snapfzz-packs/src/runtime/litellm.rs` | ✅ Implements ManagedService |
| ProcessManager.spawn_process | `snapfzz-kernel/src/process/mod.rs` | ✅ Generic spawn |
| ProcessManager.shutdown | `snapfzz-kernel/src/process/mod.rs` | ✅ Generic kill |
| BudgetRegistry | `snapfzz-kernel/src/budget/supervised.rs` | ✅ Tracks all processes |
| Log capture | `snapfzz-kernel/src/process/logs.rs` | ✅ Auto for spawn_process |
| Processes UI | `plugins/settings-processes/` | ✅ Lists any registered process |

## What's Missing

1. **spawn_litellm()** helper in `helpers.rs` (mirrors spawn_agentscope pattern)
2. **Service dispatch** in `restart_process` command (currently hardcoded to agentscope)
3. **Boot-time spawn** for LiteLLM (optional, start manually first)

## Implementation

### 1. Add spawn_litellm() to helpers.rs

Pattern mirrors `spawn_agentscope()` exactly:
- Resolve spawn config (host, port, working_dir)
- Create PythonRuntime + LiteLLMService
- Check `service.can_start()`
- Build command via `service.spawn_command()`
- Build ProcessBudget with health URL
- Call `process_mgr.spawn_process("litellm", ...)`
- Emit success/error events

### 2. Add dispatch to restart_process command

```rust
// src-tauri/src/commands/process.rs
pub async fn restart_process<R: tauri::Runtime>(
    name: String,
    app: tauri::AppHandle<R>,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
    process_mgr: tauri::State<'_, Arc<ProcessManager>>,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
) -> Result<(), String> {
    process_mgr.shutdown(&name).await.map_err(|e| e.to_string())?;
    
    match name.as_str() {
        "agentscope" => {
            helpers::spawn_agentscope(app, registry, process_mgr, settings_mgr).await;
        }
        "litellm" => {
            helpers::spawn_litellm(app, registry, process_mgr, settings_mgr).await;
        }
        _ => return Err(format!("Unknown service: {}", name)),
    }
    
    Ok(())
}
```

### 3. LiteLLM Service Configuration

LiteLLM needs:
- **Port**: 4000 (configurable in settings)
- **Config file**: `~/.snapfzz/gateway/config.yaml` (A013 spec)
- **Health endpoint**: `/health`

For this task, **skip config.yaml generation** — just get LiteLLM running with default config. Config generation is separate task.

## Zone Analysis

| Concern | Zone | Why |
|---|---|---|
| spawn_litellm() helper | Zone 1 | Spawns process, I/O |
| restart_process dispatch | Zone 1 | Process lifecycle |
| LiteLLMService | Zone 1 | Build command, file paths |
| UI actions | Zone 3 | Render only |

## Tests Required

```rust
// helpers::tests
// T34/spawn_litellm: spawns litellm process with correct config
// T34/spawn_litellm: emits error when dependencies not installed
// T34/spawn_litellm: registers process in BudgetRegistry

// commands::process::tests
// T34/restart_process: dispatches to spawn_litellm for "litellm" name
// T34/restart_process: returns error for unknown service name
```

## Constraints

- Never modify `@snapfzz/plugin-sdk`
- Never `// TODO` / `// FIXME` / `// HACK`
- Add inline spec references: `// A034/section: description`
- Keep 90% code coverage threshold
- Follow existing `spawn_agentscope` pattern exactly

## Success Criteria

1. `spawn_litellm()` exists in helpers.rs
2. `restart_process` dispatches by service name
3. LiteLLM appears in Processes UI when running
4. Restart/Kill/Logs work for LiteLLM
5. All tests pass
6. Coverage ≥ 90%

## Out of Scope

- Config.yaml generation (separate task)
- UI for LiteLLM settings (separate task)
- Key management API (separate task)
- Spend tracking (separate task)