//! App-level constants for the Snapfzz Tauri application.

/// Environment variable names injected by factories.
pub mod env_vars {
    pub const DATABASE_URL: &str = "DATABASE_URL";
    pub const STORE_MODEL_IN_DB: &str = "STORE_MODEL_IN_DB";
    pub const LITELLM_MASTER_KEY: &str = "LITELLM_MASTER_KEY";
    pub const LITELLM_SALT_KEY: &str = "LITELLM_SALT_KEY";
    pub const MEMORY_DATABASE_URL: &str = "MEMORY_DATABASE_URL";
    /// Prefix for per-provider API key env vars injected into LiteLLM's child process.
    /// LiteLLM's `litellm_params.api_key` then uses `os.environ/SNAPFZZ_KEY_<provider-id>`
    /// — the raw key never lives in LiteLLM's DB or any /model/info response.
    pub const PROVIDER_KEY_PREFIX: &str = "SNAPFZZ_KEY_";
}

/// Vault key prefixes.
pub mod vault_keys {
    /// Raw provider API keys live here, one per custom provider id.
    /// Format: `llm_provider_key/<provider-id>` → raw key bytes.
    pub const PROVIDER_KEY_PREFIX: &str = "llm_provider_key/";
}

/// Database names created in PostgreSQL.
pub mod databases {
    pub const LITELLM: &str = "litellm";
    pub const LITELLM_SPEND_LOGS_TABLE: &str = "LiteLLM_SpendLogs";
}

/// LiteLLM-specific configuration.
pub mod litellm {
    pub const CACHE_DIR: &str = ".litellm_cache";
    pub const DEFAULT_HOST: &str = "127.0.0.1";
    pub const DEFAULT_PORT: &str = "4000";
}

/// Menu item identifiers.
pub mod menus {
    pub const PREFERENCES: &str = "preferences";
    pub const ABOUT: &str = "about";
}

/// App home directory name and related path constants.
pub mod paths {
    /// The hidden home directory for Snapfzz data (under `$HOME`).
    pub const SNAPFZZ_HOME_DIR: &str = ".snapfzz";
}

/// Process display names used at the app layer.
pub mod processes {
    /// Display name for the embedded PostgreSQL process (not managed by a factory).
    pub const DATABASE: &str = "database";
    /// Process name for the AgentScope runtime.
    pub const AGENT_RUNTIME: &str = "agent-runtime";
    /// Process name for the LiteLLM gateway.
    pub const LLM_GATEWAY: &str = "llm-gateway";
}
