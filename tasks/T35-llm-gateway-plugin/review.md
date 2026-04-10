# Review: T35 - LLM Gateway Plugin

## Verdict: FAIL

## Checklist
| # | Check | Status | Evidence (file:line) | Spec |
|---|-------|--------|---------------------|------|
| 1 | generate_config produces valid YAML | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/config.rs:8-37`, test `:117-124` | A013/Config |
| 2 | model_list includes all enabled providers | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/config.rs:19-26`, test `:127-136` | A013/Config |
| 3 | router_settings includes strategy and aliases | ✅ PASS | test `src-tauri/crates/snapfzz-llm/src/config.rs:139-147` | A013/Config |
| 4 | master_key uses env var reference | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/config.rs:9-17`, test `:150-160` | A013/Config |
| 5 | config written atomically | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/config.rs:39-53`, test `:163-181` | A013/Config |
| 6 | generate_key calls POST /key/generate | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/keys.rs:4-11`, test `:142-173` | A013/Keys |
| 7 | list_keys calls GET /key/list with pagination | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/keys.rs:13-33`, test `:176-207` | A013/Keys |
| 8 | delete_key calls POST /key/delete | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/keys.rs:35-61`, test `:210-229` | A013/Keys |
| 9 | get_key_info calls GET /key/info | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/keys.rs:63-75`, test `:232-259` | A013/Keys |
| 10 | get_spend_logs calls /spend/logs with date filters | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/spend.rs:4-37`, test `:100-141` | A013/Spend |
| 11 | get_key_spend returns per-key spend | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/spend.rs:39-51`, test `:144-167` | A013/Spend |
| 12 | get_global_spend returns total spend | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/spend.rs:53-63`, test `:170-195` | A013/Spend |
| 13 | provider keys stored with `provider:{id}:{name}` format | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/vault.rs:88-90`, test `:135-143` | A013/Vault |
| 14 | config generation fetches key names from vault | ❌ FAIL | `llm_save_config` accepts caller-provided `vault_keys` (`src-tauri/src/commands/llm.rs:70-83`); no vault read in config path | A013/Vault |
| 15 | master_key generated on first boot if missing | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/vault.rs:60-74`, test `:159-172` | A013/Vault |
| 16 | config.yaml uses `os.environ/` references | ✅ PASS | `src-tauri/crates/snapfzz-llm/src/config.rs:9-26`; vault env var mapping `src-tauri/crates/snapfzz-llm/src/vault.rs:76-86` | A013/Vault |
| 17 | Vault integration for all provider key storage paths | ⚠️ PARTIAL | Provider secrets use vault (`src-tauri/src/commands/llm.rs:15-56`), but config save does not source keys from vault (`:70-83`) | A013/Vault + Security |
| 18 | Test coverage ≥90% | ✅ PASS | `cargo llvm-cov -p snapfzz-llm --summary-only`: TOTAL Regions 96.32%, Lines 97.79% | REVIEW_GUIDE / ENGINEERING_GUIDE |
| 19 | No TODO/FIXME/HACK | ✅ PASS | grep in crate returned no matches | AGENTS Hard Rules |
| 20 | Tauri commands registered in handler | ✅ PASS | `src-tauri/src/main.rs:148-163` | A013/Commands |

## What's Good
- Core A013 behavior for Config/Keys/Spend is implemented with focused modules and passing tests.
- Endpoint contracts map correctly to LiteLLM APIs (`/key/*`, `/spend/*`, `/v1/models`).
- Atomic config write and `os.environ/` guardrails are implemented and tested.
- Vault naming + env-var normalization are implemented and covered by unit tests.
- Diagnostics are clean for reviewed files (no LSP errors).

## What Needs Fixing
| # | Severity | Finding | Fix Instructions |
|---|----------|---------|-----------------|
| 1 | High | **A013/Vault requirement not met:** config generation path does not fetch key names from vault. `llm_save_config` trusts externally supplied `vault_keys` instead of reading vault directly. | Change `llm_save_config` API to take provider inputs and vault state, then resolve key names from `SecretVault` via `vault::list_provider_keys(...)` internally before `generate_config`. Remove caller-controlled `vault_keys` parameter. Add tests proving vault-derived key list drives generated YAML. |
| 2 | High | **Security boundary issue (A013 §8):** master key is passed from frontend to key/spend commands and can be returned by `llm_get_or_create_master_key`. Spec says virtual keys are created via master key and "never exposed to frontend." | Keep master key in Zone-1 only. In commands, read master key from vault internally (`get_or_create_master_key`) and stop accepting/returning raw master key in Tauri command payloads. Update command signatures + tests accordingly. |
| 3 | Medium | Inline spec references are mostly at section/test level; non-trivial production functions are missing per-function spec comments in several files (`types.rs`, `keys.rs`, `spend.rs`, `vault.rs`). | Add concise `// A013/...` comments on non-obvious architectural/security decisions (env var enforcement, endpoint auth, vault naming conventions, atomic write rationale) at function level where applicable. |
| 4 | Low | Build warning: unused imports in `config.rs` during `cargo test`. | Remove unused imports (`DefaultKeyGenerateParams`, `GeneralSettings`, `LiteLLMParams`, `LiteLLMSettings`, `ModelDeployment`, `RouterSettings`) from production module import list. |
