use std::any::Any;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use crate::boot::PreflightSettings;
use crate::budget::device::DeviceInfo;
use crate::budget::BudgetRegistry;

#[derive(Clone)]
pub struct PreflightContext {
    pub data_dir: PathBuf,
    device: Option<DeviceInfo>,
    settings: Option<PreflightSettings>,
    registry: Option<Arc<BudgetRegistry>>,
    extensions: HashMap<&'static str, Arc<dyn Any + Send + Sync>>,
}

impl PreflightContext {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            device: None,
            settings: None,
            registry: None,
            extensions: HashMap::new(),
        }
    }

    pub fn device(&self) -> &DeviceInfo {
        self.device
            .as_ref()
            .expect("[preflight] device accessed before Phase 4")
    }

    pub fn settings(&self) -> &PreflightSettings {
        self.settings
            .as_ref()
            .expect("[preflight] settings accessed before Phase 3")
    }

    pub fn registry(&self) -> &Arc<BudgetRegistry> {
        self.registry
            .as_ref()
            .expect("[preflight] registry accessed before Phase 4")
    }

    pub fn set_device(&mut self, device: DeviceInfo) {
        self.device = Some(device);
    }

    pub fn set_settings(&mut self, settings: PreflightSettings) {
        self.settings = Some(settings);
    }

    pub fn set_registry(&mut self, registry: Arc<BudgetRegistry>) {
        self.registry = Some(registry);
    }

    pub fn set_extension<T: Any + Send + Sync>(&mut self, key: &'static str, value: T) {
        self.extensions.insert(key, Arc::new(value));
    }

    pub fn get_extension<T: Any + Send + Sync>(&self, key: &'static str) -> Option<&T> {
        self.extensions.get(key).and_then(|v| v.downcast_ref::<T>())
    }
}

#[cfg(test)]
mod tests {
    use super::PreflightContext;

    #[test]
    fn a012_context_extension_round_trip_and_type_mismatch() {
        let mut ctx = PreflightContext::new(std::path::PathBuf::from("/tmp/snapfzz"));

        ctx.set_extension("answer", 42_u32);

        assert_eq!(ctx.get_extension::<u32>("answer"), Some(&42));
        assert!(ctx.get_extension::<String>("answer").is_none());
        assert!(ctx.get_extension::<u32>("missing").is_none());
    }

    #[test]
    fn a012_context_device_round_trip() {
        let mut ctx = PreflightContext::new(std::path::PathBuf::from("/tmp/snapfzz"));
        let device = crate::budget::device::DeviceInfo {
            os: "macos".to_string(),
            arch: "aarch64".to_string(),
            platform: "macos-arm64".to_string(),
            platform_display: "macOS (Apple Silicon)".to_string(),
            cores: 8,
            ram_gb: 16,
            on_battery: false,
        };

        ctx.set_device(device.clone());

        assert_eq!(ctx.device().platform, "macos-arm64");
        assert_eq!(ctx.device().platform_display, "macOS (Apple Silicon)");
        assert_eq!(ctx.device().cores, device.cores);
        assert_eq!(ctx.device().ram_gb, device.ram_gb);
        assert_eq!(ctx.device().on_battery, device.on_battery);
    }

    #[test]
    fn a012_context_settings_round_trip() {
        use crate::boot::PreflightSettings;

        let mut ctx = PreflightContext::new(std::path::PathBuf::from("/tmp/snapfzz"));
        let settings = PreflightSettings::default();

        ctx.set_settings(settings.clone());
        // settings() should return the stored value without panicking.
        assert_eq!(ctx.settings().api_key, settings.api_key);
        assert_eq!(ctx.settings().model, settings.model);
    }

    #[test]
    fn a012_context_registry_round_trip() {
        use std::sync::Arc;
        use crate::budget::{BudgetRegistry, preset::PresetName};

        let mut ctx = PreflightContext::new(std::path::PathBuf::from("/tmp/snapfzz"));
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Battery));

        ctx.set_registry(registry.clone());
        let returned = ctx.registry();
        assert_eq!(returned.batch_interval(), 33);
    }

    #[test]
    fn a012_context_clone_preserves_data_dir() {
        let ctx = PreflightContext::new(std::path::PathBuf::from("/tmp/snapfzz-clone"));
        let cloned = ctx.clone();
        assert_eq!(cloned.data_dir, std::path::PathBuf::from("/tmp/snapfzz-clone"));
    }

    #[test]
    fn a012_context_new_data_dir_is_stored() {
        let ctx = PreflightContext::new(std::path::PathBuf::from("/home/user/.snapfzz"));
        assert_eq!(ctx.data_dir, std::path::PathBuf::from("/home/user/.snapfzz"));
    }
}
