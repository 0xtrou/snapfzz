//! Centralized constants for snapfzz-kernel.

/// Process names used in the registry and lifecycle management.
pub mod process {
    pub const AGENT_RUNTIME: &str = "agent-runtime";
    pub const LLM_GATEWAY: &str = "llm-gateway";
    pub const DATABASE: &str = "database";
    // Used in cleanup_all_orphan_processes
    pub const MANAGED_PROCESSES: &[&str] = &["orchestrator", "litellm", "postgres"];
}

/// Settings keys for host/port configuration.
pub mod settings {
    pub const AGENTSCOPE_HOST: &str = "agentscopeHost";
    pub const AGENTSCOPE_PORT: &str = "agentscopePort";
    pub const LITELLM_HOST: &str = "litellmHost";
    pub const LITELLM_PORT: &str = "litellmPort";
}

/// Default values for settings.
pub mod defaults {
    pub const HOST: &str = "127.0.0.1";
    pub const BIND_HOST: &str = "0.0.0.0";
    pub const AGENTSCOPE_PORT: u16 = 8090;
    pub const LITELLM_PORT: &str = "4000";
    pub const MODEL: &str = "gpt-4o";
    pub const API_URL: &str = "https://api.openai.com/v1";
    pub const THEME: &str = "system";
    pub const FONT_FAMILY: &str = "Inter";
    pub const FONT_SIZE: &str = "13";
    pub const LANGUAGE: &str = "en";
    pub const LOG_LEVEL: &str = "info";
    pub const PRESET: &str = "auto";
}

/// Health check constants.
pub mod health {
    pub const DEFAULT_PATH: &str = "/health";
}

/// File/directory naming conventions.
pub mod paths {
    pub const SNAPFZZ_HOME: &str = ".snapfzz";
    pub const RUNTIME_DIR: &str = "runtime";
    pub const ORCHESTRATOR_DIR: &str = "orchestrator";
    pub const LOG_SUFFIX: &str = ".log";
    pub const ERROR_LOG_SUFFIX: &str = "_error.log";
    pub const PID_SUFFIX: &str = ".pid";
    pub const SETTINGS_FILE: &str = "settings.json";
    pub const FONTS_DIR: &str = "fonts";
    pub const USAGE_DIR: &str = "usage";
}

/// Event names emitted via Tauri.
pub mod events {
    pub const BOOT_COMPLETE: &str = "boot-complete";
    pub const SETTINGS_CHANGED: &str = "settings-changed";
    pub const SUPERVISOR_EVENT: &str = "supervisor-event";
}

/// Process status serialization values.
pub mod status {
    pub const STARTING: &str = "starting";
    pub const ONLINE: &str = "online";
    pub const UNHEALTHY: &str = "unhealthy";
    pub const RESTARTING: &str = "restarting";
    pub const STOPPED: &str = "stopped";
    pub const LOCATION_LOCAL: &str = "local";
}

/// Process owner identifiers.
pub mod owner {
    pub const SYSTEM: &str = "system";
}

/// Log formatting.
pub mod logging {
    pub const STDERR_PREFIX: &str = "[stderr]";
}
