# A011 — Secret Vault

AES-256-GCM encrypted storage for API keys and credentials. Backend is the sole custodian — frontend never sees raw secrets, only masked references.

---

## Why

API keys in plaintext `settings.json` = one `cat` away from compromise. Every LLM provider key, every webhook secret, every token must be encrypted at rest. The vault key itself is derived once on first boot and stored in the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service). If the OS keychain is unavailable, fall back to a local keyfile with restrictive permissions.

This is P1 (right from the beginning) — retrofitting encryption later means migrating existing plaintext keys, which is both risky and error-prone.

---

## Architecture

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

Vault remains Zone 1-only, with frontend invoking commands and never holding master key material.

### Master Key Lifecycle

1. **First boot** (A012 Preflight): generate 256-bit random key via `ring::rand::SystemRandom`
2. **Store**: attempt OS keychain first (`keyring` crate, service=`snapfzz`, user=`vault-master`). If keychain unavailable, write to `~/.snapfzz/vault.key` with `0o600` permissions.
3. **Subsequent boots**: read from keychain or keyfile. If both missing, generate new key (existing vault becomes unreadable — user must re-enter secrets).
4. **Never transmitted**: master key never leaves the Rust process. Never logged. Never serialized to settings.json.

### Vault File Format

`~/.snapfzz/vault.enc` — binary file, not JSON.

```
Header (16 bytes):
  magic:    "SFZV" (4 bytes)
  version:  u32 LE (currently 1)
  count:    u32 LE (number of entries)
  reserved: u32 LE (0)

Per entry:
  key_len:    u16 LE
  key_bytes:  [u8; key_len]     (UTF-8 entry name, e.g. "litellm:master_key")
  nonce:      [u8; 12]          (unique per entry, regenerated on every write)
  ciphertext_len: u32 LE
  ciphertext: [u8; ciphertext_len]  (AES-256-GCM encrypted value + 16-byte auth tag)
```

On every write: rebuild entire file (entries are small, count is low — <100 entries expected). Atomic write via temp file + rename.

### Entry Naming Convention

> **Scope note**: The vault now stores gateway-level secrets only — the LiteLLM master key and custom provider config blob. Individual per-provider API keys are NOT stored here; they are written directly into LiteLLM's `config.yaml` and managed by the `settings-llm` plugin.

```
litellm:master_key            — LiteLLM gateway master key (used to authenticate /key/* calls)
litellm:custom_providers      — JSON blob of custom provider configs (base URL, headers, etc.)
custom:{name}                 — user-defined secrets (future extensibility)
```

Note: process auth tokens (e.g., AgentScope IPC tokens) are NOT stored in the vault. They are ephemeral — held in Rust process memory, regenerated every boot, passed as env vars. See A012 for details.

---

## Rust Crate

`src-tauri/crates/snapfzz-vault/`

```rust
pub struct SecretVault {
    master_key: aead::LessSafeKey,  // ring AES-256-GCM key, never cloned out
    vault_path: PathBuf,            // ~/.snapfzz/vault.enc
    entries: HashMap<String, EncryptedEntry>,
}

struct EncryptedEntry {
    nonce: [u8; 12],
    ciphertext: Vec<u8>,  // includes 16-byte GCM auth tag
}

impl SecretVault {
    /// Initialize vault with master key. Called by Preflight (A012).
    pub fn open(master_key_bytes: &[u8; 32], vault_path: PathBuf) -> Result<Self, VaultError>;

    /// Store a secret. Encrypts value, writes to disk atomically.
    pub fn store(&mut self, key: &str, plaintext: &[u8]) -> Result<(), VaultError>;

    /// Read a secret. Decrypts and returns plaintext.
    pub fn read(&self, key: &str) -> Result<Vec<u8>, VaultError>;

    /// Delete a secret. Removes entry, rewrites file.
    pub fn delete(&mut self, key: &str) -> Result<(), VaultError>;

    /// List all entry names (no values).
    pub fn list(&self) -> Vec<String>;

    /// Check if an entry exists.
    pub fn has(&self, key: &str) -> bool;
}
```

### Dependencies

- `ring` — AES-256-GCM encryption, secure random generation
- `keyring` — OS keychain access (macOS Keychain, Windows Credential Manager, Linux Secret Service)

---

## Tauri Commands

```rust
#[tauri::command]
async fn vault_store(vault: State<'_, Mutex<SecretVault>>, key: String, value: String) -> Result<(), String>;

#[tauri::command]
async fn vault_read(vault: State<'_, Mutex<SecretVault>>, key: String) -> Result<String, String>;

#[tauri::command]
async fn vault_delete(vault: State<'_, Mutex<SecretVault>>, key: String) -> Result<(), String>;

#[tauri::command]
async fn vault_list(vault: State<'_, Mutex<SecretVault>>) -> Result<Vec<String>, String>;

#[tauri::command]
async fn vault_has(vault: State<'_, Mutex<SecretVault>>, key: String) -> Result<bool, String>;
```

### Frontend Usage Pattern

```typescript
// Store LiteLLM master key
await tauriInvoke('vault_store', { key: 'litellm:master_key', value: masterKey });

// Read for display (masked — frontend shows only last 4 chars)
const raw = await tauriInvoke('vault_read', { key: 'litellm:master_key' }) as string;
const masked = '•'.repeat(raw.length - 4) + raw.slice(-4);

// Check existence without reading value
const hasKey = await tauriInvoke('vault_has', { key: 'litellm:master_key' }) as boolean;

// List all stored secret names
const names = await tauriInvoke('vault_list') as string[];
```

---

## Migration (completed — historical reference)

This migration ran on first boot when the vault was introduced. It is now complete and the migration code has been removed.

1. Preflight (A012) initialized vault
2. Read existing `settings.json` for `apiKey` field
3. If non-empty: `vault.store("provider:openai:apiKey", apiKey)`, then set `settings.json.apiKey = ""`
4. Log migration: `[preflight] Migrated 1 API key to vault`

---

## Security Properties

- **Encryption**: AES-256-GCM (authenticated encryption — tampering detected)
- **Key derivation**: 256-bit random (not password-derived — no PBKDF2 needed since user doesn't enter a password)
- **Nonce**: unique 96-bit nonce per entry per write (regenerated on every store/update)
- **At rest**: vault.enc is binary ciphertext, unusable without master key
- **In memory**: master key lives in `LessSafeKey` (ring's type that prevents accidental serialization). Decrypted values are `Vec<u8>` — held only for the duration of the Tauri command, then dropped.
- **No logging**: secret values never appear in logs. Entry names are loggable.

---

## Test Specifications

```
A011/vault: store and read roundtrip returns original plaintext
A011/vault: read nonexistent key returns error
A011/vault: delete removes entry and read returns error after delete
A011/vault: list returns all stored key names without values
A011/vault: has returns true for stored key, false for missing
A011/vault: store overwrites existing entry with new value
A011/vault: vault file survives close and reopen with same master key
A011/vault: vault file is unreadable with wrong master key
A011/vault: atomic write — interrupted write does not corrupt existing vault
A011/vault: empty vault file is valid (zero entries)
A011/migration: existing apiKey in settings.json migrated to vault on first boot
A011/migration: settings.json apiKey cleared after migration
```

---

## Hard Rules

- Master key NEVER leaves Rust process
- Secret values NEVER appear in logs
- Secret values NEVER stored in settings.json (only vault.enc)
- Frontend receives decrypted values only via `vault_read` — never caches them in React state beyond the current render
- Vault file always written atomically (temp + rename)
- Nonce NEVER reused (regenerated on every write)
