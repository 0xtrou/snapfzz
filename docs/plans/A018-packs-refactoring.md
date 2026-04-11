# A018: Packs Crate Refactoring — Download → Kernel, Packs → Runtime Readiness

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

## Status: Draft

## Problem

`snapfzz-packs` currently mixes two concerns:
1. **Download/install logic** — downloading uv, Python, CEF binaries from the internet
2. **Runtime readiness** — checking if runtimes are installed, managing pip packages, reporting status

This violates single responsibility and creates duplicate download code (CEF exists in both `snapfzz-packs` and `snapfzz-cef`).

## Proposed Architecture

```
snapfzz-kernel (foundation)
├── boot/           — preflight service
├── budget/         — resource management
├── components/     — SystemComponent trait + Registry
│   ├── component.rs     — trait definition
│   ├── registry.rs      — component registry
│   ├── download.rs      — low-level download utilities ✅ (exists)
│   ├── downloaders/     — NEW: concrete download implementations
│   │   ├── uv.rs        — UvDownloader
│   │   ├── python.rs    — PythonDownloader  
│   │   ├── cef.rs       — CefDownloader (consolidated from snapfzz-cef)
│   │   └── mod.rs
│   └── mod.rs
├── process/        — process management
├── settings/       — settings schema
└── constants.rs    — NEW: centralized constants

snapfzz-packs (runtime readiness)
├── runtime/
│   ├── python.rs        — PythonRuntime (readiness checks, venv, pip)
│   ├── agentscope.rs    — AgentScopeRuntime (readiness, status)
│   ├── litellm.rs       — LiteLLMRuntime (readiness, status)
│   └── mod.rs
├── status.rs            — PythonRuntimeStatus, PipPackageInfo, InstallStep
├── factory.rs           — make_agentscope, make_litellm, make_python_runtime
├── platform.rs          — PlatformInfo (keep)
├── constants.rs         — version constants
└── lib.rs
```

## Responsibilities After Refactoring

### snapfzz-kernel/components/downloaders/
- **Owns**: Downloading binaries (uv, Python, CEF) from the internet
- **Owns**: URL resolution, asset selection, archive extraction
- **Owns**: Concrete `SystemComponent` implementations for downloadable binaries
- **Exports**: `UvDownloader`, `PythonDownloader`, `CefDownloader`

### snapfzz-packs/runtime/
- **Owns**: Runtime readiness checks (`is_runtime_ready()`)
- **Owns**: Pip package management (install, uninstall, list)
- **Owns**: Virtual environment management
- **Owns**: Status reporting (`PythonRuntimeStatus`)
- **Does NOT own**: Downloading binaries (delegates to kernel downloaders)
- **Exports**: `PythonRuntime`, `AgentScopeRuntime`, `LiteLLMRuntime`

### snapfzz-kernel/constants.rs
- **Owns**: All hardcoded values (URLs, paths, version defaults)
- **Exports**: Constants for use across crates

## Migration Plan

### Phase 1: Create kernel/components/downloaders/
1. Create `src-tauri/crates/snapfzz-kernel/src/components/downloaders/` directory
2. Move `UvComponent` from `snapfzz-packs/src/uv.rs` → `kernel/components/downloaders/uv.rs`
3. Move `PythonComponent` from `snapfzz-packs/src/python.rs` → `kernel/components/downloaders/python.rs`
4. Move `CefPackComponent` from `snapfzz-packs/src/cef.rs` → `kernel/components/downloaders/cef.rs`
5. Rename `*Component` → `*Downloader` to clarify intent
6. Add `mod.rs` with re-exports

### Phase 2: Create kernel/constants.rs
1. Create `src-tauri/crates/snapfzz-kernel/src/constants.rs`
2. Move URL constants from `uv.rs`, `python.rs`, `cef.rs`
3. Move path constants
4. Add user-agent, API endpoints

### Phase 3: Refactor snapfzz-packs
1. Create `src-tauri/crates/snapfzz-packs/src/runtime/` directory
2. Move `PythonRuntime` from `pip_pack.rs` → `runtime/python.rs`
3. Extract status types from `pip_pack.rs` → `status.rs`
4. Create factory functions in `factory.rs`
5. Remove download logic, import from kernel instead
6. Update `pip_pack.rs` to use kernel downloaders

### Phase 4: Update ARCHITECTURE.md
1. Update crate responsibility table
2. Update dependency graph
3. Add new modules to documentation

### Phase 5: Tests & Verification
1. Update imports in all affected files
2. Run `cargo test -p snapfzz-kernel -p snapfzz-packs`
3. Run `cargo check -p snapfzz`
4. Verify tauri dev still works

