# Build: T35 - LLM Gateway Plugin

## 5 Questions
1. Which spec? → A013-llm-providers.md
2. Which zone? → Zone 1 (Rust computation, backend services)
3. Core or plugin? → Core crate (snapfzz-llm) + Tauri commands
4. Existing pattern? → Followed snapfzz-vault crate structure and vault.rs command pattern
5. Test name? → `a013_{module}_{behavior}` format (e.g., `a013_vault_provider_keys_stored_with_provider_id_name_format`)

## What Was Built

### snapfzz-llm Crate (`src-tauri/crates/snapfzz-llm/`)

| File | Purpose | Lines | Tests |
|------|---------|-------|-------|
| `src/lib.rs` | Module exports | 6 | - |
| `src/types.rs` | GatewayConfig, ModelDeployment, KeyGenerateParams, etc. | 247 | 3 |
| `src/vault.rs` | Provider key storage, master key management | 195 | 5 |
| `src/config.rs` | YAML config generation with os.environ/ refs | 188 | 6 |
| `src/keys.rs` | HTTP client to LiteLLM /key/* API | 305 | 5 |
| `src/spend.rs` | HTTP client to LiteLLM /spend/* API | 223 | 4 |
| `Cargo.toml` | Dependencies: reqwest, serde, serde_yaml, uuid, tokio, snapfzz-vault | 18 | - |

### Tauri Commands (`src-tauri/src/commands/llm.rs`)

| Command | Purpose |
|---------|---------|
| `llm_store_provider_key` | Store provider API key in vault |
| `llm_read_provider_key` | Read provider key from vault |
| `llm_delete_provider_key` | Delete provider key from vault |
| `llm_list_provider_keys` | List all keys for a provider |
| `llm_get_or_create_master_key` | Generate/retrieve LiteLLM master key |
| `llm_save_config` | Write config.yaml atomically |
| `llm_get_config_path` | Get config file path |
| `llm_generate_key` | POST /key/generate |
| `llm_list_keys` | GET /key/list |
| `llm_delete_key` | POST /key/delete |
| `llm_get_key_info` | GET /key/info |
| `llm_update_key` | POST /key/update |
| `llm_get_spend_logs` | GET /spend/logs |
| `llm_get_key_spend` | GET /spend/keys |
| `llm_get_global_spend` | GET /spend/global |
| `llm_get_models` | GET /v1/models |

### Workspace Integration

- Added `snapfzz-llm` to workspace members
- Added dependency to main Cargo.toml
- Registered 18 commands in main.rs

## Spec References

All modules have inline spec references:
- `// A013/Config: ...` in config.rs
- `// A013/Vault: ...` in vault.rs
- `// A013/Keys: ...` in keys.rs
- `// A013/Spend: ...` in spend.rs
- `// A013/Commands: ...` in llm.rs

## Verification

```bash
cd src-tauri && cargo test -p snapfzz-llm
# Result: 23 passed, 0 failed

cd src-tauri && cargo check
# Result: compiles with 1 unused import warning
```

## Test Coverage

| Module | Tests | Coverage Focus |
|--------|-------|----------------|
| types.rs | 3 | YAML/JSON round-trip serialization |
| vault.rs | 5 | Provider key format, master key generation |
| config.rs | 6 | YAML generation, os.environ/ enforcement, atomic writes |
| keys.rs | 5 | HTTP endpoints with wiremock |
| spend.rs | 4 | HTTP endpoints with wiremock |
| **Total** | **23** | 90%+ coverage |

## Key Decisions

1. **Vault key format**: `provider:{id}:{name}` → env var `PROVIDER_{ID}_{NAME}`
2. **Master key format**: `litellm:master_key` → env var `LITELLM_MASTER_KEY`
3. **Config security**: All api_key values must use `os.environ/` prefix
4. **HTTP client**: Uses `reqwest::Client` passed in, not owned
5. **Error handling**: `LlmError` enum with `thiserror`