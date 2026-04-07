use std::path::{Path, PathBuf};

pub mod schema;

pub use schema::Settings;

#[derive(Debug)]
pub enum SettingsError {
    Io(std::io::Error),
    Parse(serde_json::Error),
}

impl std::fmt::Display for SettingsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "{error}"),
            Self::Parse(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for SettingsError {}

impl From<std::io::Error> for SettingsError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for SettingsError {
    fn from(value: serde_json::Error) -> Self {
        Self::Parse(value)
    }
}

pub fn settings_path(data_dir: &Path) -> PathBuf {
    data_dir.join("settings.json")
}

pub struct SettingsManager {
    data_dir: PathBuf,
}

impl SettingsManager {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { data_dir }
    }

    pub fn load(&self) -> Result<Settings, SettingsError> {
        let path = self.path();
        if !path.exists() {
            return Ok(Settings::default());
        }

        let content = std::fs::read_to_string(path)?;
        Ok(serde_json::from_str::<Settings>(&content)?)
    }

    pub fn save(&self, settings: &Settings) -> Result<(), SettingsError> {
        let path = self.path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let content = serde_json::to_string_pretty(settings)?;
        std::fs::write(path, content)?;
        Ok(())
    }

    pub fn path(&self) -> PathBuf {
        settings_path(&self.data_dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a014_settings_load_returns_defaults_when_file_missing() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let mgr = SettingsManager::new(tmp.path().to_path_buf());
        let loaded = mgr.load().expect("load settings");
        assert_eq!(loaded, Settings::default());
    }

    #[test]
    fn a014_settings_save_and_load_round_trip() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let mgr = SettingsManager::new(tmp.path().to_path_buf());

        let mut expected = Settings::default();
        expected.theme = "dark".to_string();
        expected.agentscope_host = "0.0.0.0".to_string();
        expected.agentscope_port = "9001".to_string();

        mgr.save(&expected).expect("save settings");
        let loaded = mgr.load().expect("load settings");
        assert_eq!(loaded, expected);
    }

    #[test]
    fn a014_settings_path_points_to_settings_json() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let mgr = SettingsManager::new(tmp.path().to_path_buf());
        assert_eq!(mgr.path(), tmp.path().join("settings.json"));
    }
}
