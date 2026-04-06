# Build: T15 — Test Trustworthiness Fixes

## Context

5-Oracle audit reviewed all 32 test files (28 TS + 4 Rust). Tests are above average but have systematic blind spots that would let real regressions ship. This task fixes all findings.

**Read before coding:**
- `AGENTS.md` — philosophy, zone model, hard rules
- `ENGINEERING_GUIDE.md` — test naming, TDD, coverage requirements
- `REVIEW_GUIDE.md` — what constitutes a valid test

---

## 5 Questions
1. Which spec? → A005, A006, A007, A008, U009, REVIEW_GUIDE
2. Which zone? → Zone 1 (Rust tests), Zone 2 (plugin-host tests), Zone 3 (React/shell/plugin tests)
3. Core or plugin? → Both — core (plugin-host, shells, budget) + plugin (chat, settings)
4. Existing pattern? → Match each test file's existing style. Do not restructure.
5. Test name? → All new tests MUST use `{spec}/{section}: {behavior}` format

---

## Fixes — Ordered by Priority

### P0 — Would Let Real Bugs Ship

#### 1. Remove `expect(true).toBe(true)` bailouts (3 instances)

These tests **cannot fail**. Replace with real assertions.

| File | ~Line | Fix |
|---|---|---|
| `plugins/settings-runtime/src/__tests__/RuntimeSettings.test.tsx` | ~216 | `.catch()` bailout → assert `save_settings` was called OR assert error state renders |
| `plugins/settings-advanced/src/__tests__/AdvancedSettings.test.tsx` | ~245 | `if (resetBtn) else expect(true)` → use `screen.getByRole()` (throws if missing) |
| `plugins/settings-advanced/src/__tests__/AdvancedSettings.test.tsx` | ~532 | Same pattern → same fix |

**Verify**: `grep -rn "expect(true)" plugins/ frontend/` returns 0 results.

#### 2. Shell surface identity verification (3 files)

All 3 shell tests mock PluginHost but never verify the constructor receives the correct surface. A bug swapping `'launcher'`↔`'project'` passes green.

| File | Fix |
|---|---|
| `frontend/packages/launcher/src/app/App.test.tsx` | Capture PluginHost constructor args → assert surface === `'launcher'` |
| `frontend/packages/project/src/app/App.test.tsx` | Same → assert `'project'` |
| `frontend/packages/preferences/src/app/App.test.tsx` | Same → assert `'preferences'` |

Add one test per file: `A007/shell: creates PluginHost with surface '{name}'`

#### 3. Test `enforce_loop` (Rust)

`src-tauri/crates/snapfzz-budget/src/lib.rs:110-142` — the Budget Registry monitoring kernel — has zero tests.

In `src-tauri/crates/snapfzz-budget/src/registry_test.rs`, add:
- `a008_registry_enforce_loop_checks_memory` — register process with low memory limit, verify `is_memory_exceeded` detects it
- `a008_registry_enforce_loop_emits_snapshot` — verify snapshot reflects enforcement state
- Use `tokio::time::pause()` + `tokio::select!` with timeout for deterministic control

---

### P1 — Significant Gaps

#### 4. Rewrite plugin discovery tests

`frontend/packages/plugin-host/src/plugin-discovery.test.ts` — both tests are vacuous (verify empty state). One spies on wrong method (`registerWithLoader` instead of `register`).

- Delete both existing tests
- Add: `A006/boot: discoverPlugins returns plugins for launcher surface`
- Add: `A006/boot: discoverPlugins returns plugins for project surface`
- Add: `A006/boot: registerDiscoveredPlugins calls host.register for each manifest`
- Add: `A006/boot: discoverPlugins continues on import failure`
- Add spec header comment

#### 5. Preferences shell tests (1 test → full coverage)

`frontend/packages/preferences/src/app/App.test.tsx` has 1 test for 135 lines of shell logic.

Add:
- `A007/preferences: renders sections from store sorted by order`
- `A007/preferences: auto-selects first section on mount`
- `A007/preferences: clicking sidebar selects section`
- `A005/isolation: crash in section triggers reportCrash`
- `A003/InstantLoading: shows skeleton before hydration`
- Add spec header comment: `// Spec: A007, A005, A003`

#### 6. Rust concurrency tests (0 thread tests across all 4 files)

All concurrent primitives (`Arc<Semaphore>`, `DashMap`, `AtomicU64`) are untested under concurrent load.

In `controlled_test.rs`:
- `a008_controlled_concurrent_acquire_respects_limit` — N threads race for M permits, exactly M succeed

