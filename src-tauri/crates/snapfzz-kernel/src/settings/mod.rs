use std::path::PathBuf;

use crate::settings::schema::Settings;

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