## Files Changed

### New Files
- `src-tauri/crates/snapfzz-kernel/src/components/downloaders/mod.rs`
- `src-tauri/crates/snapfzz-kernel/src/components/downloaders/uv.rs`
- `src-tauri/crates/snapfzz-kernel/src/components/downloaders/python.rs`
- `src-tauri/crates/snapfzz-kernel/src/components/downloaders/cef.rs`
- `src-tauri/crates/snapfzz-kernel/src/constants.rs`
- `src-tauri/crates/snapfzz-packs/src/runtime/mod.rs`
- `src-tauri/crates/snapfzz-packs/src/runtime/python.rs`
- `src-tauri/crates/snapfzz-packs/src/status.rs`
- `src-tauri/crates/snapfzz-packs/src/factory.rs`

### Modified Files
- `src-tauri/crates/snapfzz-kernel/src/lib.rs` — add constants, downloaders module
- `src-tauri/crates/snapfzz-kernel/src/components/mod.rs` — add downloaders
- `src-tauri/crates/snapfzz-kernel/Cargo.toml` — add zip dependency
- `src-tauri/crates/snapfzz-packs/src/lib.rs` — update exports
- `src-tauri/crates/snapfzz-packs/src/pip_pack.rs` — remove PythonRuntime, use kernel downloaders
- `src-tauri/crates/snapfzz-packs/Cargo.toml` — update dependencies
- `src-tauri/src/main.rs` — update imports
- `ARCHITECTURE.md` — document new architecture

### Deleted Files
- `src-tauri/crates/snapfzz-packs/src/uv.rs` (moved to kernel)
- `src-tauri/crates/snapfzz-packs/src/python.rs` (moved to kernel)
- `src-tauri/crates/snapfzz-packs/src/cef.rs` (moved to kernel)
- `src-tauri/crates/snapfzz-packs/src/agentscope.rs` (becomes factory function)
- `src-tauri/crates/snapfzz-packs/src/litellm.rs` (becomes factory function)

## Progress Model Simplification

Replace complex byte-level progress with simple step-based progress:

### Before (complex)
```rust
DownloadProgress {
    bytes_downloaded: 1523456,
    bytes_total: 4000000,
    percent: 38.1,
    status: DownloadStatus::Downloading,
}
```

### After (simple)
```rust
PackProgress {
    component_id: "python-runtime",
    current_step: 2,      // "Python 3.12"
    total_steps: 4,       // uv → python → venv → packages
    current_label: "Installing Python 3.12",
    status: PackStatus::Installing,
}
```

### Steps for Python Runtime
1. `uv` — Download uv binary
2. `python` — Install Python via uv
3. `venv` — Create virtual environment
4. `packages` — Install pip packages (agentscope, litellm)

### Steps for CEF
1. `download` — Download CEF archive
2. `extract` — Extract archive
3. `verify` — Verify binary

### Benefits
- No byte counting, no network progress tracking
- UI shows "Step 2 of 4: Installing Python 3.12"
- Easier to test, easier to reason about
- Maps directly to install steps UI

### Types to Change
- `DownloadProgress` → `PackProgress`
- `DownloadStatus` → `PackStatus` (Installing, Ready, Failed, Cancelled)
- Remove `bytes_downloaded`, `bytes_total`, `percent`
- Add `current_step`, `total_steps`, `current_label`

## Success Criteria

1. `cargo test -p snapfzz-kernel -p snapfzz-packs` passes
2. `cargo check -p snapfzz` passes
3. `cargo tauri dev` starts successfully
4. All download logic is in `snapfzz-kernel/components/downloaders/`
5. All runtime readiness logic is in `snapfzz-packs/runtime/`
6. No duplicate CEF download code
7. ARCHITECTURE.md reflects new structure
8. Progress is step-based, not byte-based

## Spec References

- A014: Kernel Architecture — crate separation, main.rs orchestrator
- A004: Workspace Architecture — ~/.snapfzz/ runtime directory
- A017: MicroVM Sandbox — future runtime readiness pattern

## Tasks

1. Create kernel/components/downloaders/ structure
2. Move UvComponent → UvDownloader
3. Move PythonComponent → PythonDownloader
4. Move CefPackComponent → CefDownloader
5. Create kernel/constants.rs
6. Create packs/runtime/ structure
7. Move PythonRuntime → packs/runtime/python.rs
8. Extract status types → packs/status.rs
9. Create factory functions
10. Update pip_pack.rs to use kernel downloaders
11. Update main.rs imports
12. Update ARCHITECTURE.md
13. Run tests and verify