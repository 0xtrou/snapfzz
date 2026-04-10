# Finalize: T34 LiteLLM Integration

## Review Findings Disposition

| # | Finding | Decision | Rationale |
|---|---------|----------|-----------|
| 1 | Ports hardcoded | **FIXED** | Added `find_available_port()` helper that binds to port 0 and returns OS-assigned port |
| 2 | LiteLLM budget setup didn't mirror agentscope | **FIXED** | Added preset memory clamp (`limits.max_memory_mb.min(preset_max_memory)`) |
| 3 | Required tests missing/weak | **FIXED** | Added `t34_find_available_port_*` tests; updated spawn config tests for auto ports |
| 4 | Tests failed due to intelligence/ dir | **FIXED** | Tests now properly create fixture directories |
| 5 | Coverage not verified | **DEFERRED** | Running coverage locally; will verify in CI |

## Fixes Applied

### 1. Auto Port Allocation

```rust
// A034/ports: Auto-allocate random available ports for managed processes
fn find_available_port() -> Result<u16, String> {
    use std::net::TcpListener;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    drop(listener);
    Ok(port)
}
```

Both `resolve_spawn_config()` and `resolve_litellm_spawn_config()` now use auto ports when settings are empty.

### 2. Preset Memory Clamp

```rust
// spawn_litellm now mirrors spawn_agentscope:
let (preset_max_memory, preset_max_restarts) = {
    let preset = registry.preset.read().unwrap();
    (preset.memory.agentscope_max_mb, preset.reliability.max_restarts)
};
let budget = ProcessBudget {
    max_memory_mb: limits.max_memory_mb.min(preset_max_memory),
    ...
};
```

### 3. Test Updates

- Renamed `t34_spawn_litellm_resolve_spawn_config_uses_default_host_and_fixed_port` → `uses_default_host_and_auto_port`
- Renamed `a014_helpers_resolve_spawn_config_uses_default_host_and_port_when_settings_empty` → `uses_default_host_and_auto_port`
- Added `t34_find_available_port_returns_valid_port`
- Added `t34_find_available_port_returns_different_ports`

## Deferred (with reason)

| Item | Reason |
|------|--------|
| Coverage verification | CI will run coverage; local llvm-cov has env issues |
| LiteLLM config.yaml generation | Out of scope for this task (separate task) |
| Boot-time spawn for LiteLLM | Manual start first; auto-start in future task |

## Verification

```bash
$ cargo test --package snapfzz t34_
running 8 tests
test helpers::tests::t34_find_available_port_returns_different_ports ... ok
test helpers::tests::t34_find_available_port_returns_valid_port ... ok
test helpers::tests::t34_spawn_litellm_failure_wraps_message ... ok
test helpers::tests::t34_spawn_litellm_resolve_spawn_config_uses_default_host_and_auto_port ... ok
test helpers::tests::t34_spawn_litellm_emits_error_when_intelligence_missing ... ok
test commands::process::tests::t34_restart_process_dispatch_returns_error_for_unknown_service ... ok
test commands::process::tests::t34_restart_process_dispatch_agentscope_returns_ok ... ok
test commands::process::tests::t34_restart_process_dispatch_litellm_returns_ok ... ok

test result: ok. 8 passed; 0 failed; 0 ignored

$ cargo test --package snapfzz
running 134 tests
...
test result: ok. 134 passed; 0 failed; 0 ignored
```

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/src/helpers.rs` | Added `find_available_port()`, updated spawn configs for auto ports, fixed preset memory clamp, updated tests |
| `src-tauri/src/commands/process.rs` | Service dispatch in `restart_process` (already done by build agent) |

## Summary

All CRITICAL and HIGH findings from review have been fixed:
- ✅ Auto-random ports for all managed processes
- ✅ LiteLLM budget mirrors agentscope pattern
- ✅ Tests cover new behavior
- ✅ All 134 tests pass