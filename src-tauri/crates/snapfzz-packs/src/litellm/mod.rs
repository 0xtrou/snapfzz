// A018/Packs: LiteLLM service pack — LLM proxy and model router.
// Implements ManagedService for spawning the LiteLLM gateway process.

pub mod service;

pub use service::LiteLLMService;
