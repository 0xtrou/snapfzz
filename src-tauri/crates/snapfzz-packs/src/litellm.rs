use std::path::PathBuf;

use crate::pip_pack::{make_python_package_component, PipPackComponent};
use crate::platform::PlatformInfo;
use crate::versions;

pub fn make_litellm(runtime_dir: PathBuf, platform: PlatformInfo) -> PipPackComponent {
    make_python_package_component(
        "litellm",
        "LiteLLM Gateway",
        "LiteLLM proxy for unified model gateway and provider routing. Supports 100+ LLM providers with budget tracking and virtual key management.",
        "MIT",
        format!("litellm[proxy]=={}", versions::LITELLM),
        runtime_dir,
        platform,
        "https://github.com/BerriAI/litellm",
        "https://docs.litellm.ai/",
    )
}
