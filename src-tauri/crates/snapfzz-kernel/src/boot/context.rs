use std::any::Any;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use crate::boot::PreflightSettings;
use crate::budget::BudgetRegistry;

#[derive(Clone)]
pub struct PreflightContext {
    pub data_dir: PathBuf,
    settings: Option<PreflightSettings>,
    registry: Option<Arc<BudgetRegistry>>,
    extensions: HashMap<&'static str, Arc<dyn Any + Send + Sync>>,
}

impl PreflightContext {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            settings: None,
            registry: None,
            extensions: HashMap::new(),
        }
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
}
