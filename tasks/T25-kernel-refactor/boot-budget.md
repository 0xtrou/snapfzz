# Boot + Budget migration into snapfzz-kernel

## Scope
- Migrated budget code from `src-tauri/crates/snapfzz-budget/src/` into `src-tauri/crates/snapfzz-kernel/src/budget/`
- Migrated boot/preflight code from `src-tauri/crates/snapfzz-preflight/src/lib.rs` into `src-tauri/crates/snapfzz-kernel/src/boot/`
- Preserved existing inline spec comments from source where present
- Kept source crates untouched

## Files filled
### budget/
- `src-tauri/crates/snapfzz-kernel/src/budget/mod.rs`
- `src-tauri/crates/snapfzz-kernel/src/budget/controlled.rs`
- `src-tauri/crates/snapfzz-kernel/src/budget/supervised.rs`
- `src-tauri/crates/snapfzz-kernel/src/budget/preset.rs`
- `src-tauri/crates/snapfzz-kernel/src/budget/metrics.rs`
- `src-tauri/crates/snapfzz-kernel/src/budget/detect.rs`

### boot/
- `src-tauri/crates/snapfzz-kernel/src/boot/mod.rs`
- `src-tauri/crates/snapfzz-kernel/src/boot/context.rs`
- `src-tauri/crates/snapfzz-kernel/src/boot/hooks.rs`

## Migration notes
- Fixed module paths to the kernel hierarchy (`crate::budget::...`)
- Extracted `HardwareInfo`, `detect_hardware()`, and `select_preset()` into `budget/detect.rs`
- Kept `build_preset()` in `budget/preset.rs`
- Moved source test modules inline into their destination files for budget files that were migrated in this pass
- Split preflight code across `boot/mod.rs`, `boot/context.rs`, and `boot/hooks.rs`
- Updated boot imports to use `crate::budget::BudgetRegistry`

## Verification
### cargo check
Command:
```bash
cd src-tauri && cargo check -p snapfzz-kernel
```
Result: passed

### cargo test
Command:
```bash
cd src-tauri && cargo test -p snapfzz-kernel --lib
```
Result: passed

Observed test result:
- `27 passed; 0 failed`

## Diagnostics
- `boot/mod.rs`, `boot/context.rs`, `boot/hooks.rs`: no LSP diagnostics
- Budget files show rust-analyzer `unlinked-file` hints in this workspace state, but compile cleanly under `cargo check -p snapfzz-kernel`

## Current status
- Requested kernel boot + budget destination files are now filled and compile/test successfully in the current workspace state.