In `supervised_test.rs`:
- `a008_supervised_concurrent_register_and_health_failure` — no panics, no data corruption

In `registry_test.rs`:
- `a008_registry_concurrent_snapshot_consistent` — cpu_used + cpu_available == cpu_total under contention

Use `std::thread::spawn` + `Arc` + `std::sync::Barrier` for synchronized start.

#### 7. PluginContext subsystem tests (3/7 untested)

`frontend/packages/plugin-host/src/plugin-context-factory.test.ts` — `context.registry`, `context.storage`, `context.apis` have zero tests.

Add:
- `A005/context/registry: registerTab adds to store, dispose removes`
- `A005/context/storage: set/get with namespace prefix`
- `A005/context/apis: provide and get with token`
- `A005/context/settings: onChange fires on update`
- `A005/context/dispose: disposePluginContext cleans up all subsystems`

#### 8. Replace emoji icons in chat components

REVIEW_GUIDE explicitly rejects emoji as icons. Chat components use: `💭`, `🔧`, `✓`, `✕`, `↓`, `●`, `○`.

| File | Emoji | Replacement |
|---|---|---|
| `plugins/chat/src/components/ThinkingCallout.tsx` | `💭` | `<BulbOutlined />` or `<ThunderboltOutlined />` |
| `plugins/chat/src/components/ToolUseCard.tsx` | `🔧` | `<ToolOutlined />` |
| `plugins/chat/src/components/ToolUseCard.tsx` | `✓`/`✕` | `<CheckOutlined />`/`<CloseOutlined />` |
| `plugins/chat/src/components/ScrollPill.tsx` | `↓` | `<ArrowDownOutlined />` |
| `plugins/chat/src/components/ConnectionStatus.tsx` | `●`/`○` | CSS dot with `var(--color-success)` or `<CheckCircleFilled />` |

Update all corresponding test assertions in `components.test.tsx`, `ConnectionStatus.test.tsx`.

**Verify**: `grep -rn "💭\|🔧\|✓\|✕\|●\|○" plugins/chat/src/` returns 0 results (excluding test comments).

#### 9. Chat stream resilience tests

In `plugins/chat/src/__tests__/use-chat.test.ts`:
- `chat/stream: recovers from SSE disconnect mid-message`
- `chat/stream: handles malformed batch gracefully`
- `chat/stream: reconnect after health check failure`

In `plugins/chat/src/__tests__/markdown.test.ts`:
- `chat/markdown: unclosed code fence returns best-effort segments`
- `chat/markdown: nested inline bold+italic`
- Strengthen CRLF test (currently asserts only `segments.length > 0` → assert actual content)

---

### P2 — Compliance Gaps

#### 10. Add header comments to component test files

0/6 settings `.test.tsx` files have the required spec header. Add `// Spec: A007/...` header to:

- `plugins/settings-general/src/__tests__/GeneralSettings.test.tsx`
- `plugins/settings-runtime/src/__tests__/RuntimeSettings.test.tsx`
- `plugins/settings-performance/src/__tests__/PerformanceSettings.test.tsx`
- `plugins/settings-plugins/src/__tests__/PluginsSettings.test.tsx`
- `plugins/settings-advanced/src/__tests__/AdvancedSettings.test.tsx`
- `plugins/settings-processes/src/__tests__/ProcessesSettings.test.tsx`

Also fix missing header in:
- `plugins/settings-general/src/__tests__/index.test.ts`
- `plugins/settings-processes/src/__tests__/index.test.ts`

#### 11. Rust strike window expiration test

`src-tauri/crates/snapfzz-budget/src/controlled.rs:86-91` — the `retain` logic that prunes old strikes is never exercised.

In `controlled_test.rs`:
- `a008_controlled_strike_window_expiry` — short `strike_window_secs` (1s), record 2 strikes, sleep >1s, record 1 more, assert plugin NOT disabled (only 1 active strike)

---

## Verification Checklist

After ALL fixes:

```bash
# Frontend tests
cd frontend && npx vitest run                              # all pass
grep -rn "expect(true)" plugins/ frontend/                 # 0 results
grep -rn "💭\|🔧\|✓\|✕\|●\|○" plugins/chat/src/          # 0 results (excl tests)

# Rust tests
cd src-tauri && cargo test -p snapfzz-budget               # all pass

# Coverage still ≥90%
pnpm --filter @snapfzz/plugin-host exec npx vitest run --coverage
pnpm --filter chat exec npx vitest run --coverage
```
