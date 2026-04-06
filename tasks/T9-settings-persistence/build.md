# Build: T9 — Settings Persistence + Path Config

## 5 Questions
1. Which spec? → A004 (workspace), A008 (storage budget)
2. Which zone? → Zone 1 (Rust)
3. Core or plugin? → Core infrastructure
4. Existing pattern? → settings_path() and pid_file_path() in main.rs
5. Test name? → A004/{section}: {behavior}

## What Was Built
- snapfzz_home() → ~/.snapfzz (bootstrap anchor)
- resolve_data_dir_from(home) → reads pointer.json, fallback to home
- resolve_data_dir() → production wrapper
- get_data_dir / set_data_dir Tauri commands
- All .snapfzz-global → .snapfzz across entire codebase
- 5 A004/persistence tests with tempfile

## Verification
- cargo check: 0 warnings
- cargo test -p snapfzz-budget: 38 pass
- cargo test --bin Snapfzz: 5 pass
- grep snapfzz-global: 0 results
