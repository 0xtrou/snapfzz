# Review: T31 System Components

## Verdict: FAIL

## Summary
Kernel-side component contract and wiring are solid, but frontend coverage/spec alignment is not shippable yet. The new `SystemComponentCard` flow replaced older miniapp CEF onboarding behavior, while the existing advanced settings test suite still asserts the old `miniapps-onboarding` contract and now fails.

## Checklist
| # | Check | Status | Evidence (file:line / command) |
|---|---|---|---|
| 1 | Spec compliance — `SystemComponent` follows A014 kernel architecture | PASS | Trait contract in `src-tauri/crates/snapfzz-kernel/src/components/component.rs:72-84`; registry orchestration in `src-tauri/crates/snapfzz-kernel/src/components/registry.rs:6-41`; registration in `src-tauri/src/main.rs:54-57` |
| 2 | Zone boundaries — computation in Zone 1, frontend render-only | PASS WITH NOTES | Heavy work remains Rust-side (`download_file`, checksum, extraction) in `src-tauri/crates/snapfzz-kernel/src/components/download.rs:37-142`; frontend mostly orchestration/UI in `plugins/settings-advanced/src/SystemComponentCard.tsx:68-221` |
| 3 | No circular deps — `snapfzz-cef` depends on `snapfzz-kernel`, not vice versa | PASS | `src-tauri/crates/snapfzz-cef/Cargo.toml:7` has `snapfzz-kernel`; grep in kernel for `snapfzz_cef` returned no matches |
| 4 | Contract-driven `SystemComponent` trait | PASS | Contract methods (`resolve/download/cancel/verify/extract`) centralized in `component.rs:72-84`; impl in `src-tauri/crates/snapfzz-cef/src/download.rs:336-419` |
| 5 | Test coverage + spec-prefixed tests + edge cases | FAIL | Rust coverage in reviewed area is good (`a014_...` tests in kernel/components + commands/components). Frontend suite is currently failing and stale for new flow: `pnpm --filter @snapfzz/settings-advanced exec vitest run src/__tests__/AdvancedSettings.test.tsx` → 11 failed tests expecting `miniapps-onboarding`; UI now exposes `component-card-cef` (`SystemComponentCard.tsx:153`, `AdvancedSettings.tsx:85`) |
| 6 | No TODO/FIXME/HACK | PASS | grep `TODO|FIXME|HACK` on reviewed Rust/TS files returned no matches |
| 7 | No type suppressions (`as any`, `@ts-ignore`) | PASS | grep `as any|@ts-ignore` in `plugins/settings-advanced/src` returned no matches |
| 8 | Inline spec comments on key decisions | FAIL | No spec-cited inline comments in reviewed T31 files (`component.rs`, `download.rs`, `registry.rs`, `commands/components.rs`, `SystemComponentCard.tsx`, `AdvancedSettings.tsx`) |
| 9 | Error handling descriptive + user-safe | PASS WITH NOTES | Backend errors are explicit (`Component '{id}' not found`, network/checksum errors). UI does surface generic failure (`Download failed. Try again.`) and caught error messages (`SystemComponentCard.tsx:123-129`) |
| 10 | Security — no secrets in logs, no path traversal risk | PASS | No secret material logged; folder open path comes from backend-provided install path (`SystemComponentCard.tsx:140-144`) |

## Findings (must-fix)

1. **Frontend test contract drift (blocking)**
   - `AdvancedSettings` now renders `SystemComponentCard componentId="cef"` (`plugins/settings-advanced/src/AdvancedSettings.tsx:85`), but tests still assert old miniapp onboarding nodes and commands (`miniapps-onboarding`, `cef_download_start`, etc.).
   - Result: package test command fails (11 failing tests), so T31 is not verifiably correct.
   - **Fix**: Update `plugins/settings-advanced/src/__tests__/AdvancedSettings.test.tsx` to cover current commands and DOM contract:
     - `component_status`, `component_info`, `component_download`, `component_download_cancel`, `open_path`
     - `data-testid="component-card-cef"` and current messaging/checklist states.

2. **Missing inline spec traceability comments (blocking per review rules)**
   - Architectural decisions were added (kernel trait boundary + CEF adapter + new settings card contract) without `// Per A014/...` or `// Per A015/...` comments in reviewed files.
   - **Fix**: Add concise spec-cited comments at non-obvious boundaries:
     - `SystemComponent` trait definition
     - CEF→kernel status mapping in `snapfzz-cef/src/download.rs:387-395`
     - UI orchestration assumptions in `SystemComponentCard`.

## Non-blocking notes

- `src-tauri/crates/snapfzz-cef/src/download.rs:394` has an unreachable `_` pattern warning in status mapping (all variants already matched). Clean up to keep warning budget at zero.

## Verification Commands Run

- `cargo test -p snapfzz-kernel components:: --lib` ✅ (20 passed)
- `cargo test -p snapfzz --bin Snapfzz commands::components::` ✅ (17 passed)
- `pnpm --filter @snapfzz/settings-advanced exec vitest run src/__tests__/AdvancedSettings.test.tsx` ❌ (11 failed, stale A015 miniapp onboarding expectations)
- grep checks:
  - `TODO|FIXME|HACK` on reviewed files ✅ none
  - `as any|@ts-ignore` in settings-advanced ✅ none
  - kernel import of `snapfzz_cef` ✅ none
