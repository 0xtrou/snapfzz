// A037/factories: Process factory implementations for managed services

mod agentscope;
mod litellm;
pub mod plugin_runtime;

pub use agentscope::AgentScopeFactory;
pub use litellm::LiteLLMFactory;