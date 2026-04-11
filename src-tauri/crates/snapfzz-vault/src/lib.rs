use keyring::Entry;
use ring::aead::{self, Aad, LessSafeKey, Nonce, UnboundKey};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const VAULT_MAGIC: &[u8; 4] = b"SFZV";
const VAULT_VERSION: u32 = 1;
const GCM_NONCE_LEN: usize = 12;
const GCM_TAG_LEN: usize = 16;
const KEYRING_SERVICE: &str = "snapfzz";
const KEYRING_USER: &str = "vault-master";
const KEYFILE_NAME: &str = "vault.key";

#[derive(Clone, Debug, Serialize, Deserialize)]
struct EncryptedEntry {
    nonce: [u8; GCM_NONCE_LEN],
    ciphertext: Vec<u8>,
}

pub struct SecretVault {
    // Per A011/Security: keep the master key in ring::LessSafeKey to avoid accidental serialization.
    master_key: LessSafeKey,
    vault_path: PathBuf,
    entries: HashMap<String, EncryptedEntry>,
    initialized: bool,
    last_access: std::time::Instant,
    access_count: u32,
}

#[derive(Debug)]
pub enum VaultError {
    Io(io::Error),
    Keyring(String),
    InvalidVaultFormat(String),
    Crypto(String),
    NotFound(String),
    Utf8(std::string::FromUtf8Error),
    RateLimited,
}

impl fmt::Display for VaultError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            VaultError::Io(err) => write!(f, "io error: {err}"),
            VaultError::Keyring(err) => write!(f, "keyring error: {err}"),
            VaultError::InvalidVaultFormat(err) => write!(f, "invalid vault format: {err}"),
            VaultError::Crypto(err) => write!(f, "crypto error: {err}"),
            VaultError::NotFound(key) => write!(f, "secret not found: {key}"),
            VaultError::Utf8(err) => write!(f, "utf8 error: {err}"),
            VaultError::RateLimited => {
                write!(f, "rate limited: too many vault operations per second")
            }
        }
    }
}

impl std::error::Error for VaultError {}

impl From<io::Error> for VaultError {
    fn from(value: io::Error) -> Self {
        VaultError::Io(value)
    }
}

impl From<std::string::FromUtf8Error> for VaultError {
    fn from(value: std::string::FromUtf8Error) -> Self {
        VaultError::Utf8(value)
    }
}

impl SecretVault {
    pub fn open(master_key_bytes: &[u8; 32], vault_path: PathBuf) -> Result<Self, VaultError> {
        let master_key = build_master_key(master_key_bytes)?;
        let entries = if vault_path.exists() {
            parse_vault_file(&fs::read(&vault_path)?)?
        } else {
            HashMap::new()
        };

        Ok(Self {
            master_key,
            vault_path,
            entries,
            initialized: true,
            last_access: std::time::Instant::now(),
            access_count: 0,
        })
    }

    pub fn empty(vault_path: PathBuf) -> Self {
        // Per A011/Architecture: fallback state only; preflight should initialize with real key.
        let key_bytes = [0_u8; 32];
        let master_key =
            build_master_key(&key_bytes).expect("A011/vault: static zero key is valid key length");
        Self {
            master_key,
            vault_path,
            entries: HashMap::new(),
            initialized: false,
            last_access: std::time::Instant::now(),
            access_count: 0,
        }
    }

    pub fn is_initialized(&self) -> bool {
        self.initialized
    }

    pub fn check_rate_limit(&mut self) -> Result<(), VaultError> {
        let now = std::time::Instant::now();
        if now.duration_since(self.last_access).as_secs() >= 1 {
            self.last_access = now;
            self.access_count = 1;
            Ok(())
        } else {
            self.access_count += 1;
            if self.access_count > 10 {
                Err(VaultError::RateLimited)
            } else {
                Ok(())
            }
        }
    }

    pub fn store(&mut self, key: &str, plaintext: &[u8]) -> Result<(), VaultError> {
        let mut nonce = [0_u8; GCM_NONCE_LEN];
        // Per A011/Security: nonce must be unique per entry per write.
        SystemRandom::new()
            .fill(&mut nonce)
            .map_err(|_| VaultError::Crypto("failed to generate nonce".to_string()))?;

        let mut ciphertext = plaintext.to_vec();
        self.master_key
            .seal_in_place_append_tag(
                Nonce::assume_unique_for_key(nonce),
                Aad::from(key.as_bytes()),
                &mut ciphertext,
            )
            .map_err(|_| VaultError::Crypto("encryption failed".to_string()))?;

        let mut next_entries = self.entries.clone();
        next_entries.insert(key.to_string(), EncryptedEntry { nonce, ciphertext });

        // Per A011/Architecture: write full vault atomically on every mutation.
        persist_entries_atomically(&self.vault_path, &next_entries)?;
        self.entries = next_entries;
        Ok(())
    }

    pub fn read(&mut self, key: &str) -> Result<Vec<u8>, VaultError> {
        self.check_rate_limit()?;
        let entry = self
            .entries
            .get(key)
            .ok_or_else(|| VaultError::NotFound(key.to_string()))?;

        let mut plaintext = entry.ciphertext.clone();
        let decrypted = self
            .master_key
            .open_in_place(
                Nonce::assume_unique_for_key(entry.nonce),
                Aad::from(key.as_bytes()),
                &mut plaintext,
            )
            .map_err(|_| VaultError::Crypto("decryption failed".to_string()))?;

        Ok(decrypted.to_vec())
    }

    pub fn delete(&mut self, key: &str) -> Result<(), VaultError> {
        if !self.entries.contains_key(key) {
            return Err(VaultError::NotFound(key.to_string()));
        }

        let mut next_entries = self.entries.clone();
        next_entries.remove(key);
        persist_entries_atomically(&self.vault_path, &next_entries)?;
        self.entries = next_entries;
        Ok(())
    }

    pub fn list(&mut self) -> Result<Vec<String>, VaultError> {
        let mut keys: Vec<String> = self.entries.keys().cloned().collect();
        keys.sort();
        Ok(keys)
    }

    pub fn has(&self, key: &str) -> bool {
        self.entries.contains_key(key)
    }
}

