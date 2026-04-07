use crate::boot::context::PreflightContext;
use crate::boot::PreflightError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Phase {
    Filesystem = 1,
    Vault = 2,
    Settings = 3,
    Budget = 4,
}

pub trait OnPreflightInit: Send + Sync {
    fn on_preflight_init(&self, ctx: &mut PreflightContext) -> Result<(), PreflightError>;
}

pub trait OnPreflightReady: Send + Sync {
    fn on_preflight_ready(&self, ctx: &PreflightContext) -> Result<(), PreflightError>;
}
