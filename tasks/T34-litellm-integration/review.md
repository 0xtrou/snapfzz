# Review: T34 LiteLLM Integration

## Verdict: FAIL

## Checklist
| # | Check | Status | Evidence (file:line) | Spec |
|---|-------|--------|---------------------|------|
| 1 | `spawn_litellm()` exists and uses `LiteLLMService`/`spawn_process()` | PASS | `src-tauri/src/helpers.rs:230-307` | `tasks/T34-litellm-integration/spec.md:31-40`, `docs/plans/A013-llm-providers.md:3-12` |
| 2 | `restart_process()` dispatches by managed service id | PASS | `src-tauri/src/commands/process.rs:75-110` | `tasks/T34-litellm-integration/spec.md:42-67` |
| 3 | Ports/config follow task + philosophy requirements | FAIL | `src-tauri/src/helpers.rs:20-21`, `src-tauri/src/helpers.rs:91-104`, `src-tauri/src/helpers.rs:237`, `tasks/T34-litellm-integration/spec.md:69-76` | `docs/plans/A013-llm-providers.md:22-35`, `AGENTS.md:13-21` |
| 4 | LiteLLM budget setup mirrors existing managed-service pattern | FAIL | `src-tauri/src/helpers.rs:180-205`, `src-tauri/src/helpers.rs:260-276` | `tasks/T34-litellm-integration/spec.md:33-40`, `AGENTS.md:13-21` |
| 5 | Required tests cover the new behavior | FAIL | `src-tauri/src/helpers.rs:582-730`, `src-tauri/src/commands/process.rs:338-437`, `tasks/T34-litellm-integration/spec.md:87-98` | `tasks/T34-litellm-integration/spec.md:87-98`, `REVIEW_GUIDE.md:95-102` |
| 6 | Claimed green test result is reproducible | FAIL | `tasks/T34-litellm-integration/build.md:94-107`, `src-tauri/src/helpers.rs:588-617` | `tasks/T34-litellm-integration/spec.md:114-115`, `REVIEW_GUIDE.md:52-63` |
| 7 | No `TODO` / `FIXME` / `HACK` in reviewed files | PASS | `grep -rn "TODO\|FIXME\|HACK" src-tauri/src` → no matches | `AGENTS.md:72-80`, `tasks/T34-litellm-integration/spec.md:100-106` |
| 8 | Coverage ≥ 90% is verified | FAIL | `tasks/T34-litellm-integration/build.md:94-107` (only `cargo test`; no coverage run/output) | `tasks/T34-litellm-integration/spec.md:105`, `tasks/T34-litellm-integration/spec.md:115`, `REVIEW_GUIDE.md:99-102` |

## What's Good

- `spawn_litellm()` is wired through the same `ManagedService` abstraction used by `AgentScopeService`, which matches the A033 direction for managed services. (`src-tauri/src/helpers.rs:230-307`, `src-tauri/crates/snapfzz-packs/src/runtime/litellm.rs:17-76`)
- `restart_process()` now dispatches by service id instead of unconditionally respawning AgentScope. (`src-tauri/src/commands/process.rs:87-108`)
- Inline spec comments were added on the main implementation paths, and the reviewed files contain no `TODO`/`FIXME`/`HACK` markers.

## What Needs Fixing
| # | Severity | Finding | Fix Instructions |
|---|----------|---------|-----------------|
| 1 | CRITICAL | **Ports are still hardcoded.** `AGENTSCOPE_PORT` and `LITELLM_PORT` are fixed constants, `resolve_litellm_spawn_config()` always returns port `4000`, and the comment explicitly locks LiteLLM to `localhost:4000`. This conflicts with the user's stated requirement for auto-random managed-process ports and also means LiteLLM is not actually configurable from settings. | Remove fixed port constants from the helper path for managed processes. Introduce dynamic port allocation for both AgentScope and LiteLLM, persist/propagate the chosen port through settings/runtime state, and update health URLs + emitted metadata accordingly. Ensure LiteLLM does not reuse `agentscope_host`/port defaults as a hidden surrogate config. |
| 2 | HIGH | **LiteLLM budget setup does not mirror `spawn_agentscope()` exactly.** `spawn_agentscope()` clamps memory against the preset (`min(preset_max_memory)`), but `spawn_litellm()` reads the preset memory and then discards it, using `limits.max_memory_mb` directly. That breaks the “mirror exactly” requirement and weakens the budget discipline in AGENTS philosophy. | Apply the same preset memory clamp in `spawn_litellm()` that `spawn_agentscope()` uses, or factor both helpers through one shared budget-construction path so they cannot drift. |
| 3 | HIGH | **Required tests are missing / too weak.** The spec requires tests for: (a) successful LiteLLM spawn with correct config, (b) dependency-not-installed error path, (c) registration in `BudgetRegistry`, and (d) restart dispatch for LiteLLM. The actual tests only cover failure-message formatting, fixed-port config resolution, an “intelligence dir missing” path, and `restart_process()` returning `Ok`. None of them verifies registration in the registry, and the missing-dependency path is not directly tested. | Add the exact required tests from `spec.md`: assert `spawn_litellm()` registers the process/budget, assert the dependency-not-installed path when LiteLLM runtime packages are absent, and strengthen restart tests so they verify the service-specific side effect rather than only `Ok(())`. |
| 4 | HIGH | **Build output claims all tests pass, but the T34 test set is not reproducibly green.** Running `cargo test --package snapfzz t34_` fails in `t34_spawn_litellm_resolve_spawn_config_uses_default_host_and_fixed_port` because `resolve_litellm_spawn_config()` cannot find the `intelligence/` directory. That means success criterion 5 (“All tests pass”) is not met. | Fix the brittle test setup so it creates the repo layout expected by `resolve_intelligence_dir()` (or refactor the helper to accept an injectable working-dir resolver in tests). Re-run the T34 tests and update `build.md` with the real output only after they pass. |
| 5 | MEDIUM | **Coverage threshold was not verified.** The build output only shows `cargo test --package snapfzz`; there is no coverage command/output proving the required ≥90% threshold for this work. | Run the project’s Rust coverage workflow (for example via the repo’s coverage command/tooling), record the result in `build.md`, and confirm the new LiteLLM paths are included in that coverage number. |

## Verification Notes

- Verified symbols via grep: `spawn_litellm`, `resolve_litellm_spawn_config`, `spawn_litellm_failure`, and T34 restart tests all exist in the changed files.
- `lsp_diagnostics` on `src-tauri/src/helpers.rs` and `src-tauri/src/commands/process.rs` returned clean.
- Reproduction check: `cargo test --package snapfzz t34_` failed on `helpers::tests::t34_spawn_litellm_resolve_spawn_config_uses_default_host_and_fixed_port` with `"Unable to find intelligence/ directory"`.
