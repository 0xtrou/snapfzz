# T23 — Preflight Hookable Lifecycle Build Report

## Scope
Implemented A012 Hookable Lifecycle in `snapfzz-preflight` with extensible hook registration and phase-scoped context, while preserving existing built-in sync phases and degraded-mode behavior.

## 5 Questions (AGENTS.md)
1. Which spec? → `A012-preflight-service.md` (Hookable Lifecycle section).
2. Which zone? → Zone 1 (Rust preflight/runtime initialization).
3. Core or plugin? → Core infrastructure (`snapfzz-preflight`, `main.rs` boot flow).
4. Existing pattern? → Existing `PreflightService` phase sequencing and `main.rs` preflight delegation.
5. Test name? → `A012/hooks: ...` coverage added as concrete unit tests.

## Changes Made

### 1) Hook lifecycle primitives in `snapfzz-preflight`
- Added `Phase` enum:
  - `Filesystem`, `Vault`, `Settings`, `Budget`
- Added `PreflightContext` with incremental state:
  - `data_dir: PathBuf`
  - `settings: Option<PreflightSettings>`
  - `registry: Option<Arc<BudgetRegistry>>`
- Added strict accessors with required panic messages:
  - `settings()` → `"[preflight] settings accessed before Phase 3"`
  - `registry()` → `"[preflight] registry accessed before Phase 4"`
- Added setters:
  - `set_settings(...)`
  - `set_registry(...)`

### 2) Hook traits
- Added `OnPreflightInit: Send + Sync`
- Added `OnPreflightReady: Send + Sync`
- Added `OnPreflightAsync: Send + Sync`
  - Uses `Pin<Box<dyn Future<...>>>`
  - No `async-trait` dependency added

### 3) Registration API + storage
- `register_init(phase, hook)`
- `register_ready(hook)`
- `register_async(hook)`
- Internal storage:
  - `init_hooks: HashMap<Phase, Vec<Box<dyn OnPreflightInit>>>`
  - `ready_hooks: Vec<Box<dyn OnPreflightReady>>`
  - `async_hooks: Vec<Box<dyn OnPreflightAsync>>`

### 4) Sync run flow update
- `run_sync` now:
  - Creates `PreflightContext`
  - Runs built-in phase logic first
  - Executes init hooks after each built-in phase
  - Sets context settings after Phase 3
  - Sets context registry after Phase 4
  - Executes ready hooks after all sync phases
- `PreflightResult` now returns:
  - `settings`, `registry`, `durations` (unchanged consumption)
  - `context` (added)

### 5) Async hooks
- Added `run_async(&self, ctx: &PreflightContext)` in preflight crate
- Executes all registered async hooks in registration order

### 6) main.rs integration proof
- Added `BootLogger` implementing `OnPreflightReady`
- Registered via:
  - `preflight.register_ready(Box::new(BootLogger));`
- Adjusted preflight boot call to mutable service
- Captured cloned `preflight_context` and invoked `preflight.run_async(&context)` from `.setup()` spawn path

## Tests Added (A012/hooks)
Implemented tests in `snapfzz-preflight/src/lib.rs`:
- register_init adds hook to correct phase
- run_sync executes init hooks after built-in phase
- init hooks run in registration order
- ready hooks run after all sync phases
- context settings accessor panics before phase 3
- context registry accessor panics before phase 4
- context settings accessible after phase 3
- context registry accessible after phase 4
- failing init hook returns error with phase info
- multiple hooks on same phase all execute

All existing preflight tests remain passing.

## Constraint Compliance
- No `async-trait` added ✅
- Phase 2 remains vault stub ✅
- No frontend modifications ✅
- Existing Tauri commands unchanged ✅
- No TODO/FIXME/HACK added ✅
- Main consumption of `PreflightResult` preserved (`settings`, `registry`, `durations`) ✅

## Verification
Executed and passed:
- `cargo test -p snapfzz-preflight --lib`
- (Full repo checks run in verification task)
