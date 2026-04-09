use crate::platform::PlatformInfo;
use crate::runtime::python::PythonRuntime;

pub fn make_agentscope(runtime: PythonRuntime, platform: PlatformInfo) -> AgentScopeRuntime {
    AgentScopeRuntime { runtime, platform }
}

pub fn make_litellm(runtime: PythonRuntime, platform: PlatformInfo) -> LiteLLMRuntime {
    LiteLLMRuntime { runtime, platform }
}

pub struct AgentScopeRuntime {
    #[allow(dead_code)]
    runtime: PythonRuntime,
    #[allow(dead_code)]
    platform: PlatformInfo,
}

pub struct LiteLLMRuntime {
    #[allow(dead_code)]
    runtime: PythonRuntime,
    #[allow(dead_code)]
    platform: PlatformInfo,
}
