# Review: T36 - Settings LLM Plugin

## Verdict: FAIL

## Checklist
| # | Check | Status | Evidence (file:line) | Spec |
|---|-------|--------|---------------------|------|
| 1 | Plugin registered as settings plugin using existing pattern | PASS | `plugins/settings-llm/src/index.ts:3-20` mirrors `plugins/settings-vault/src/index.ts:3-20` (`definePlugin`, `surface:['preferences']`, lazy `component` import) | A005 + A013 §4 |
| 2 | 4 required tabs exist in UI shell | PASS | `plugins/settings-llm/src/LlmSettings.tsx:24-63` defines Providers, API Keys, Routing, Audit Log tabs | A013 §4 |
| 3 | Providers tab supports provider key management | PASS | `plugins/settings-llm/src/tabs/ProvidersTab.tsx:49-61,117-120,133-134` uses `listProviderKeys/deleteProviderKey/storeProviderKey` | A013 §4 + §2 |
| 4 | Providers tab writes model deployment config (`config.yaml`) | FAIL | `saveConfig()` and `llm_save_config` exist only in hook (`plugins/settings-llm/src/hooks/useLlmCommands.ts:150-158`); grep found no UI call sites in `LlmSettings.tsx`/`ProvidersTab.tsx` | A013 §1 + §4 |
| 5 | API Keys tab manages virtual keys with budgets via `/key/*` | PASS | `plugins/settings-llm/src/tabs/ApiKeysTab.tsx:52,114,144`; hook mapping in `plugins/settings-llm/src/hooks/useLlmCommands.ts:168-195`; backend commands in `src-tauri/src/commands/llm.rs:91-140` + `src-tauri/src/main.rs:153-155` | A013 §2 + §4 |
| 6 | Routing tab implements model groups, aliases, and strategies | FAIL | `plugins/settings-llm/src/tabs/RoutingTab.tsx:20-29` is a “Coming Soon” placeholder; no routing form/state/save | A013 §4 |
| 7 | Audit Log tab reads request logs from spend API | PASS | `plugins/settings-llm/src/tabs/AuditLogTab.tsx:24-31` calls `getSpendLogs`; hook maps to `llm_get_spend_logs` at `plugins/settings-llm/src/hooks/useLlmCommands.ts:218-225`; backend in `src-tauri/src/commands/llm.rs:180-194` | A013 §3 + §4 |
| 8 | Tauri hooks use shared bridge (no raw Tauri internals) | PASS | `plugins/settings-llm/src/hooks/useLlmCommands.ts:1-3` uses `createTauriBridge`; grep found no `__TAURI_INTERNALS__` / `@tauri-apps/api/core` usage in plugin source | ENGINEERING_GUIDE Tauri IPC |
| 9 | Master key never exposed to frontend | PASS | Frontend sends no master key payloads (`plugins/settings-llm/src/hooks/useLlmCommands.ts:120-247`); backend reads vault internally (`src-tauri/src/commands/llm.rs:96-99,114-117,131-134,148-151,166-169,185-188`) | A013 §8 |
| 10 | Package dependencies align with usage and settings plugin pattern | PASS WITH NOTES | Pattern matches vault/general (`plugins/settings-llm/package.json:13-19` vs `plugins/settings-vault/package.json:13-18`), but `@tauri-apps/api` is declared at `plugins/settings-llm/package.json:16` and grep found no usage in `plugins/settings-llm/src/**/*.ts(x)` | A005 + REVIEW_GUIDE §5 |
| 11 | No TODO/FIXME/HACK markers in plugin | PASS | grep `TODO|FIXME|HACK|XXX` on `plugins/settings-llm` returned 0 matches | AGENTS hard rules + REVIEW_GUIDE |
| 12 | Tests pass | PASS | `pnpm test` in `plugins/settings-llm`: 5 files, 17 tests passed | REVIEW_GUIDE §5 |
| 13 | Coverage meets ≥90% requirement | FAIL | `pnpm test:coverage` failed thresholds: lines 59.7%, branches 55.26%, funcs 50%, statements 59.12% | ENGINEERING_GUIDE + REVIEW_GUIDE |
| 14 | Tests trace to spec naming/header convention | FAIL | Tests use generic names (e.g., `plugins/settings-llm/src/__tests__/LlmSettings.test.tsx:25`); no `// Spec:` headers found in plugin tests | AGENTS.md + REVIEW_GUIDE §3 |
| 15 | Spec references present for non-obvious architectural decisions | FAIL | Only `plugins/settings-llm/src/hooks/useLlmCommands.ts:5,118,148,166,216` has A013 comments; UI files (`LlmSettings.tsx`, all tab components) lack spec-linked comments | REVIEW_GUIDE §4 |

## What's Good
- Plugin contract is correct (`definePlugin`, preferences surface, lazy section component).
- Tab shell includes all four required sections and is navigable.
- Provider key, virtual key, and spend-log actions are wired through command hooks and mapped to backend Tauri commands.
- Tauri IPC abstraction is correctly centralized in `createTauriBridge()` wrappers.
- Security boundary is intact: master key retrieval stays in Rust/vault, not frontend.
- No TODO/FIXME/HACK markers found.

## What Needs Fixing
| # | Severity | Finding | Fix Instructions |
|---|----------|---------|-----------------|
| 1 | High | Providers tab does not implement model deployment/config write behavior (`config.yaml`) required by spec. | Add deployment editor UI (`model_list` entries, provider binding, rpm/tpm/api_base), call `saveConfig()`/`llm_save_config` on save, and provide config path/reload UX per A013 §1/§4. |
| 2 | High | Routing tab is not implemented; currently placeholder only. | Replace placeholder with functional routing UI for `routing_strategy`, `model_group_alias`, and fallback rules; persist via config save flow. |
| 3 | High | Coverage is far below required 90% thresholds; coverage command fails. | Expand tests for hook wrappers, index contribution, mutation flows (create/delete/copy), error paths, and new providers/routing save flows until `pnpm test:coverage` passes all 90% gates. |
| 4 | Medium | Tests are not spec-traceable (`A013/...`) and lack `// Spec:` headers. | Rename test cases to spec-prefixed format and add file-level spec headers mapping each suite to A013 sections. |
| 5 | Medium | Missing spec-linked inline comments in UI files for key architectural decisions. | Add targeted `// A013/...` comments in `LlmSettings.tsx` and tab files where behavior enforces spec/security constraints. |
| 6 | Low | `@tauri-apps/api` is declared but unused in plugin source. | Remove unused dependency from `plugins/settings-llm/package.json` unless a concrete source usage is added through approved shared abstractions. | 
| 7 | Low | Frontend hook type still includes `general_settings.master_key` field, even though master key is backend-only. | Remove or harden this field from frontend-editable types to reduce accidental exposure risk and keep contract aligned with A013 security intent. |
