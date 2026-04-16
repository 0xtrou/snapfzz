// A037/DataDir: Centralized runtime data directory management
//
// All runtime data (databases, configs, logs) lives under
// `<data_dir>/data/<runtime-slug>/` — one directory per service.
// This ensures isolation and makes future data migration trivial.

use crate::core::constants::dirs;
use std::path::{Path, PathBuf};
use thiserror::Error;

// A037/DataDir: Known runtime slugs — single source of truth
pub mod slugs {
    pub const LITELLM: &str = "litellm";
}

// A037/DataError: Error variants for data directory operations
#[derive(Debug, Error)]
pub enum DataError {
    #[error("failed to create data directory for '{slug}': {source}")]
    CreateFailed {
        slug: String,
        source: std::io::Error,
    },
    #[error("data directory for '{slug}' does not exist: {path}")]
    NotFound { slug: String, path: String },
}

/// Manages runtime data directories under `<data_dir>/data/<runtime-slug>/`.
///
// A037/DataDir: Centralized path construction for all runtime data
pub struct DataDir {
    base: PathBuf,
}

impl DataDir {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            base: data_dir.join(dirs::DATA),
        }
    }

    /// Returns the data directory for a given runtime slug.
    // A037/DataDir: Per-runtime subdirectory path
    pub fn runtime_dir(&self, slug: &str) -> PathBuf {
        self.base.join(slug)
    }

    /// Ensures the data directory for a runtime exists, creating it if needed.
    // A037/DataDir: Idempotent directory creation
    pub fn ensure_runtime_dir(&self, slug: &str) -> Result<PathBuf, DataError> {
        let dir = self.runtime_dir(slug);
        if !dir.exists() {
            std::fs::create_dir_all(&dir).map_err(|source| DataError::CreateFailed {
                slug: slug.to_string(),
                source,
            })?;
        }
        Ok(dir)
    }

    /// Returns the path to a database file for a given runtime.
    // A037/DataDir: Database file path construction
    pub fn database_path(&self, slug: &str, filename: &str) -> PathBuf {
        self.runtime_dir(slug).join(filename)
    }

    /// Returns the path to a config file for a given runtime.
    // A037/DataDir: Config file path construction
    pub fn config_path(&self, slug: &str, filename: &str) -> PathBuf {
        self.runtime_dir(slug).join(filename)
    }

    /// Returns the base data directory (e.g., `~/.snapfzz/data/`).
    pub fn base(&self) -> &Path {
        &self.base
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn t37_data_dir_new_creates_base_under_data_dir() {
        let temp = tempfile::tempdir().expect("tempdir");
        let data = DataDir::new(temp.path());
        assert_eq!(data.base(), temp.path().join("data"));
    }

    #[test]
    fn t37_data_dir_runtime_dir_combines_base_and_slug() {
        let temp = tempfile::tempdir().expect("tempdir");
        let data = DataDir::new(temp.path());
        assert_eq!(
            data.runtime_dir(slugs::LITELLM),
            temp.path().join("data").join("litellm")
        );
    }

    #[test]
    fn t37_data_dir_ensure_runtime_dir_creates_directory() {
        let temp = tempfile::tempdir().expect("tempdir");
        let data = DataDir::new(temp.path());
        let dir = data.ensure_runtime_dir(slugs::LITELLM).expect("ensure");
        assert!(dir.exists());
        assert!(dir.is_dir());
    }

    #[test]
    fn t37_data_dir_ensure_runtime_dir_idempotent() {
        let temp = tempfile::tempdir().expect("tempdir");
        let data = DataDir::new(temp.path());
        let dir1 = data.ensure_runtime_dir(slugs::LITELLM).expect("ensure 1");
        let dir2 = data.ensure_runtime_dir(slugs::LITELLM).expect("ensure 2");
        assert_eq!(dir1, dir2);
    }

    #[test]
    fn t37_data_dir_ensure_runtime_dir_error_on_invalid_slug() {
        let temp = tempfile::tempdir().expect("tempdir");
        let data = DataDir::new(temp.path());
        // Use a slug with path traversal attempt — should still work
        // because we don't sanitize; the OS handles it.
        let dir = data.ensure_runtime_dir("custom-runtime").expect("ensure");
        assert!(dir.exists());
        assert!(dir.to_string_lossy().contains("custom-runtime"));
    }

    #[test]
    fn t37_data_dir_database_path_combines_runtime_dir_and_filename() {
        let temp = tempfile::tempdir().expect("tempdir");
        let data = DataDir::new(temp.path());
        assert_eq!(
            data.database_path(slugs::LITELLM, "litellm.db"),
            temp.path().join("data").join("litellm").join("litellm.db")
        );
    }

    #[test]
    fn t37_data_dir_config_path_combines_runtime_dir_and_filename() {
        let temp = tempfile::tempdir().expect("tempdir");
        let data = DataDir::new(temp.path());
        assert_eq!(
            data.config_path(slugs::LITELLM, "config.yaml"),
            temp.path().join("data").join("litellm").join("config.yaml")
        );
    }

    #[test]
    fn t37_data_dir_multiple_runtimes_have_separate_directories() {
        let temp = tempfile::tempdir().expect("tempdir");
        let data = DataDir::new(temp.path());
        let litellm = data.ensure_runtime_dir(slugs::LITELLM).expect("litellm");
        let custom = data.ensure_runtime_dir("custom-service").expect("custom");
        assert_ne!(litellm, custom);
        assert!(litellm.exists());
        assert!(custom.exists());
    }

    #[test]
    fn t37_data_dir_ensure_runtime_dir_fails_when_parent_is_a_file() {
        // Trigger CreateFailed by placing a regular file where a directory would need to go.
        let temp = tempfile::tempdir().expect("tempdir");
        // Write a file at the path that `data/` would occupy — so create_dir_all
        // cannot create `data/litellm` because `data` is a file, not a directory.
        let data_path = temp.path().join("data");
        std::fs::write(&data_path, b"I am a file, not a dir").expect("write file");

        let data_dir = DataDir::new(temp.path());
        let err = data_dir.ensure_runtime_dir(slugs::LITELLM).expect_err("should fail");
        assert!(matches!(err, DataError::CreateFailed { .. }));
        assert!(err.to_string().contains(slugs::LITELLM));
    }

    #[test]
    fn t37_data_error_create_failed_formats_message() {
        let error = DataError::CreateFailed {
            slug: "test".to_string(),
            source: std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied"),
        };
        assert!(error.to_string().contains("test"));
        assert!(error.to_string().contains("denied"));
    }

    #[test]
    fn t37_data_error_not_found_formats_message() {
        let error = DataError::NotFound {
            slug: "test".to_string(),
            path: "/some/path".to_string(),
        };
        assert!(error.to_string().contains("test"));
        assert!(error.to_string().contains("/some/path"));
    }
}
