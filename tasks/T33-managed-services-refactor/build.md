# Build: ManagedService Trait for Processes

## Pre-Build Questions

### 1. Which spec?
A033 - ManagedService trait for spawnable services that depend on pip packages

### 2. Which zone?
- `service.rs` - Zone 1 (core infrastructure, no UI)
- `agentscope.rs` - Zone 1 (service implementation)
- `litellm.rs` - Zone 1 (service implementation)

### 3. Core or plugin?
Core - `snapfzz-packs` crate is core infrastructure for runtime management

### 4. Existing pattern?
- Follows `SystemComponent` trait pattern in `component.rs`
- Mirrors structure of `downloaders/` and `runtime/` modules
- Test naming: `t33_{module}_{description}`

### 5. Test name?
`t33_service_*`, `t33_agentscope_*`, `t33_litellm_*`

---

## What Was Built

### New Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `src-tauri/crates/snapfzz-packs/src/service.rs` | `ManagedService` trait, config types, error types | ~120 |
| `src-tauri/crates/snapfzz-packs/src/runtime/agentscope.rs` | `AgentScopeService` implementation | ~120 |
| `src-tauri/crates/snapfzz-packs/src/runtime/litellm.rs` | `LiteLLMService` implementation | ~115 |

### Files Modified

| File | Change |
|------|--------|
| `src-tauri/crates/snapfzz-packs/src/runtime/mod.rs` | Added module exports for agentscope, litellm |
| `src-tauri/crates/snapfzz-packs/src/lib.rs` | Added service module, updated exports, removed factory |

### Files Deleted

| File | Reason |
|------|--------|
| `src-tauri/crates/snapfzz-packs/src/factory.rs` | Replaced by proper service implementations |

---

## Spec Compliance

### ManagedService Trait

```rust
pub trait ManagedService: Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn dependencies(&self) -> Vec<&str>;
    fn spawn_command(&self, config: &ServiceConfig) -> Result<Command, ServiceError>;
    fn health_config(&self, config: &ServiceConfig) -> HealthConfig;
    fn resource_limits(&self) -> ResourceLimits;
    fn can_start(&self) -> bool;
}
```

**Design decisions:**
- Uses `Arc<PythonRuntime>` internally to access venv and package info
- `spawn_command()` returns `Result<Command, ServiceError>` for composability
- `can_start()` checks runtime readiness and package installation

### AgentScopeService

- **ID**: `"agentscope"`
- **Dependencies**: `["uv", "python", "agentscope", "agentscope-runtime"]`
- **Spawn**: `python -m app` with SNAPFZZ_HOST/PORT env vars
- **Health**: `http://{host}:{port}/health`
- **Limits**: 512 MB memory, 10 restarts

### LiteLLMService

- **ID**: `"litellm"`
- **Dependencies**: `["uv", "python", "litellm"]`
- **Spawn**: `python -m litellm --port {port}`
- **Health**: `http://{host}:{port}/health`
- **Limits**: 1024 MB memory, 5 restarts

---

## Tests Added

### service.rs (4 tests)
- `t33_service_config_fields_preserve_values`
- `t33_health_config_fields_preserve_values`
- `t33_resource_limits_fields_preserve_values`
- `t33_service_error_variants_produce_messages`

### agentscope.rs (6 tests)
- `t33_agentscope_service_id_and_name`
- `t33_agentscope_service_dependencies`
- `t33_agentscope_service_health_config`
- `t33_agentscope_service_resource_limits`
- `t33_agentscope_service_can_start_false_without_venv`
- `t33_agentscope_service_spawn_command_fails_without_venv`

### litellm.rs (6 tests)
- `t33_litellm_service_id_and_name`
- `t33_litellm_service_dependencies`
- `t33_litellm_service_health_config`
- `t33_litellm_service_resource_limits`
- `t33_litellm_service_can_start_false_without_venv`
- `t33_litellm_service_spawn_command_fails_without_venv`

---

## Verification

```bash
$ cargo check --package snapfzz-packs
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.29s

$ cargo test --package snapfzz-packs
running 61 tests
test result: ok. 61 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out

$ cargo check --package snapfzz-kernel
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.78s
```

---

## Next Steps

1. Add `spawn_service()` method to `ProcessManager` (in snapfzz-kernel)
2. Update `spawn_agentscope()` helper to use new `AgentScopeService`
3. Wire up service registration at app startup
4. Update processes UI to show install status