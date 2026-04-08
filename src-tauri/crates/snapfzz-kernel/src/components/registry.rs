use std::collections::HashMap;
use std::sync::Arc;

use super::component::SystemComponent;

pub struct ComponentRegistry {
    components: HashMap<String, Arc<dyn SystemComponent>>,
}

impl ComponentRegistry {
    pub fn new() -> Self {
        Self {
            components: HashMap::new(),
        }
    }

    pub fn register(&mut self, component: Arc<dyn SystemComponent>) {
        self.components
            .insert(component.id().to_string(), component);
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn SystemComponent>> {
        self.components.get(id).cloned()
    }

    pub fn list(&self) -> Vec<Arc<dyn SystemComponent>> {
        self.components.values().cloned().collect()
    }

    pub fn ids(&self) -> Vec<String> {
        self.components.keys().cloned().collect()
    }

    pub fn len(&self) -> usize {
        self.components.len()
    }

    pub fn is_empty(&self) -> bool {
        self.components.is_empty()
    }
}

impl Default for ComponentRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::components::component::{
        ComponentError, ComponentInfo, DownloadProgress, DownloadStatus,
    };
    use std::path::{Path, PathBuf};

    struct MockComponent {
        component_id: String,
        dir: PathBuf,
    }

    impl MockComponent {
        fn new(id: &str) -> Self {
            Self {
                component_id: id.to_string(),
                dir: PathBuf::from(format!("/tmp/snapfzz/components/{id}")),
            }
        }
    }

    #[async_trait::async_trait]
    impl SystemComponent for MockComponent {
        fn id(&self) -> &str {
            &self.component_id
        }
        fn name(&self) -> &str {
            "Mock Component"
        }
        fn install_dir(&self) -> &Path {
            &self.dir
        }
        fn is_installed(&self) -> bool {
            false
        }
        async fn resolve(&self) -> Result<ComponentInfo, ComponentError> {
            Ok(ComponentInfo {
                id: self.component_id.clone(),
                name: "Mock Component".into(),
                description: "A mock component for testing".into(),
                license: "MIT".into(),
                version: "1.0.0".into(),
                platform: "test".into(),
                platform_display: "Test Platform".into(),
                download_url: "https://example.com/mock.tar".into(),
                install_path: self.dir.to_string_lossy().into(),
                size: 1000,
                checksum: "abc".into(),
                checksum_algorithm: "sha1".into(),
                is_installed: false,
            })
        }
        async fn download(&self) -> Result<Vec<DownloadProgress>, ComponentError> {
            Ok(vec![DownloadProgress {
                component_id: self.component_id.clone(),
                bytes_downloaded: 1000,
                bytes_total: 1000,
                percent: 100.0,
                status: DownloadStatus::Ready,
            }])
        }
        fn cancel(&self) {}
        fn clear_cancel(&self) {}
        async fn verify(&self) -> Result<String, ComponentError> {
            Ok("mock-hash".into())
        }
        async fn extract(&self) -> Result<(), ComponentError> {
            Ok(())
        }
    }

    #[test]
    fn a014_components_registry_starts_empty() {
        let registry = ComponentRegistry::new();
        assert!(registry.is_empty());
        assert_eq!(registry.len(), 0);
    }

    #[test]
    fn a014_components_registry_registers_and_retrieves() {
        let mut registry = ComponentRegistry::new();
        registry.register(Arc::new(MockComponent::new("cef")));
        assert_eq!(registry.len(), 1);
        assert!(!registry.is_empty());
        let component = registry.get("cef").unwrap();
        assert_eq!(component.id(), "cef");
    }

    #[test]
    fn a014_components_registry_get_returns_none_for_unknown() {
        let registry = ComponentRegistry::new();
        assert!(registry.get("nonexistent").is_none());
    }

    #[test]
    fn a014_components_registry_list_returns_all() {
        let mut registry = ComponentRegistry::new();
        registry.register(Arc::new(MockComponent::new("cef")));
        registry.register(Arc::new(MockComponent::new("llama")));
        let list = registry.list();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn a014_components_registry_ids_returns_all_ids() {
        let mut registry = ComponentRegistry::new();
        registry.register(Arc::new(MockComponent::new("cef")));
        registry.register(Arc::new(MockComponent::new("llama")));
        let mut ids = registry.ids();
        ids.sort();
        assert_eq!(ids, vec!["cef", "llama"]);
    }

    #[test]
    fn a014_components_registry_default_is_empty() {
        let registry = ComponentRegistry::default();
        assert!(registry.is_empty());
    }

    #[tokio::test]
    async fn a014_components_registry_resolve_returns_info() {
        let mut registry = ComponentRegistry::new();
        registry.register(Arc::new(MockComponent::new("cef")));
        let component = registry.get("cef").unwrap();
        let info = component.resolve().await.unwrap();
        assert_eq!(info.id, "cef");
        assert_eq!(info.name, "Mock Component");
    }

    #[tokio::test]
    async fn a014_components_registry_download_returns_progress() {
        let mut registry = ComponentRegistry::new();
        registry.register(Arc::new(MockComponent::new("cef")));
        let component = registry.get("cef").unwrap();
        let events = component.download().await.unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].status, DownloadStatus::Ready);
    }
}
