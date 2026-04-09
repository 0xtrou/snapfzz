use std::path::PathBuf;

use crate::pip_pack::{make_python_package_component, PipPackComponent};
use crate::platform::PlatformInfo;
use crate::versions;

pub fn make_agentscope(runtime_dir: PathBuf, platform: PlatformInfo) -> PipPackComponent {
    make_python_package_component(
        "agentscope",
        "AgentScope",
        "AI agent framework. Requires Python runtime.",
        "Apache-2.0",
        format!("agentscope=={}", versions::AGENTSCOPE),
        runtime_dir,
        platform,
        "https://github.com/agentscope-ai/agentscope",
        "https://doc.agentscope.io/",
    )
}
