# T26 — Secret Vault (A011) Build Report

## 5 Questions (AGENTS.md)

1. **Which spec?**
   - `docs/plans/A011-secret-vault.md`
   - Integration touchpoint with preflight lifecycle in `A012` via existing hooks (`Phase::Vault`, `OnPreflightInit`).

2. **Which zone?**
   - Zone 1 (Rust backend): encryption, key management, vault persistence, preflight initialization, Tauri commands.

3. **Core or plugin?**
   - Core infrastructure (Rust crates + Tauri backend), not plugin feature logic.

4. **Existing pattern?**
   - Followed existing preflight hook pattern in `snapfzz-kernel::boot` (`register_init`, context extensions).
   - Followed existing `main.rs` command style (thin command handlers, managed `Arc<...>` state).

5. **Test name?**
   - Spec-required tests implemented with `A011/vault` naming intent in function names.

## Implementation Summary

### Step 1 — Created `snapfzz-vault` crate
- Added `src-tauri/crates/snapfzz-vault/Cargo.toml` with required dependencies:
  - `ring = "0.17"`
  - `keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }`
  - `serde` derive
  - `tempfile` (dev)

- Implemented `src-tauri/crates/snapfzz-vault/src/lib.rs`:
  - `SecretVault`
  - `VaultError`
  - API methods:
    - `open`
    - `store`
    - `read`
    - `delete`
    - `list`
    - `has`
    - `empty` (for preflight fallback path requested in task)
  - Master key API:
    - `load_or_generate_master_key(data_dir: &Path)`

### A011 behaviors implemented
- AES-256-GCM encryption/decryption via `ring::aead`.
- `LessSafeKey` retained inside `SecretVault`.
- Unique 12-byte nonce generated per write via `SystemRandom`.
- Binary vault file format:
  - 16-byte header: `SFZV`, `version`, `count`, `reserved`
  - entry encoding: key length+bytes, nonce, ciphertext length+bytes
- Atomic writes:
  - full file rebuild on every store/delete
  - temp file write then rename to `vault.enc`
- Open behavior:
  - parse existing file into in-memory map if exists
  - empty map if file missing

### Master key lifecycle implementation
- `load_or_generate_master_key`:
  1. Try keychain entry (`service=snapfzz`, `user=vault-master`)
  2. If key exists, decode and return
  3. If no entry, generate key and try storing in keychain
  4. On keychain unavailable/failure, fallback to keyfile
  5. keyfile path: `{data_dir}/vault.key`
  6. read existing or generate+write new with unix `0o600`

### Step 2 — Workspace wiring
- Updated `src-tauri/Cargo.toml`:
  - Added workspace member: `crates/snapfzz-vault`
  - Added binary dependency: `snapfzz-vault = { path = "crates/snapfzz-vault" }`

### Step 3/4 — Preflight + Tauri integration in `src-tauri/src/main.rs`
- Added imports:
  - `snapfzz_vault::{load_or_generate_master_key, SecretVault}`
  - preflight hook traits/types for init phase registration
- Added `VaultInitializer` implementing `OnPreflightInit`:
  - loads/generates master key
  - opens `vault.enc`
  - stores `Arc<Mutex<SecretVault>>` into preflight context extension slot `"vault"`
- Registered preflight init hook:
  - `preflight.register_init(Phase::Vault, Box::new(VaultInitializer));`
- Extracted vault after `run_sync` and provided fallback to `SecretVault::empty`.
- Added `.manage(vault)` to Tauri builder state.
- Added commands and registered in invoke handler:
  - `vault_store`
  - `vault_read`
  - `vault_delete`
  - `vault_list`
  - `vault_has`

## Tests

Implemented all requested A011 vault tests plus additional parser/key helper coverage tests in:
- `src-tauri/crates/snapfzz-vault/src/lib.rs`

Requested tests included:
- roundtrip
- read missing
- delete behavior
- list keys
- has()
- overwrite existing
- survive reopen
- unreadable with wrong key
- atomic write failure safety
- empty vault valid

Additional tests added to satisfy coverage target:
- invalid header/magic/version/reserved
- truncated/trailing bytes
- invalid UTF-8 key path
- ciphertext shorter than GCM tag
- keyfile generation/reuse/invalid-size
- helper parsing/encoding paths
- VaultError display formatting

## Verification Evidence

Executed from `src-tauri/`:

1. `cargo check` ✅
2. `cargo test -p snapfzz-vault --lib` ✅
3. `cargo test -p snapfzz-kernel --lib` ✅ (118 passed)
4. `cargo test --bin Snapfzz` ✅
5. `cargo llvm-cov test -p snapfzz-vault --lib --summary-only` ✅
   - Regions: **93.36%**
   - Lines: **92.82%**

## Notes
- No frontend changes.
- No changes to `snapfzz-kernel` crate internals.
- No migration hook implemented (deferred as requested).
- No `TODO/FIXME/HACK` added.
