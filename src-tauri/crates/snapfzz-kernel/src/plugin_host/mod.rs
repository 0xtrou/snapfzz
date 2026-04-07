// A005/PluginArchitecture: Rust-side plugin lifecycle manager.
// Beta scope — activation events, crash isolation, 3-strike auto-disable.
// Alpha: frontend @snapfzz/plugin-host handles discovery + loading.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PluginStatus {
    Inactive,
    Activating,
    Active,
    Crashed,
    Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub status: PluginStatus,
    pub crash_count: u32,
    pub host_surface: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ActivationEvent {
    OnStartupFinished,
    OnViewVisible,
    OnCommand,
    OnLanguage,
}

pub const MAX_CRASH_STRIKES: u32 = 3;