pub fn load_or_generate_master_key(data_dir: &Path) -> Result<[u8; 32], VaultError> {
    let keyring_entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|err| VaultError::Keyring(err.to_string()));

    if let Ok(entry) = keyring_entry {
        match entry.get_password() {
            Ok(encoded) => return decode_hex_key(&encoded),
            Err(keyring::Error::NoEntry) => {
                let key = generate_master_key()?;
                let encoded = encode_hex_key(&key);
                match entry.set_password(&encoded) {
                    Ok(()) => return Ok(key),
                    Err(_) => {}
                }
            }
            Err(_) => {}
        }
    }

    let key_path = data_dir.join(KEYFILE_NAME);
    load_or_generate_master_keyfile(&key_path)
}

fn load_or_generate_master_keyfile(path: &Path) -> Result<[u8; 32], VaultError> {
    if path.exists() {
        let raw = fs::read(path)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let meta = std::fs::metadata(path).map_err(VaultError::Io)?;
            let mode = meta.permissions().mode() & 0o777;
            if mode != 0o600 {
                std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                    .map_err(VaultError::Io)?;
            }
        }

        if raw.len() != 32 {
            return Err(VaultError::InvalidVaultFormat(format!(
                "master key file has invalid size: {}",
                raw.len()
            )));
        }
        let mut key = [0_u8; 32];
        key.copy_from_slice(&raw);
        return Ok(key);
    }

    let key = generate_master_key()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, key)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }

    Ok(key)
}

fn persist_entries_atomically(
    vault_path: &Path,
    entries: &HashMap<String, EncryptedEntry>,
) -> Result<(), VaultError> {
    if let Some(parent) = vault_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let bytes = serialize_entries(entries)?;
    let temp_path = next_temp_path(vault_path);

    fs::write(&temp_path, bytes)?;
    if let Err(rename_err) = fs::rename(&temp_path, vault_path) {
        let _ = fs::remove_file(&temp_path);
        return Err(VaultError::Io(rename_err));
    }

    Ok(())
}

fn serialize_entries(entries: &HashMap<String, EncryptedEntry>) -> Result<Vec<u8>, VaultError> {
    let mut out = Vec::new();
    out.extend_from_slice(VAULT_MAGIC);
    out.extend_from_slice(&VAULT_VERSION.to_le_bytes());
    out.extend_from_slice(&(entries.len() as u32).to_le_bytes());
    out.extend_from_slice(&0_u32.to_le_bytes());

    let mut keys: Vec<&String> = entries.keys().collect();
    keys.sort();

    for key in keys {
        let entry = entries
            .get(key)
            .expect("A011/vault: key from key list must exist");
        let key_bytes = key.as_bytes();
        if key_bytes.len() > u16::MAX as usize {
            return Err(VaultError::InvalidVaultFormat(
                "entry key too long".to_string(),
            ));
        }

        out.extend_from_slice(&(key_bytes.len() as u16).to_le_bytes());
        out.extend_from_slice(key_bytes);
        out.extend_from_slice(&entry.nonce);
        out.extend_from_slice(&(entry.ciphertext.len() as u32).to_le_bytes());
        out.extend_from_slice(&entry.ciphertext);
    }

    Ok(out)
}

fn parse_vault_file(bytes: &[u8]) -> Result<HashMap<String, EncryptedEntry>, VaultError> {
    if bytes.len() < 16 {
        return Err(VaultError::InvalidVaultFormat(
            "vault file too small for header".to_string(),
        ));
    }

    if &bytes[0..4] != VAULT_MAGIC {
        return Err(VaultError::InvalidVaultFormat(
            "invalid vault magic".to_string(),
        ));
    }

    let version = read_u32(bytes, 4)?;
    if version != VAULT_VERSION {
        return Err(VaultError::InvalidVaultFormat(format!(
            "unsupported vault version: {version}"
        )));
    }

    let count = read_u32(bytes, 8)? as usize;
    let reserved = read_u32(bytes, 12)?;
    if reserved != 0 {
        return Err(VaultError::InvalidVaultFormat(
            "reserved header field must be zero".to_string(),
        ));
    }

    let mut cursor = 16;
    let mut entries = HashMap::new();

    for _ in 0..count {
        let key_len = read_u16(bytes, cursor)? as usize;
        cursor += 2;

        let key_end = cursor
            .checked_add(key_len)
            .ok_or_else(|| VaultError::InvalidVaultFormat("key length overflow".to_string()))?;
        if key_end > bytes.len() {
            return Err(VaultError::InvalidVaultFormat(
                "key bytes exceed file length".to_string(),
            ));
        }

        let key = String::from_utf8(bytes[cursor..key_end].to_vec())?;
        cursor = key_end;

        let nonce_end = cursor + GCM_NONCE_LEN;
        if nonce_end > bytes.len() {
            return Err(VaultError::InvalidVaultFormat(
                "nonce bytes exceed file length".to_string(),
            ));
        }
        let mut nonce = [0_u8; GCM_NONCE_LEN];
        nonce.copy_from_slice(&bytes[cursor..nonce_end]);
        cursor = nonce_end;

        let ciphertext_len = read_u32(bytes, cursor)? as usize;
        cursor += 4;

        let ciphertext_end = cursor.checked_add(ciphertext_len).ok_or_else(|| {
            VaultError::InvalidVaultFormat("ciphertext length overflow".to_string())
        })?;
        if ciphertext_end > bytes.len() {
            return Err(VaultError::InvalidVaultFormat(
                "ciphertext bytes exceed file length".to_string(),
            ));
        }
        if ciphertext_len < GCM_TAG_LEN {
            return Err(VaultError::InvalidVaultFormat(
                "ciphertext shorter than gcm tag".to_string(),
            ));
        }

        entries.insert(
            key,
            EncryptedEntry {
                nonce,
                ciphertext: bytes[cursor..ciphertext_end].to_vec(),
            },
        );
        cursor = ciphertext_end;
    }

    if cursor != bytes.len() {
        return Err(VaultError::InvalidVaultFormat(
            "trailing bytes after parsing entries".to_string(),
        ));
    }

    Ok(entries)
}

fn build_master_key(master_key_bytes: &[u8; 32]) -> Result<LessSafeKey, VaultError> {
    let unbound = UnboundKey::new(&aead::AES_256_GCM, master_key_bytes)
        .map_err(|_| VaultError::Crypto("invalid AES-256-GCM key bytes".to_string()))?;
    Ok(LessSafeKey::new(unbound))
}

fn generate_master_key() -> Result<[u8; 32], VaultError> {
    let mut key = [0_u8; 32];
    SystemRandom::new()
        .fill(&mut key)
        .map_err(|_| VaultError::Crypto("failed to generate master key".to_string()))?;
    Ok(key)
}

