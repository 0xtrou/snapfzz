# Handoff: T35 - LLM Gateway Plugin

## What Changed

### snapfzz-llm Crate
- `src-tauri/crates/snapfzz-llm/src/types.rs` - Type definitions (GatewayConfig, KeyGenerateParams, etc.)
- `src-tauri/crates/snapfzz-llm/src/vault.rs` - Provider key storage via snapfzz-vault
- `src-tauri/crates/snapfzz-llm/src/config.rs` - YAML config generation with os.environ/ refs
- `src-tauri/crates/snapfzz-llm/src/keys.rs` - HTTP client to LiteLLM /key/* API
- `src-tauri/crates/snapfzz-llm/src/spend.rs` - HTTP client to LiteLLM /spend/* API

### Tauri Commands
- `src-tauri/src/commands/llm.rs` - 14 commands for LLM gateway operations
- `src-tauri/src/main.rs` - Command registration

### Workspace
- `src-tauri/Cargo.toml` - Added snapfzz-llm to workspace members and dependencies

## Key Decisions

### Security Boundary
- **Master key never exposed to frontend** - stays in Zone 1 (Rust)
- All key/spend commands read master key from vault internally
- Removed `llm_get_or_create_master_key` command entirely
- Removed `llm_read_provider_key` command - provider keys are write/delete only

### Vault Integration
- Provider keys stored as `provider:{id}:{name}` → env var `PROVIDER_{ID}_{NAME}`
- Master key stored as `litellm:master_key` → env var `LITELLM_MASTER_KEY`
- Config generation fetches key names from vault, not from caller

### Config Security
- All `api_key` values must use `os.environ/` prefix
- Config validation rejects raw key values
- Atomic writes prevent corruption

## Known Limitations

### Not Yet Implemented
- Settings UI plugin (`plugins/settings-llm/`) - frontend for Providers/API Keys/Routing/Audit Log tabs
- LiteLLM process lifecycle integration - config changes don't auto-restart LiteLLM yet
- Provider ID extraction heuristic - currently splits on `/` from model name

### Architecture Debt
- `base_url` is passed per-command; could be stored in app state
- No rate limiting on vault access (relying on vault's internal rate limit)
- No caching of master key (reads from vault every command)

## How to Verify

```bash
# Run tests
cd src-tauri && cargo test -p snapfzz-llm
# Expected: 23 passed, 0 failed

# Check coverage
cd src-tauri && cargo llvm-cov -p snapfzz-llm --summary-only
# Expected: 96%+ region coverage, 97%+ line coverage

# Build check
cd src-tauri && cargo check
# Expected: compiles with no errors

# Review artifacts
cat tasks/T35-llm-gateway-plugin/build.md
cat tasks/T35-llm-gateway-plugin/review.md
cat tasks/T35-llm-gateway-plugin/finalize.md
```

## Spec Compliance

| # | Requirement | Status |
|---|-------------|--------|
| 1 | generate_config produces valid YAML | ✅ PASS |
| 2 | model_list includes all enabled providers | ✅ PASS |
| 3 | router_settings includes strategy and aliases | ✅ PASS |
| 4 | master_key uses env var reference | ✅ PASS |
| 5 | config written atomically | ✅ PASS |
| 6 | generate_key calls POST /key/generate | ✅ PASS |
| 7 | list_keys calls GET /key/list with pagination | ✅ PASS |
| 8 | delete_key calls POST /key/delete | ✅ PASS |
| 9 | get_key_info calls GET /key/info | ✅ PASS |
| 10 | get_spend_logs calls /spend/logs with date filters | ✅ PASS |
| 11 | get_key_spend returns per-key spend | ✅ PASS |
| 12 | get_global_spend returns total spend | ✅ PASS |
| 13 | provider keys stored with provider:{id}:{name} format | ✅ PASS |
| 14 | config generation fetches key names from vault | ✅ PASS (FIXED) |
| 15 | master_key generated on first boot if missing | ✅ PASS |
| 16 | config.yaml uses os.environ/ references | ✅ PASS |

## Ready for Review: YES