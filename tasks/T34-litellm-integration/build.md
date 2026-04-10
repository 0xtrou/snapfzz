# Build: T34 LiteLLM Integration

## 5 Questions

1. **Which spec?**  
   `A013-llm-providers.md`, `A033-managed-service-refactor`, and `tasks/T34-litellm-integration/spec.md`

2. **Which zone?**  
   Zone 1 — process lifecycle and I/O

3. **Core or plugin?**  
   Core — `src-tauri/src/helpers.rs` and `src-tauri/src/commands/process.rs`

4. **Existing pattern?**  
   `spawn_agentscope()` in `src-tauri/src/helpers.rs`

5. **Test name?**  
   `T34/spawn_litellm`, `T34/restart_process_dispatch`

---

## What Was Built

### 1. LiteLLM spawn helper
Added `spawn_litellm()` to `src-tauri/src/helpers.rs` following the same managed-service flow as `spawn_agentscope()`:

- resolve spawn config
- create `PythonRuntime`
- create `LiteLLMService`
- guard on `service.can_start()`
- build command via `service.spawn_command()`
- build `ProcessBudget` with `/health`
- spawn via `process_mgr.spawn_process("litellm", ...)`
- emit supervisor success/error events

Also added:
- `LITELLM_PORT` constant (`4000`)
- `resolve_litellm_spawn_config()`
- `spawn_litellm_failure()`

### 2. Restart dispatch by service name
Updated `restart_process()` in `src-tauri/src/commands/process.rs` to dispatch by managed service id:

- `agentscope` → `helpers::spawn_agentscope(...)`
- `litellm` → `helpers::spawn_litellm(...)`
- unknown name → `Err("Unknown service: ...")`

### 3. Tests added
#### helpers.rs
- `t34_spawn_litellm_failure_wraps_message`
- `t34_spawn_litellm_resolve_spawn_config_uses_default_host_and_fixed_port`
- `t34_spawn_litellm_emits_error_when_intelligence_missing`

#### commands/process.rs
- `t34_restart_process_dispatch_agentscope_returns_ok`
- `t34_restart_process_dispatch_litellm_returns_ok`
- `t34_restart_process_dispatch_returns_error_for_unknown_service`

---

## Spec References Added

### `src-tauri/src/helpers.rs`
- `// A033/spawn_litellm: Use LiteLLMService with spawn_process`
- `// A013/ProcessLifecycle: LiteLLM gateway runs as a managed child process on localhost:4000`

### `src-tauri/src/commands/process.rs`
- `// A033/restart_process: Dispatch managed service restart by service id`

---

## Verification Results

### GitNexus impact analysis before edits
- `spawn_agentscope` upstream risk: **CRITICAL**
- `restart_process` upstream risk: **CRITICAL**
- Updated the direct dependent test paths as part of the change

### GitNexus detect_changes after edits
- Scope matched the intended implementation files:
  - `src-tauri/src/helpers.rs`
  - `src-tauri/src/commands/process.rs`
- GitNexus also reported `src-tauri/lcov.info` as modified in the working tree

### Diagnostics
- `lsp_diagnostics src-tauri/src/helpers.rs` → clean
- `lsp_diagnostics src-tauri/src/commands/process.rs` → clean

### Formatting
```bash
cargo fmt
```

### Tests
```bash
$ cargo test --package snapfzz
running 132 tests
...
test helpers::tests::t34_spawn_litellm_failure_wraps_message ... ok
test helpers::tests::t34_spawn_litellm_resolve_spawn_config_uses_default_host_and_fixed_port ... ok
test helpers::tests::t34_spawn_litellm_emits_error_when_intelligence_missing ... ok
test commands::process::tests::t34_restart_process_dispatch_agentscope_returns_ok ... ok
test commands::process::tests::t34_restart_process_dispatch_litellm_returns_ok ... ok
test commands::process::tests::t34_restart_process_dispatch_returns_error_for_unknown_service ... ok
...
test result: ok. 132 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

---

## Result

LiteLLM now follows the same managed-service restart path as AgentScope in the Tauri core layer, with dispatch coverage and helper tests in place.
