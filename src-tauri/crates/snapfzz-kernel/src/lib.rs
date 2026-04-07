// A014/KernelArchitecture: snapfzz-kernel merges boot, budget, process, settings, and shared types.
// main.rs is the orchestrator — it routes, gates, and emits. This crate does the work.

pub mod boot;
pub mod budget;
pub mod process;
pub mod settings;
pub mod types;
