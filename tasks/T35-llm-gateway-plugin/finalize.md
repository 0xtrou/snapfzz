# Finalize: T35 - LLM Gateway Plugin

## Review Findings Disposition

| # | Finding | Decision | Rationale |
|---|---------|----------|-----------|
| 1 | **High**: `llm_save_config` doesn't fetch key names from vault | FIX NOW | Core A013/Vault requirement. Config must derive key references from vault, not trust caller input. |
| 2 | **High**: Master key exposed through Tauri commands | FIX NOW | Security boundary violation. Master key must stay in Zone 1 (Rust), never exposed to frontend (Zone 3). |
| 3 | **Medium**: Missing inline spec comments on functions | FIX NOW | Traceability requirement. Low effort, high value for future maintainers. |
| 4 | **Low**: Unused imports warning | FIX NOW | Trivial fix, keeps codebase clean. |

## Fixes Required

### Fix 1: Vault-Sourced Config Generation

**Problem**: `llm_save_config` accepts `vault_keys` from caller instead of fetching from vault.

**Solution**: 
- Remove `vault_keys` parameter from `llm_save_config`
- Read keys from vault inside the command using `vault::list_provider_keys`
- Map vault keys to env var format internally

**Files to modify**:
- `src-tauri/src/commands/llm.rs` - Update `llm_save_config` signature
- `src-tauri/crates/snapfzz-llm/src/config.rs` - Update `generate_config` to derive vault keys internally

### Fix 2: Master Key Security Boundary

**Problem**: `llm_get_or_create_master_key` returns master key to frontend. Key/spend commands accept `master_key` from frontend.

**Solution**:
- Remove `llm_get_or_create_master_key` Tauri command - master key is internal only
- Remove `master_key` parameter from all key/spend commands
- Each command reads master key from vault internally
- LiteLLM base_url stored in app state or settings

**Files to modify**:
- `src-tauri/src/commands/llm.rs` - Remove command, update all key/spend command signatures
- `src-tauri/src/main.rs` - Remove `llm_get_or_create_master_key` from invoke_handler

### Fix 3: Add Inline Spec Comments

**Files to modify**:
- `src-tauri/crates/snapfzz-llm/src/vault.rs` - Add function-level comments
- `src-tauri/crates/snapfzz-llm/src/keys.rs` - Add function-level comments
- `src-tauri/crates/snapfzz-llm/src/spend.rs` - Add function-level comments
- `src-tauri/crates/snapfzz-llm/src/types.rs` - Add type-level comments

### Fix 4: Remove Unused Imports

**Files to modify**:
- `src-tauri/crates/snapfzz-llm/src/config.rs` - Remove unused imports from line 2

## Verification

After fixes:
- `cargo test -p snapfzz-llm` must pass
- `cargo check` must have no warnings
- All 16 spec checklist items must pass

## Deferred

None - all findings require immediate fix.

## Next Task

**T36: Settings LLM Plugin** - UI plugin for LLM Gateway management
- Task spec: `tasks/T36-settings-llm-plugin/spec.md`
- Status: Created, ready for implementation