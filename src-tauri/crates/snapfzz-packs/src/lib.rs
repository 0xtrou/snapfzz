pub mod pip_pack;
pub mod platform;
pub mod uv;
pub mod python;
pub mod agentscope;
pub mod litellm;
pub mod cef;

pub use uv::UvComponent;
pub use python::PythonComponent;
pub use agentscope::make_agentscope;
pub use litellm::make_litellm;
pub use cef::CefPackComponent;
pub use pip_pack::{PipPackComponent, PythonRuntime, PythonRuntimeStatus};
pub use platform::{detect_platform, PlatformInfo};

/// Hardcoded versions for all packaged components.
/// Authoritative source — synced with pip installation commands.
pub mod versions {
    pub const UV: &str = "0.11.4";
    pub const PYTHON: &str = "3.12";
    pub const AGENTSCOPE: &str = "1.0.18";
    pub const AGENTSCOPE_RUNTIME: &str = "1.1.3";
    pub const LITELLM: &str = "1.83.4";
}
