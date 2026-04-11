// A018/Packs: Core contracts, infrastructure components, and shared utilities.
// All traits (SystemComponent, ManagedService), DTOs, download helpers,
// platform detection, and foundational runtimes (Python toolchain, PostgreSQL)
// live here. Service packs import from core — core never imports from a pack.

pub mod component;
pub mod constants;
pub mod data;
pub mod download;
pub mod platform;
pub mod postgresql;
pub mod python;
pub mod registry;
pub mod service;
pub mod status;
