# T32 System Packs Python — Build Audit

## Scope
Implemented `snapfzz-packs` crate with 5 system components (`uv`, `python`, `agentscope`, `litellm`, `cef`), wired it into `src-tauri` workspace and runtime registry, and expanded tests to satisfy coverage target.

## Files Implemented / Updated

### New crate + modules
- `src-tauri/crates/snapfzz-packs/Cargo.toml`
- `src-tauri/crates/snapfzz-packs/src/lib.rs`
- `src-tauri/crates/snapfzz-packs/src/platform.rs`
- `src-tauri/crates/snapfzz-packs/src/uv.rs`
- `src-tauri/crates/snapfzz-packs/src/python.rs`
- `src-tauri/crates/snapfzz-packs/src/agentscope.rs`
- `src-tauri/crates/snapfzz-packs/src/litellm.rs`
- `src-tauri/crates/snapfzz-packs/src/cef.rs`

### Workspace and app wiring
- `src-tauri/Cargo.toml`
  - added workspace member: `crates/snapfzz-packs`
  - added package dependency: `snapfzz-packs = { path = "crates/snapfzz-packs" }`
- `src-tauri/src/main.rs`
  - component registry now registers:
    - `UvComponent`
    - `PythonComponent`
    - `AgentScopeComponent`
    - `LiteLLMComponent`
    - `CefPackComponent`

## Design / Behavior Summary

- Shared platform detection implemented in `platform.rs` with `PlatformInfo` fields:
  - `os`, `arch`, `platform`, `display`, `exe_suffix`, `archive_ext`
- All components consume shared `PlatformInfo` for platform-specific behavior and metadata.
- Runtime paths remain under required directories in `main.rs`:
  - `runtime/bin/`
  - `runtime/processes/`
  - `runtime/packages/`
- Component implementations include required trait methods:
  - `resolve`, `is_installed`, `download`, `cancel`, `clear_cancel`, `verify`, `extract`

## Coverage Work (Final Pass)

Additional tests were added to raise `snapfzz-packs` above 90% region coverage, primarily in:
- `uv.rs`
  - missing asset error path
  - tar.gz extraction path
  - zip extraction path
  - verify non-zero exit path
  - recursive file search missing root path
- `cef.rs`
  - `platform()` accessor
  - `find_archive()` success/failure
  - `verify()` hash path
  - `extract()` missing archive path
  - resolve fallback when no stable channel
  - resolve missing platform in index
- `platform.rs`
  - stronger assertions for supported platform fields and suffix/ext expectations

## Verification Output

### Required commands from assignment
Executed and passing:
1. `cd src-tauri && cargo check`
2. `cd src-tauri && cargo test -p snapfzz-packs`
3. `cd src-tauri && cargo test --bin Snapfzz -- --test-threads=1`

### Coverage verification
Executed:
- `cd src-tauri && cargo llvm-cov -p snapfzz-packs --summary-only`

Result:
- **TOTAL regions: 91.90%** (meets `>=90%`)

Module snapshot:
- `uv.rs`: 93.43%
- `cef.rs`: 92.97%
- `python.rs`: 95.43%
- `agentscope.rs`: 91.08%
- `litellm.rs`: 91.08%
- `platform.rs`: 61.97% (crate total still >=90%)

## Notes

- Existing unrelated warnings remain outside this task scope.
- No TODO/FIXME/HACK markers added.
- CEF command runtime still uses existing `snapfzz-cef` downloader state typing in `commands::cef`; pack component registration for CEF is now present in system component registry.
