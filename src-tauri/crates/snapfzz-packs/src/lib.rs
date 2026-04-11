// A018/Packs: Crate root — vertical domain slices with a shared core interface.
//
// Structure:
//   core/         — traits, DTOs, download helpers, platform detection,
//                   Python toolchain, PostgreSQL infrastructure
//   cef/          — CEF service pack (Chromium Embedded Framework browser runtime)
//   litellm/      — LiteLLM service pack
//   agentscope/   — AgentScope service pack
//
// Adding a new service = create a directory + implement the traits.

pub mod core;
pub mod agentscope;
pub mod cef;
pub mod litellm;

// ── Backward-compatible re-exports ──────────────────────────────────────────
// External crates import from `snapfzz_packs::` paths. All previously public
// symbols are re-exported here so that no downstream code needs to change.

// component.rs
pub use core::component::{
    ComponentError, ComponentInfo, DownloadProgress, DownloadStatus, SystemComponent,
};

// constants.rs
pub use core::constants::{python_packs, PythonPackMetadata};
pub use core::constants::versions;

// download.rs
pub use core::download::{download_file, extract_tar_bz2, extract_tar_gz, verify_sha1};

// platform.rs
pub use core::platform::{detect_platform, PlatformInfo};

// registry.rs
pub use core::registry::ComponentRegistry;

// service.rs
pub use core::service::{
    HealthConfig, ManagedService, ResourceLimits, ServiceConfig, ServiceError,
};

// status.rs
pub use core::status::{InstallStep, PipPackageInfo, PythonRuntimeStatus};

// data.rs
pub use core::data::{DataDir, DataError};

// Python toolchain
pub use core::python::{PythonDownloader, PythonRuntime, UvDownloader};

// Service packs
pub use agentscope::AgentScopeService;
pub use litellm::LiteLLMService;

// ── Backward-compatible module re-exports ───────────────────────────────────
// External crates use deep paths like `snapfzz_packs::runtime::python::PythonRuntime`
// and `snapfzz_packs::data::DataDir`. These shim modules preserve those paths.

pub mod runtime {
    // A018/Packs: Shim module preserving the old `runtime::*` import paths.
    pub mod python {
        pub use crate::core::python::runtime::*;
    }
    pub mod postgres {
        pub use crate::core::postgresql::runtime::*;
    }
    pub mod litellm {
        pub use crate::litellm::service::*;
    }
    pub mod agentscope {
        pub use crate::agentscope::service::*;
    }
}

pub mod data {
    // A018/Packs: Shim module preserving the old `data::*` import path.
    pub use crate::core::data::*;
}

pub mod service {
    // A018/Packs: Shim module preserving the old `service::*` import path.
    pub use crate::core::service::*;
}

pub mod constants {
    // A018/Packs: Shim module preserving the old `constants::*` import path.
    pub use crate::core::constants::*;
}

pub mod downloaders {
    // A018/Packs: Shim module preserving the old `downloaders::*` import path.
    pub use crate::core::python::downloader::PythonDownloader;
    pub use crate::core::python::uv::UvDownloader;
}
