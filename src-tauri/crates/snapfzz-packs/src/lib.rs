pub mod platform;
pub mod uv;
pub mod python;
pub mod agentscope;
pub mod litellm;
pub mod cef;

pub use uv::UvComponent;
pub use python::PythonComponent;
pub use agentscope::AgentScopeComponent;
pub use litellm::LiteLLMComponent;
pub use cef::CefPackComponent;
pub use platform::{detect_platform, PlatformInfo};

/// Hardcoded versions for all packaged components
pub mod versions {
    pub const UV: &str = "0.11.4";
    pub const PYTHON: &str = "3.12.0";
    pub const AGENTSCOPE: &str = "0.4.0";
    pub const AGENTSCOPE_RUNTIME: &str = "0.4.0";
    pub const LITELLM: &str = "1.61.0";
}
