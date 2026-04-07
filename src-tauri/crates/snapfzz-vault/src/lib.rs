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
}

#[derive(Debug)]
pub enum VaultError {
    Io(io::Error),
    Keyring(String),
    InvalidVaultFormat(String),
    Crypto(String),
    NotFound(String),
    Utf8(std::string::FromUtf8Error),
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

    pub fn read(&self, key: &str) -> Result<Vec<u8>, VaultError> {
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

    pub fn list(&self) -> Vec<String> {
        let mut keys: Vec<String> = self.entries.keys().cloned().collect();
        keys.sort();
        keys
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
        let vault = SecretVault::open(&test_master_key(), path).unwrap();

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

        let names = vault.list();
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

        let reopened = SecretVault::open(&key, path).unwrap();
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

        let wrong = SecretVault::open(&key_b, path).unwrap();
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

        let reopened = SecretVault::open(&key, path).unwrap();
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

        let reopened = SecretVault::open(&key, valid_path).unwrap();
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

        let vault = SecretVault::open(&key, path).unwrap();
        assert!(vault.list().is_empty());
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

        let rendered = [
            io_err.to_string(),
            keyring_err.to_string(),
            format_err.to_string(),
            crypto_err.to_string(),
            not_found.to_string(),
            utf8_variant.to_string(),
        ];

        assert!(rendered[0].contains("io error"));
        assert!(rendered[1].contains("keyring error"));
        assert!(rendered[2].contains("invalid vault format"));
        assert!(rendered[3].contains("crypto error"));
        assert!(rendered[4].contains("secret not found"));
        assert!(rendered[5].contains("utf8 error"));
    }
}
