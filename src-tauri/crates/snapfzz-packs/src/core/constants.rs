//! Centralized constants for Snapfzz
//!
//! All hardcoded values consolidated here for maintainability.
//! Per A018: Pack metadata, download URLs, and version strings.

use serde::{Deserialize, Serialize};

pub mod versions {
    pub const UV: &str = "0.6.6";
    pub const PYTHON: &str = "3.12";
    pub const AGENTSCOPE: &str = "1.0.18";
    pub const AGENTSCOPE_RUNTIME: &str = "1.1.3";
    pub const LITELLM: &str = "1.83.4";
}

pub mod urls {
    pub const UV_RELEASES_URL: &str = "https://api.github.com/repos/astral-sh/uv/releases/latest";
    pub const UV_DOWNLOAD_BASE: &str = "https://github.com/astral-sh/uv/releases/download";
}

/// Python pack metadata for UI display
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonPackMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    pub license: String,
    pub platform_display: String,
    pub repository_url: String,
    pub website_url: String,
}

impl PythonPackMetadata {
    /// Build a `ComponentInfo` from this metadata + runtime state.
    /// Used by resolve() fast paths to avoid hardcoding strings.
    pub fn to_component_info(
        &self,
        version: String,
        platform: String,
        platform_display: String,
        install_path: String,
        is_installed: bool,
    ) -> crate::core::component::ComponentInfo {
        crate::core::component::ComponentInfo {
            id: self.id.clone(),
            name: self.name.clone(),
            description: self.description.clone(),
            license: self.license.clone(),
            version,
            platform,
            platform_display,
            download_url: String::new(),
            install_path,
            size: 0,
            checksum: String::new(),
            checksum_algorithm: String::new(),
            is_installed,
            repository_url: self.repository_url.clone(),
            website_url: self.website_url.clone(),
        }
    }
}

/// Returns metadata for all Python ecosystem packs
pub fn python_packs() -> Vec<PythonPackMetadata> {
    vec![
        PythonPackMetadata {
            id: "uv".into(),
            name: "uv (Python Package Manager)".into(),
            description: "Fast Python package manager. Required for all Python runtimes.".into(),
            license: "MIT".into(),
            platform_display: "Cross-platform".into(),
            repository_url: "https://github.com/astral-sh/uv".into(),
            website_url: "https://docs.astral.sh/uv/".into(),
        },
        PythonPackMetadata {
            id: "python".into(),
            name: "Python 3.12".into(),
            description:
                "Python runtime managed by uv. Required for AgentScope and Python-based packs."
                    .into(),
            license: "PSF-2.0".into(),
            platform_display: "Cross-platform".into(),
            repository_url: "https://github.com/python/cpython".into(),
            website_url: "https://www.python.org/".into(),
        },
        PythonPackMetadata {
            id: "agentscope".into(),
            name: "AgentScope".into(),
            description: "AI agent framework. Requires Python runtime.".into(),
            license: "Apache-2.0".into(),
            platform_display: "Cross-platform".into(),
            repository_url: "https://github.com/agentscope-ai/agentscope".into(),
            website_url: "https://doc.agentscope.io/".into(),
        },
        PythonPackMetadata {
            id: "agentscope-runtime".into(),
            name: "AgentScope Runtime".into(),
            description: "Multi-agent distributed coordination. Requires Python runtime.".into(),
            license: "Apache-2.0".into(),
            platform_display: "Cross-platform".into(),
            repository_url: "https://github.com/agentscope-ai/agentscope-runtime".into(),
            website_url: "https://runtime.agentscope.io/".into(),
        },
        PythonPackMetadata {
            id: "litellm".into(),
            name: "LiteLLM".into(),
            description: "LLM proxy and model router. Requires Python runtime.".into(),
            license: "MIT".into(),
            platform_display: "Cross-platform".into(),
            repository_url: "https://github.com/BerriAI/litellm".into(),
            website_url: "https://litellm.ai/".into(),
        },
    ]
}

/// Look up a pack's metadata by ID.
pub fn pack_metadata(id: &str) -> Option<PythonPackMetadata> {
    if id == "cef" {
        return Some(cef_metadata());
    }
    python_packs().into_iter().find(|p| p.id == id)
}

/// CEF (Chromium Embedded Framework) metadata
pub fn cef_metadata() -> PythonPackMetadata {
    PythonPackMetadata {
        id: "cef".into(),
        name: "CEF Runtime".into(),
        description: "Chromium Embedded Framework for embedded browser rendering.".into(),
        license: "BSD-3-Clause".into(),
        platform_display: "Cross-platform".into(),
        repository_url: "https://github.com/chromiumembedded/cef".into(),
        website_url: "https://chromiumembedded.github.io/cef/".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn t32_constants_version_strings_are_valid() {
        assert!(versions::UV.starts_with(|c: char| c.is_ascii_digit()));
        assert!(versions::PYTHON.starts_with(|c: char| c.is_ascii_digit()));
        assert!(versions::AGENTSCOPE.starts_with(|c: char| c.is_ascii_digit()));
        assert!(versions::AGENTSCOPE_RUNTIME.starts_with(|c: char| c.is_ascii_digit()));
        assert!(versions::LITELLM.starts_with(|c: char| c.is_ascii_digit()));
    }

    #[test]
    fn t32_constants_urls_are_https() {
        assert!(urls::UV_RELEASES_URL.starts_with("https://"));
        assert!(urls::UV_DOWNLOAD_BASE.starts_with("https://"));
    }

    #[test]
    fn t32_constants_python_packs_returns_five_entries() {
        let packs = python_packs();
        assert_eq!(packs.len(), 5);

        let ids: Vec<&str> = packs.iter().map(|p| p.id.as_str()).collect();
        assert!(ids.contains(&"uv"));
        assert!(ids.contains(&"python"));
        assert!(ids.contains(&"agentscope"));
        assert!(ids.contains(&"agentscope-runtime"));
        assert!(ids.contains(&"litellm"));
    }

    #[test]
    fn t32_constants_python_packs_have_required_fields() {
        for pack in python_packs() {
            assert!(!pack.id.is_empty());
            assert!(!pack.name.is_empty());
            assert!(!pack.description.is_empty());
            assert!(!pack.license.is_empty());
            assert!(!pack.platform_display.is_empty());
            assert!(pack.repository_url.starts_with("https://"));
            assert!(pack.website_url.starts_with("https://"));
        }
    }

    #[test]
    fn t32_constants_cef_metadata_has_expected_fields() {
        let cef = cef_metadata();
        assert_eq!(cef.id, "cef");
        assert_eq!(cef.name, "CEF Runtime");
        assert!(!cef.description.is_empty());
        assert_eq!(cef.license, "BSD-3-Clause");
    }

    #[test]
    fn t32_constants_metadata_serializes_to_camel_case() {
        let pack = python_packs().into_iter().next().unwrap();
        let json = serde_json::to_string(&pack).unwrap();
        assert!(json.contains("\"platformDisplay\""));
        assert!(json.contains("\"repositoryUrl\""));
        assert!(json.contains("\"websiteUrl\""));
    }
}
