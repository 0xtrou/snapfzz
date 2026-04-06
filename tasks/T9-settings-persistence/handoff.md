# Handoff: T9 — Settings Persistence + Path Config

## What Changed

Rust:
- src-tauri/src/main.rs: snapfzz_home(), resolve_data_dir_from(), resolve_data_dir(), get_data_dir + set_data_dir commands, 6 tests
- src-tauri/crates/snapfzz-budget/src/lib.rs: .snapfzz-global → .snapfzz
- src-tauri/Cargo.toml: tempfile dev-dep

Docs:
- All .snapfzz-global → .snapfzz across plans, learnings, milestones, specs

## Key Decisions
- ~/.snapfzz/pointer.json is the fixed bootstrap anchor (never moves)
- resolve_data_dir reads pointer, falls back to ~/.snapfzz if absent/corrupt/nonexistent
- set_data_dir writes pointer only — no file migration, app must restart
- ~/.snapfzz on all platforms for Alpha (platform paths deferred to V1)

## How to Verify
- cargo test --bin Snapfzz → 6 tests pass
- cargo test -p snapfzz-budget → 38 tests pass
- grep -r "snapfzz-global" → 0 results in source/docs

## Ready for Review: YES
