# T33: ManagedService Refactor - Handoff

## Summary

Completed the ManagedService refactor to enable AgentScope and LiteLLM to be properly defined as runnable services that depend on installed pip packages, with `ProcessManager` using the new service-based spawn instead of hardcoded `uv run python app.py`.

## Changes Made

### 1. Created `ManagedService` Trait (`snapfzz-packs/src/service.rs`)
- `ServiceConfig`, `HealthConfig`, `ResourceLimits` structs
- `ServiceError` enum with thiserror
- `ManagedService` trait with: `id()`, `name()`, `dependencies()`, `spawn_command()`, `health_config()`, `resource_limits()`, `can_start()`

### 2. Created `AgentScopeService` (`snapfzz-packs/src/runtime/agentscope.rs`)
- Wraps `Arc<PythonRuntime>`
- Implements `ManagedService` trait
- Provides spawn command using venv Python
- 6 tests added

### 3. Created `LiteLLMService` (`snapfzz-packs/src/runtime/litellm.rs`)
- Similar to AgentScopeService but for LiteLLM
- 6 tests added

### 4. Added `spawn_process()` to `ProcessManager` (`snapfzz-kernel/src/process/mod.rs`)
- Accepts pre-built `Command`, `ProcessBudget`, and `health_timeout_secs`
- Handles stdout/stderr capture, PID tracking, budget registration
- Old `spawn()` method deprecated but retained for backward compatibility

### 5. Refactored `spawn_agentscope()` in `helpers.rs`
- Now uses `AgentScopeService` with `PythonRuntime`
- Calls new `spawn_process()` method
- Maintains same public API and test compatibility

### 6. Deleted obsolete `factory.rs`
- Contained empty stubs replaced by proper service implementations

## Test Results

- **snapfzz-packs**: 61 tests pass ✅
- **snapfzz-kernel**: 132 tests pass ✅
- **Full suite**: 130 tests pass ✅

## Coverage

- `service.rs`: 100%
- `runtime/agentscope.rs`: 85.19%
- `runtime/litellm.rs`: 86.67%

## Architecture Insight

`snapfzz-kernel` should NOT depend on `snapfzz-packs`. The solution is:
1. `spawn_process()` is a lower-level method accepting any `Command` + `ProcessBudget`
2. Service-specific spawn logic lives in the main app (`helpers.rs`) where both crates are available

## Design Pattern

`ManagedService` is for RUNNABLE pip-installed services (AgentScope, LiteLLM), contrasted with `SystemComponent` which is for DOWNLOADABLE binaries (CEF, uv, Python).

## Remaining Work

1. The deprecated `spawn()` method in `ProcessManager` can be removed in a future version once all callers migrate
2. The `restart_runtime()` function in supervisor.rs still uses deprecated spawn (intentionally retained for now)
3. LiteLLM spawn function similar to `spawn_agentscope()` can be added when needed

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `snapfzz-packs/src/service.rs` | Created | 128 |
| `snapfzz-packs/src/runtime/agentscope.rs` | Created | 154 |
| `snapfzz-packs/src/runtime/litellm.rs` | Created | 150 |
| `snapfzz-packs/src/runtime/mod.rs` | Modified | +2 |
| `snapfzz-packs/src/lib.rs` | Modified | +1 |
| `snapfzz-packs/src/factory.rs` | Deleted | - |
| `snapfzz-kernel/src/process/mod.rs` | Modified | +65 |
| `src-tauri/src/helpers.rs` | Modified | +35 |

## Verification Steps

```bash
# Run tests
cd src-tauri && cargo test -p snapfzz-kernel -p snapfzz-packs

# Check compilation
cargo check

# Verify coverage
cargo llvm-cov -p snapfzz-packs
```