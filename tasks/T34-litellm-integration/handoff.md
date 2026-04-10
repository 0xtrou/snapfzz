# Handoff: T34 LiteLLM Integration

## What Changed

| File | Change |
|------|--------|
| `src-tauri/src/helpers.rs` | Added `find_available_port()`, `spawn_litellm()`, auto-port allocation for both services, preset memory clamp, 4 new tests |
| `src-tauri/src/commands/process.rs` | Service dispatch in `restart_process` by name |

## Key Decisions

### 1. Auto-Random Ports
All managed processes now get random available ports via `TcpListener::bind("127.0.0.1:0")`. This:
- Avoids port conflicts between AgentScope and LiteLLM
- Allows multiple instances in the future
- Port is allocated before spawn, so health URL is correct

### 2. Service Dispatch
`restart_process(name)` now routes to the correct spawner:
- `"agentscope"` → `spawn_agentscope()`
- `"litellm"` → `spawn_litellm()`
- Unknown → error

### 3. Shared Budget Pattern
Both services now use identical budget construction:
- Clamp memory against preset limits
- Clamp restarts against preset limits
- Same health check timeout (120s)

## Known Limitations

### 1. Port Not Persisted
The auto-assigned port is not currently persisted anywhere. On restart, a new random port is allocated. This means:
- External tools that connect to AgentScope/LiteLLM need to discover the port dynamically
- Future: Store port in settings or registry after spawn

### 2. LiteLLM Config Not Generated
LiteLLM currently starts with default config (no providers configured). Need separate task for:
- Generate `~/.snapfzz/gateway/config.yaml` per A013 spec
- Provider API keys from vault
- Model routing configuration

### 3. No Boot-Time Spawn
LiteLLM must be started manually via Processes UI or command. Future: Add to boot sequence with dependencies.

### 4. Shared Host Setting
LiteLLM uses `agentscope_host` from settings. Should have its own `litellm_host` field, but this is a minor issue.

## How to Verify

### 1. Run Tests
```bash
cd src-tauri
cargo test --package snapfzz t34_
# Expected: 8 passed
```

### 2. Run Full Test Suite
```bash
cargo test --package snapfzz
# Expected: 134 passed
```

### 3. Manual Test
1. Launch Tauri: `cargo tauri dev`
2. Open Settings → Processes
3. Start LiteLLM (should appear in list)
4. Check logs, restart, kill

### 4. Verify Port Allocation
```bash
# Start both services
# Check they have different ports:
curl http://127.0.0.1:<agent-port>/health
curl http://127.0.0.1:<litellm-port>/health
```

## Ready for Review: YES

- All tests pass
- No compiler errors
- No LSP diagnostics
- Spec references added
- Follows existing patterns