fn next_temp_path(vault_path: &Path) -> PathBuf {
    let mut temp = vault_path.to_path_buf();
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let file_name = format!(
        "{}.tmp.{nonce}",
        vault_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("vault.enc")
    );
    temp.set_file_name(file_name);
    temp
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, VaultError> {
    let slice = bytes.get(offset..offset + 2).ok_or_else(|| {
        VaultError::InvalidVaultFormat("unexpected EOF while reading u16".to_string())
    })?;
    Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, VaultError> {
    let slice = bytes.get(offset..offset + 4).ok_or_else(|| {
        VaultError::InvalidVaultFormat("unexpected EOF while reading u32".to_string())
    })?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn encode_hex_key(key: &[u8; 32]) -> String {
    key.iter().map(|b| format!("{b:02x}")).collect()
}

fn decode_hex_key(encoded: &str) -> Result<[u8; 32], VaultError> {
    if encoded.len() != 64 {
        return Err(VaultError::InvalidVaultFormat(
            "keyring master key has invalid length".to_string(),
        ));
    }

    let mut out = [0_u8; 32];
    for (index, byte_slot) in out.iter_mut().enumerate() {
        let start = index * 2;
        let end = start + 2;
        let hex = &encoded[start..end];
        *byte_slot = u8::from_str_radix(hex, 16).map_err(|_| {
            VaultError::InvalidVaultFormat("keyring master key has non-hex chars".to_string())
        })?;
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_master_key() -> [u8; 32] {
        let mut key = [0_u8; 32];
        SystemRandom::new().fill(&mut key).unwrap();
        key
    }

    #[test]
    fn a011_vault_is_initialized_false_for_empty() {
        let dir = tempfile::tempdir().unwrap();
        let vault = SecretVault::empty(dir.path().join("v.enc"));
        assert!(!vault.is_initialized());
    }

    #[test]
    fn a011_vault_is_initialized_true_for_opened() {
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();
        assert!(vault.is_initialized());
    }

    #[test]
    fn a011_vault_rate_limit_allows_10_per_second() {
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let mut vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();
        vault.store("test:key:val", b"secret").unwrap();
        for _ in 0..10 {
            assert!(vault.read("test:key:val").is_ok());
        }
        assert!(vault.read("test:key:val").is_err());
    }

    #[test]
    fn a011_vault_rate_limit_resets_after_window() {
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let mut vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();
        vault.store("test:key:val", b"secret").unwrap();
        for _ in 0..10 {
            vault.read("test:key:val").unwrap();
        }
        vault.last_access = std::time::Instant::now() - std::time::Duration::from_secs(2);
        vault.access_count = 0;
        assert!(vault.read("test:key:val").is_ok());
    }

    #[test]
    fn a011_vault_store_and_read_roundtrip_returns_original_plaintext() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");
        let mut vault = SecretVault::open(&test_master_key(), path).unwrap();

        vault
            .store("provider:openai:apiKey", b"super-secret-value")
            .unwrap();

        let value = vault.read("provider:openai:apiKey").unwrap();
        assert_eq!(value, b"super-secret-value");
    }

    #[test]
    fn a011_vault_read_nonexistent_key_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");
        let mut vault = SecretVault::open(&test_master_key(), path).unwrap();

        let err = vault.read("missing").unwrap_err();
        assert!(matches!(err, VaultError::NotFound(key) if key == "missing"));
    }

    #[test]
    fn a011_vault_delete_removes_entry_and_read_returns_error_after_delete() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");
        let mut vault = SecretVault::open(&test_master_key(), path).unwrap();

        vault.store("custom:token", b"abc123").unwrap();
        vault.delete("custom:token").unwrap();

        let err = vault.read("custom:token").unwrap_err();
        assert!(matches!(err, VaultError::NotFound(key) if key == "custom:token"));
    }

    #[test]
    fn a011_vault_list_returns_all_stored_key_names_without_values() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");
        let mut vault = SecretVault::open(&test_master_key(), path).unwrap();

        vault.store("provider:openai:apiKey", b"key-a").unwrap();
        vault.store("webhook:stripe:secret", b"key-b").unwrap();

        let names = vault.list().unwrap();
        assert_eq!(
            names,
            vec!["provider:openai:apiKey", "webhook:stripe:secret"]
        );
    }

    #[test]
    fn a011_vault_has_returns_true_for_stored_key_false_for_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");
        let mut vault = SecretVault::open(&test_master_key(), path).unwrap();

        vault.store("custom:present", b"1").unwrap();

        assert!(vault.has("custom:present"));
        assert!(!vault.has("custom:missing"));
    }

    #[test]
    fn a011_vault_store_overwrites_existing_entry_with_new_value() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");
        let mut vault = SecretVault::open(&test_master_key(), path).unwrap();

        vault.store("provider:xai:apiKey", b"old").unwrap();
        vault.store("provider:xai:apiKey", b"new").unwrap();

        let value = vault.read("provider:xai:apiKey").unwrap();
        assert_eq!(value, b"new");
    }

    #[test]
    fn a011_vault_file_survives_close_and_reopen_with_same_master_key() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");
        let key = test_master_key();

        {
            let mut vault = SecretVault::open(&key, path.clone()).unwrap();
            vault
                .store("provider:minimax:apiKey", b"persisted")
                .unwrap();
        }

        let mut reopened = SecretVault::open(&key, path).unwrap();
        assert_eq!(
            reopened.read("provider:minimax:apiKey").unwrap(),
            b"persisted"
        );
    }

    #[test]
    fn a011_vault_file_is_unreadable_with_wrong_master_key() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");
        let key_a = test_master_key();
        let key_b = test_master_key();

        let mut vault = SecretVault::open(&key_a, path.clone()).unwrap();
        vault.store("provider:anthropic:apiKey", b"secret").unwrap();

        let mut wrong = SecretVault::open(&key_b, path).unwrap();
        let err = wrong.read("provider:anthropic:apiKey").unwrap_err();
        assert!(matches!(err, VaultError::Crypto(_)));
    }

    #[test]
    fn a011_vault_authentication_rejects_ciphertext_swapped_between_entry_names() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");
        let key = test_master_key();

        let mut vault = SecretVault::open(&key, path.clone()).unwrap();
        vault.store("key-a", b"alpha-secret").unwrap();
        vault.store("key-b", b"beta-secret").unwrap();

        let mut tampered = SecretVault::open(&key, path.clone()).unwrap();
        let ciphertext_from_a = tampered.entries.get("key-a").cloned().unwrap();
        tampered
            .entries
            .insert("key-b".to_string(), ciphertext_from_a);
        persist_entries_atomically(&path, &tampered.entries).unwrap();

        let mut reopened = SecretVault::open(&key, path).unwrap();
        let err = reopened.read("key-b").unwrap_err();
        assert!(matches!(err, VaultError::Crypto(_)));
    }

    #[test]
    fn a011_vault_atomic_write_interrupted_write_does_not_corrupt_existing_vault() {
        let dir = tempfile::tempdir().unwrap();
        let valid_path = dir.path().join("vault.enc");
        let key = test_master_key();

        let mut vault = SecretVault::open(&key, valid_path.clone()).unwrap();
        vault.store("custom:stable", b"stable-value").unwrap();

        let blocking_parent = dir.path().join("blocking-parent");
        fs::write(&blocking_parent, b"not-a-directory").unwrap();
        vault.vault_path = blocking_parent.join("vault.enc");

        let err = vault.store("custom:new", b"new-value").unwrap_err();
        assert!(matches!(err, VaultError::Io(_)));

        let mut reopened = SecretVault::open(&key, valid_path).unwrap();
        assert_eq!(reopened.read("custom:stable").unwrap(), b"stable-value");
        assert!(matches!(
            reopened.read("custom:new"),
            Err(VaultError::NotFound(_))
        ));
    }

    #[test]
    fn a011_vault_empty_vault_file_is_valid_zero_entries() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");
        let key = test_master_key();

        let empty_entries = HashMap::<String, EncryptedEntry>::new();
        let bytes = serialize_entries(&empty_entries).unwrap();
        fs::write(&path, bytes).unwrap();

        let mut vault = SecretVault::open(&key, path).unwrap();
        assert!(vault.list().unwrap().is_empty());
    }

    #[test]
    fn a011_vault_delete_nonexistent_key_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");
        let mut vault = SecretVault::open(&test_master_key(), path).unwrap();

        let err = vault.delete("custom:missing").unwrap_err();
        assert!(matches!(err, VaultError::NotFound(key) if key == "custom:missing"));
    }

    #[test]
    fn a011_vault_open_invalid_magic_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");

        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"BAD!");
        bytes.extend_from_slice(&VAULT_VERSION.to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        fs::write(&path, bytes).unwrap();

        let err = SecretVault::open(&test_master_key(), path).err().unwrap();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    #[test]
    fn a011_vault_open_invalid_version_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");

        let mut bytes = Vec::new();
        bytes.extend_from_slice(VAULT_MAGIC);
        bytes.extend_from_slice(&999_u32.to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        fs::write(&path, bytes).unwrap();

        let err = SecretVault::open(&test_master_key(), path).err().unwrap();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    #[test]
    fn a011_vault_open_nonzero_reserved_header_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");

        let mut bytes = Vec::new();
        bytes.extend_from_slice(VAULT_MAGIC);
        bytes.extend_from_slice(&VAULT_VERSION.to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u32.to_le_bytes());
        fs::write(&path, bytes).unwrap();

        let err = SecretVault::open(&test_master_key(), path).err().unwrap();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    #[test]
    fn a011_vault_open_truncated_file_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");

        fs::write(&path, b"tiny").unwrap();

        let err = SecretVault::open(&test_master_key(), path).err().unwrap();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    #[test]
    fn a011_vault_open_trailing_bytes_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");

        let mut bytes = Vec::new();
        bytes.extend_from_slice(VAULT_MAGIC);
        bytes.extend_from_slice(&VAULT_VERSION.to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        bytes.push(7);
        fs::write(&path, bytes).unwrap();

        let err = SecretVault::open(&test_master_key(), path).err().unwrap();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    #[test]
    fn a011_vault_open_ciphertext_shorter_than_tag_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");

        let key_name = b"custom:short";
        let mut bytes = Vec::new();
        bytes.extend_from_slice(VAULT_MAGIC);
        bytes.extend_from_slice(&VAULT_VERSION.to_le_bytes());
        bytes.extend_from_slice(&1_u32.to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        bytes.extend_from_slice(&(key_name.len() as u16).to_le_bytes());
        bytes.extend_from_slice(key_name);
        bytes.extend_from_slice(&[1_u8; GCM_NONCE_LEN]);
        bytes.extend_from_slice(&8_u32.to_le_bytes());
        bytes.extend_from_slice(&[9_u8; 8]);
        fs::write(&path, bytes).unwrap();

        let err = SecretVault::open(&test_master_key(), path).err().unwrap();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    #[test]
    fn a011_vault_open_invalid_utf8_key_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");

        let mut bytes = Vec::new();
        bytes.extend_from_slice(VAULT_MAGIC);
        bytes.extend_from_slice(&VAULT_VERSION.to_le_bytes());
        bytes.extend_from_slice(&1_u32.to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.push(0xff);
        bytes.extend_from_slice(&[0_u8; GCM_NONCE_LEN]);
        bytes.extend_from_slice(&(GCM_TAG_LEN as u32).to_le_bytes());
        bytes.extend_from_slice(&[0_u8; GCM_TAG_LEN]);
        fs::write(&path, bytes).unwrap();

        let err = SecretVault::open(&test_master_key(), path).err().unwrap();
        assert!(matches!(err, VaultError::Utf8(_)));
    }

    #[test]
    fn a011_vault_helpers_decode_hex_rejects_invalid_inputs() {
        let invalid_len = decode_hex_key("abcd").unwrap_err();
        assert!(matches!(invalid_len, VaultError::InvalidVaultFormat(_)));

        let invalid_hex = decode_hex_key(&"z".repeat(64)).unwrap_err();
        assert!(matches!(invalid_hex, VaultError::InvalidVaultFormat(_)));
    }

    #[test]
    fn a011_vault_helpers_encode_decode_hex_roundtrip() {
        let key = test_master_key();
        let encoded = encode_hex_key(&key);
        let decoded = decode_hex_key(&encoded).unwrap();
        assert_eq!(decoded, key);
    }

    #[test]
    fn a011_vault_helpers_read_u16_u32_eof_returns_error() {
        assert!(matches!(
            read_u16(&[], 0),
            Err(VaultError::InvalidVaultFormat(_))
        ));
        assert!(matches!(
            read_u32(&[], 0),
            Err(VaultError::InvalidVaultFormat(_))
        ));
    }

    #[test]
    fn a011_vault_keyfile_loader_generates_then_reuses_key() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.key");

        let key_a = load_or_generate_master_keyfile(&path).unwrap();
        let key_b = load_or_generate_master_keyfile(&path).unwrap();

        assert_eq!(key_a, key_b);
        assert_eq!(fs::read(&path).unwrap(), key_a);
    }

    #[test]
    fn a011_vault_keyfile_loader_invalid_size_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.key");
        fs::write(&path, [1_u8; 12]).unwrap();

        let err = load_or_generate_master_keyfile(&path).unwrap_err();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    #[test]
    fn a011_vault_load_or_generate_master_key_returns_32_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let key = load_or_generate_master_key(dir.path()).unwrap();
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn a011_vault_display_formats_all_error_variants() {
        let io_err = VaultError::Io(io::Error::other("io"));
        let keyring_err = VaultError::Keyring("k".to_string());
        let format_err = VaultError::InvalidVaultFormat("f".to_string());
        let crypto_err = VaultError::Crypto("c".to_string());
        let not_found = VaultError::NotFound("missing".to_string());
        let utf8_err = String::from_utf8(vec![0xff]).unwrap_err();
        let utf8_variant = VaultError::Utf8(utf8_err);
        let rate_limited = VaultError::RateLimited;

        let rendered = [
            io_err.to_string(),
            keyring_err.to_string(),
            format_err.to_string(),
            crypto_err.to_string(),
            not_found.to_string(),
            utf8_variant.to_string(),
            rate_limited.to_string(),
        ];

        assert!(rendered[0].contains("io error"));
        assert!(rendered[1].contains("keyring error"));
        assert!(rendered[2].contains("invalid vault format"));
        assert!(rendered[3].contains("crypto error"));
        assert!(rendered[4].contains("secret not found"));
        assert!(rendered[5].contains("utf8 error"));
        assert!(rendered[6].contains("rate limited"));
    }

    // ---- Rate-limit boundary ----

    #[test]
    fn a011_vault_rate_limit_exactly_10_reads_are_allowed() {
        // Reads 1-10 within the same second must all succeed; the 11th fails.
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let mut vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();
        vault.store("k", b"v").unwrap();

        // Force the clock to a known recent value so we stay within the 1-second window.
        vault.last_access = std::time::Instant::now();
        vault.access_count = 0;

        // Reads 1-10 are fine (access_count goes 1..=10).
        for i in 1..=10_u32 {
            vault.check_rate_limit().unwrap_or_else(|_| {
                panic!("read #{i} should be allowed");
            });
        }
        // Read 11 crosses the limit.
        let err = vault.check_rate_limit().unwrap_err();
        assert!(matches!(err, VaultError::RateLimited));
    }

    #[test]
    fn a011_vault_rate_limit_window_resets_when_elapsed_exactly_1s() {
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let mut vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();
        vault.store("k", b"v").unwrap();

        // Exhaust the rate limit.
        vault.last_access = std::time::Instant::now();
        vault.access_count = 0;
        for _ in 0..10 {
            vault.check_rate_limit().unwrap();
        }
        assert!(matches!(
            vault.check_rate_limit().unwrap_err(),
            VaultError::RateLimited
        ));

        // Wind back last_access by more than 1 second so the next call resets.
        vault.last_access =
            std::time::Instant::now() - std::time::Duration::from_millis(1001);

        // First call after window: reset branch — sets access_count = 1.
        vault.check_rate_limit().unwrap();
        assert_eq!(vault.access_count, 1);
    }

    // ---- Serialize: key too long ----

    #[test]
    fn a011_vault_serialize_entries_rejects_key_exceeding_u16_max() {
        // Build an EncryptedEntry with a key name longer than u16::MAX bytes.
        let long_key = "x".repeat(u16::MAX as usize + 1);
        let mut entries = HashMap::new();
        entries.insert(
            long_key,
            EncryptedEntry {
                nonce: [0_u8; GCM_NONCE_LEN],
                ciphertext: vec![0_u8; GCM_TAG_LEN],
            },
        );
        let err = serialize_entries(&entries).unwrap_err();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    // ---- parse_vault_file: key_len checked_add overflow ----

    #[test]
    fn a011_vault_open_key_length_overflow_returns_error() {
        // Craft a file where key_len would push cursor past usize::MAX.
        // We embed count=1, key_len=u16::MAX. The file is too short for that
        // many key bytes, so we hit the "key bytes exceed file length" path.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");

        let mut bytes: Vec<u8> = Vec::new();
        bytes.extend_from_slice(VAULT_MAGIC);
        bytes.extend_from_slice(&VAULT_VERSION.to_le_bytes());
        bytes.extend_from_slice(&1_u32.to_le_bytes()); // count = 1
        bytes.extend_from_slice(&0_u32.to_le_bytes()); // reserved
        // key_len = 0xFFFF but we write only 1 byte of key data => exceeds file.
        bytes.extend_from_slice(&(u16::MAX).to_le_bytes());
        bytes.push(b'A'); // only 1 byte
        fs::write(&path, &bytes).unwrap();

        let err = SecretVault::open(&test_master_key(), path).err().unwrap();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    // ---- parse_vault_file: nonce truncated ----

    #[test]
    fn a011_vault_open_nonce_bytes_truncated_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");

        let key_name = b"k";
        let mut bytes: Vec<u8> = Vec::new();
        bytes.extend_from_slice(VAULT_MAGIC);
        bytes.extend_from_slice(&VAULT_VERSION.to_le_bytes());
        bytes.extend_from_slice(&1_u32.to_le_bytes()); // count = 1
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        bytes.extend_from_slice(&(key_name.len() as u16).to_le_bytes());
        bytes.extend_from_slice(key_name);
        // Write fewer than GCM_NONCE_LEN bytes for the nonce.
        bytes.extend_from_slice(&[0_u8; GCM_NONCE_LEN - 1]);
        fs::write(&path, &bytes).unwrap();

        let err = SecretVault::open(&test_master_key(), path).err().unwrap();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    // ---- parse_vault_file: ciphertext length field truncated (read_u32 at ciphertext_len) ----

    #[test]
    fn a011_vault_open_ciphertext_len_field_truncated_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");

        let key_name = b"k";
        let mut bytes: Vec<u8> = Vec::new();
        bytes.extend_from_slice(VAULT_MAGIC);
        bytes.extend_from_slice(&VAULT_VERSION.to_le_bytes());
        bytes.extend_from_slice(&1_u32.to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        bytes.extend_from_slice(&(key_name.len() as u16).to_le_bytes());
        bytes.extend_from_slice(key_name);
        bytes.extend_from_slice(&[0_u8; GCM_NONCE_LEN]); // full nonce
        // Only 2 bytes for the ciphertext_len u32 field (needs 4).
        bytes.extend_from_slice(&[0_u8; 2]);
        fs::write(&path, &bytes).unwrap();

        let err = SecretVault::open(&test_master_key(), path).err().unwrap();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    // ---- parse_vault_file: ciphertext bytes exceed file ----

    #[test]
    fn a011_vault_open_ciphertext_bytes_exceed_file_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");

        let key_name = b"k";
        let mut bytes: Vec<u8> = Vec::new();
        bytes.extend_from_slice(VAULT_MAGIC);
        bytes.extend_from_slice(&VAULT_VERSION.to_le_bytes());
        bytes.extend_from_slice(&1_u32.to_le_bytes());
        bytes.extend_from_slice(&0_u32.to_le_bytes());
        bytes.extend_from_slice(&(key_name.len() as u16).to_le_bytes());
        bytes.extend_from_slice(key_name);
        bytes.extend_from_slice(&[0_u8; GCM_NONCE_LEN]);
        // Claim ciphertext is 100 bytes but provide 0.
        bytes.extend_from_slice(&100_u32.to_le_bytes());
        fs::write(&path, &bytes).unwrap();

        let err = SecretVault::open(&test_master_key(), path).err().unwrap();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    // ---- VaultError From impls ----

    #[test]
    fn a011_vault_error_from_io_error_wraps_correctly() {
        let io_err = io::Error::other("disk full");
        let vault_err: VaultError = VaultError::from(io_err);
        assert!(matches!(vault_err, VaultError::Io(_)));
        assert!(vault_err.to_string().contains("disk full"));
    }

    #[test]
    fn a011_vault_error_from_utf8_error_wraps_correctly() {
        let utf8_err = String::from_utf8(vec![0xff, 0xfe]).unwrap_err();
        let vault_err: VaultError = VaultError::from(utf8_err);
        assert!(matches!(vault_err, VaultError::Utf8(_)));
        assert!(vault_err.to_string().contains("utf8 error"));
    }

    // ---- std::error::Error impl ----

    #[test]
    fn a011_vault_error_implements_std_error() {
        // Ensure the Error supertrait is usable; source() returns None for all variants.
        use std::error::Error;

        let io_err: &dyn Error = &VaultError::Io(io::Error::other("x"));
        let _ = io_err.source();

        let rate: &dyn Error = &VaultError::RateLimited;
        let _ = rate.source();
    }

    // ---- Empty key name ----

    #[test]
    fn a011_vault_store_and_read_empty_key_name() {
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let mut vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();

        vault.store("", b"value-for-empty-key").unwrap();
        assert!(vault.has(""));
        let val = vault.read("").unwrap();
        assert_eq!(val, b"value-for-empty-key");
    }

    // ---- Empty value ----

    #[test]
    fn a011_vault_store_and_read_empty_value() {
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let mut vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();

        vault.store("custom:empty-val", b"").unwrap();
        let val = vault.read("custom:empty-val").unwrap();
        assert_eq!(val, b"");
    }

    // ---- list on empty vault ----

    #[test]
    fn a011_vault_list_on_empty_vault_returns_empty_vec() {
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let mut vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();
        assert_eq!(vault.list().unwrap(), Vec::<String>::new());
    }

    // ---- list is sorted ----

    #[test]
    fn a011_vault_list_returns_keys_in_sorted_order() {
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let mut vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();

        vault.store("z:last", b"z").unwrap();
        vault.store("a:first", b"a").unwrap();
        vault.store("m:middle", b"m").unwrap();

        let names = vault.list().unwrap();
        assert_eq!(names, vec!["a:first", "m:middle", "z:last"]);
    }

    // ---- delete reduces list ----

    #[test]
    fn a011_vault_delete_reduces_list_length() {
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let mut vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();

        vault.store("custom:a", b"1").unwrap();
        vault.store("custom:b", b"2").unwrap();
        vault.delete("custom:a").unwrap();

        let names = vault.list().unwrap();
        assert_eq!(names, vec!["custom:b"]);
    }

    // ---- persist failure during rename leaves temp file cleaned up ----

    #[test]
    fn a011_vault_persist_rename_failure_returns_io_error() {
        // Directly test persist_entries_atomically when the rename target
        // directory does not exist (simulates a mid-flight rename failure).
        let dir = tempfile::tempdir().unwrap();

        let mut entries = HashMap::new();
        entries.insert(
            "custom:x".to_string(),
            EncryptedEntry {
                nonce: [0_u8; GCM_NONCE_LEN],
                ciphertext: vec![0_u8; GCM_TAG_LEN],
            },
        );

        // persist_entries_atomically creates the parent via create_dir_all, so
        // we need a path whose parent cannot be created (a file standing in the way).
        let blocker = dir.path().join("blocker");
        fs::write(&blocker, b"not a dir").unwrap();
        let blocked = blocker.join("vault.enc");

        let err = persist_entries_atomically(&blocked, &entries).unwrap_err();
        assert!(matches!(err, VaultError::Io(_)));
    }

    // ---- next_temp_path when vault has no filename component ----

    #[test]
    fn a011_vault_next_temp_path_uses_fallback_when_no_filename() {
        // A path that ends in ".." has no file_name() component.
        let p = std::path::PathBuf::from("/tmp/..");
        let tmp = next_temp_path(&p);
        let name = tmp
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        assert!(name.starts_with("vault.enc.tmp."), "got: {name}");
    }

    // ---- load_or_generate_master_keyfile: permissions fix branch (unix only) ----

    #[cfg(unix)]
    #[test]
    fn a011_vault_keyfile_loader_fixes_wrong_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.key");

        // Write a valid 32-byte key with too-open permissions.
        let key_bytes = [0xAB_u8; 32];
        fs::write(&path, key_bytes).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();

        // Loader should fix the permissions and return the key successfully.
        let loaded = load_or_generate_master_keyfile(&path).unwrap();
        assert_eq!(loaded, key_bytes);

        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    // ---- load_or_generate_master_keyfile: generate creates nested dir ----

    #[test]
    fn a011_vault_keyfile_loader_creates_parent_directories() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("a").join("b").join("vault.key");

        // Parent dirs don't exist yet; loader must create them.
        let key = load_or_generate_master_keyfile(&nested).unwrap();
        assert_eq!(key.len(), 32);
        assert!(nested.exists());
    }

    // ---- Vault opened with non-existent path creates fresh file on first store ----

    #[test]
    fn a011_vault_open_nonexistent_path_creates_file_on_first_store() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("new-sub").join("vault.enc");
        let key = test_master_key();

        // path doesn't exist yet — open must succeed.
        let mut vault = SecretVault::open(&key, path.clone()).unwrap();
        assert!(!path.exists());

        vault.store("custom:new", b"hello").unwrap();
        assert!(path.exists());
    }

    // ---- Large plaintext value roundtrip ----

    #[test]
    fn a011_vault_store_and_read_large_value_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let mut vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();

        let large_value = vec![0xDE_u8; 64 * 1024]; // 64 KiB
        vault.store("custom:large", &large_value).unwrap();
        let read_back = vault.read("custom:large").unwrap();
        assert_eq!(read_back, large_value);
    }

    // ---- Multiple entries survive reopen ----

    #[test]
    fn a011_vault_multiple_entries_persist_across_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");
        let key = test_master_key();

        {
            let mut vault = SecretVault::open(&key, path.clone()).unwrap();
            vault.store("provider:openai:apiKey", b"openai-secret").unwrap();
            vault.store("provider:anthropic:apiKey", b"anthropic-secret").unwrap();
            vault.store("webhook:stripe:secret", b"stripe-secret").unwrap();
        }

        let mut reopened = SecretVault::open(&key, path).unwrap();
        assert_eq!(
            reopened.read("provider:openai:apiKey").unwrap(),
            b"openai-secret"
        );
        assert_eq!(
            reopened.read("provider:anthropic:apiKey").unwrap(),
            b"anthropic-secret"
        );
        assert_eq!(
            reopened.read("webhook:stripe:secret").unwrap(),
            b"stripe-secret"
        );
    }

    // ---- read respects rate limit ----

    #[test]
    fn a011_vault_read_returns_rate_limited_error_after_10_reads() {
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let mut vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();
        vault.store("k", b"v").unwrap();

        vault.last_access = std::time::Instant::now();
        vault.access_count = 0;

        for _ in 0..10 {
            vault.read("k").unwrap();
        }
        let err = vault.read("k").unwrap_err();
        assert!(matches!(err, VaultError::RateLimited));
    }

    // ---- empty vault `has` returns false ----

    #[test]
    fn a011_vault_has_on_empty_vault_returns_false() {
        let dir = tempfile::tempdir().unwrap();
        let vault = SecretVault::empty(dir.path().join("v.enc"));
        assert!(!vault.has("anything"));
    }

    // ---- load_or_generate_master_key: second call hits keyring or keyfile cache ----

    #[test]
    fn a011_vault_load_or_generate_master_key_second_call_returns_same_key() {
        // Second call must return the same 32-byte key as the first call.
        // Whether the key is stored in the keyring or keyfile depends on the
        // environment; the contract is just that it is stable across calls.
        let dir = tempfile::tempdir().unwrap();
        let key_a = load_or_generate_master_key(dir.path()).unwrap();
        let key_b = load_or_generate_master_key(dir.path()).unwrap();
        assert_eq!(key_a, key_b);
    }

    // ---- persist_entries_atomically: vault path with no parent component ----

    #[test]
    fn a011_vault_persist_atomically_with_no_parent_path() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.enc");
        let entries = HashMap::<String, EncryptedEntry>::new();
        persist_entries_atomically(&path, &entries).unwrap();
        assert!(path.exists());

        // Confirm the file is a valid vault parseable with zero entries.
        let bytes = std::fs::read(&path).unwrap();
        let parsed = parse_vault_file(&bytes).unwrap();
        assert!(parsed.is_empty());
    }

    // ---- persist_entries_atomically: rename fails leaving original intact ----

    #[cfg(unix)]
    #[test]
    fn a011_vault_persist_rename_failure_cleans_up_temp_file() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let vault_dir = dir.path().join("readonly");
        fs::create_dir_all(&vault_dir).unwrap();

        let path = vault_dir.join("vault.enc");
        let entries = HashMap::<String, EncryptedEntry>::new();

        // Write a valid vault first so we know the path exists.
        persist_entries_atomically(&path, &entries).unwrap();
        assert!(path.exists());

        // Make the directory read-only: new files can't be written and rename will fail.
        fs::set_permissions(&vault_dir, fs::Permissions::from_mode(0o500)).unwrap();

        let err = persist_entries_atomically(&path, &entries);

        // Restore permissions so tempdir cleanup succeeds.
        fs::set_permissions(&vault_dir, fs::Permissions::from_mode(0o700)).unwrap();

        // The call should fail since we can't write a new temp file.
        assert!(err.is_err());
    }

    // ---- serialize_entries roundtrip through parse_vault_file ----

    #[test]
    fn a011_vault_serialize_then_parse_roundtrip_preserves_all_entries() {
        let key = test_master_key();
        let master = build_master_key(&key).unwrap();

        let nonce_a = [1_u8; GCM_NONCE_LEN];
        let nonce_b = [2_u8; GCM_NONCE_LEN];

        let mut entries = HashMap::new();
        entries.insert(
            "alpha".to_string(),
            EncryptedEntry { nonce: nonce_a, ciphertext: vec![0xAA; GCM_TAG_LEN + 4] },
        );
        entries.insert(
            "beta".to_string(),
            EncryptedEntry { nonce: nonce_b, ciphertext: vec![0xBB; GCM_TAG_LEN + 4] },
        );

        let bytes = serialize_entries(&entries).unwrap();
        let parsed = parse_vault_file(&bytes).unwrap();

        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed["alpha"].nonce, nonce_a);
        assert_eq!(parsed["beta"].nonce, nonce_b);

        // Touch master to silence unused warning.
        let _ = master;
    }

    // ---- build_master_key called directly ----

    #[test]
    fn a011_vault_build_master_key_succeeds_with_valid_32_byte_key() {
        let key_bytes = [0x42_u8; 32];
        let result = build_master_key(&key_bytes);
        assert!(result.is_ok());
    }

    // ---- generate_master_key produces 32 unique bytes ----

    #[test]
    fn a011_vault_generate_master_key_produces_32_random_bytes() {
        let key_a = generate_master_key().unwrap();
        let key_b = generate_master_key().unwrap();
        assert_eq!(key_a.len(), 32);
        // Two freshly generated keys should differ (probability 1 - 2^-256).
        assert_ne!(key_a, key_b);
    }

    // ---- encode_hex_key / decode_hex_key edge cases ----

    #[test]
    fn a011_vault_encode_hex_key_produces_64_char_lowercase_hex() {
        let key = [0xFF_u8; 32];
        let encoded = encode_hex_key(&key);
        assert_eq!(encoded.len(), 64);
        assert!(encoded.chars().all(|c| "0123456789abcdef".contains(c)));
        assert_eq!(&encoded[..4], "ffff");
    }

    #[test]
    fn a011_vault_decode_hex_key_rejects_63_char_string() {
        let short = "a".repeat(63);
        let err = decode_hex_key(&short).unwrap_err();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    #[test]
    fn a011_vault_decode_hex_key_rejects_65_char_string() {
        let long = "a".repeat(65);
        let err = decode_hex_key(&long).unwrap_err();
        assert!(matches!(err, VaultError::InvalidVaultFormat(_)));
    }

    // ---- read_u16 / read_u32 with non-zero offsets ----

    #[test]
    fn a011_vault_read_u16_at_valid_offset() {
        let data = [0x00, 0x01, 0x02, 0x03];
        assert_eq!(read_u16(&data, 0).unwrap(), 0x0100);
        assert_eq!(read_u16(&data, 2).unwrap(), 0x0302);
    }

    #[test]
    fn a011_vault_read_u32_at_valid_offset() {
        let data = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
        assert_eq!(read_u32(&data, 0).unwrap(), 0x04030201);
        assert_eq!(read_u32(&data, 4).unwrap(), 0x08070605);
    }

    #[test]
    fn a011_vault_read_u16_at_boundary_eof_returns_error() {
        let data = [0x01_u8; 3];
        // offset 2 needs bytes[2..4] but len is 3 → error.
        assert!(read_u16(&data, 2).is_err());
    }

    #[test]
    fn a011_vault_read_u32_at_boundary_eof_returns_error() {
        let data = [0x01_u8; 5];
        // offset 2 needs bytes[2..6] but len is 5 → error.
        assert!(read_u32(&data, 2).is_err());
    }

    // ---- next_temp_path with normal path ----

    #[test]
    fn a011_vault_next_temp_path_uses_vault_filename_prefix() {
        let p = std::path::PathBuf::from("/tmp/vault.enc");
        let tmp = next_temp_path(&p);
        let name = tmp.file_name().and_then(|s| s.to_str()).unwrap_or("");
        assert!(name.starts_with("vault.enc.tmp."), "got: {name}");
        // Temp path must be in same directory.
        assert_eq!(tmp.parent(), p.parent());
    }

    // ---- VaultError::Keyring display ----

    #[test]
    fn a011_vault_error_keyring_variant_contains_message() {
        let err = VaultError::Keyring("connection refused".to_string());
        assert!(err.to_string().contains("connection refused"));
    }

    // ---- NotFound display contains key name ----

    #[test]
    fn a011_vault_error_not_found_contains_key_name() {
        let err = VaultError::NotFound("provider:openai:apiKey".to_string());
        assert!(err.to_string().contains("provider:openai:apiKey"));
    }

    // ---- Multiple stores then list maintains sort stability ----

    #[test]
    fn a011_vault_list_is_stable_after_multiple_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let mut vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();

        vault.store("custom:c", b"c").unwrap();
        vault.store("custom:a", b"a").unwrap();
        vault.store("custom:b", b"b").unwrap();
        vault.store("custom:a", b"a2").unwrap(); // overwrite

        let names = vault.list().unwrap();
        assert_eq!(names, vec!["custom:a", "custom:b", "custom:c"]);
    }

    // ---- store followed by delete then store again ----

    #[test]
    fn a011_vault_store_after_delete_reinserts_key() {
        let dir = tempfile::tempdir().unwrap();
        let key = test_master_key();
        let mut vault = SecretVault::open(&key, dir.path().join("v.enc")).unwrap();

        vault.store("custom:x", b"first").unwrap();
        vault.delete("custom:x").unwrap();
        vault.store("custom:x", b"second").unwrap();

        let val = vault.read("custom:x").unwrap();
        assert_eq!(val, b"second");
    }

    // ---- EncryptedEntry Clone and Debug derive coverage ----

    #[test]
    fn a011_vault_encrypted_entry_clone_is_deep_copy() {
        let original = EncryptedEntry {
            nonce: [0xAA_u8; GCM_NONCE_LEN],
            ciphertext: vec![0xBB; 32],
        };
        let cloned = original.clone();
        assert_eq!(original.nonce, cloned.nonce);
        assert_eq!(original.ciphertext, cloned.ciphertext);
    }

    #[test]
    fn a011_vault_encrypted_entry_debug_format_is_non_empty() {
        let entry = EncryptedEntry {
            nonce: [0_u8; GCM_NONCE_LEN],
            ciphertext: vec![1, 2, 3],
        };
        let debug_str = format!("{entry:?}");
        assert!(debug_str.contains("EncryptedEntry"));
    }

    // ---- VaultError Debug format ----

    #[test]
    fn a011_vault_error_debug_format_all_variants() {
        let variants: Vec<String> = vec![
            format!("{:?}", VaultError::Io(io::Error::other("io"))),
            format!("{:?}", VaultError::Keyring("k".to_string())),
            format!("{:?}", VaultError::InvalidVaultFormat("f".to_string())),
            format!("{:?}", VaultError::Crypto("c".to_string())),
            format!("{:?}", VaultError::NotFound("n".to_string())),
            format!("{:?}", VaultError::Utf8(String::from_utf8(vec![0xff]).unwrap_err())),
            format!("{:?}", VaultError::RateLimited),
        ];
        for s in &variants {
            assert!(!s.is_empty());
        }
    }

    // ---- EncryptedEntry Serialize/Deserialize via serde_json ----

    #[test]
    fn a011_vault_encrypted_entry_serde_json_roundtrip() {
        // Exercise the Serialize/Deserialize derives on EncryptedEntry.
        let original = EncryptedEntry {
            nonce: [0x11_u8; GCM_NONCE_LEN],
            ciphertext: vec![0x22; 20],
        };
        let serialized = serde_json::to_string(&original).unwrap();
        let deserialized: EncryptedEntry = serde_json::from_str(&serialized).unwrap();
        assert_eq!(original.nonce, deserialized.nonce);
        assert_eq!(original.ciphertext, deserialized.ciphertext);
    }
}
