// A014/KernelArchitecture: snapfzz-kernel merges boot, budget, process, settings, and shared types.
// main.rs is the orchestrator — it routes, gates, and emits. This crate does the work.

pub mod boot;
pub mod budget {
    pub use snapfzz_budget::BudgetRegistry;

    pub mod controlled {
        pub use snapfzz_budget::controlled::{ControlledBudgets, CpuPermit, InvokePermit};
    }

    pub mod detect {
        pub use snapfzz_budget::preset::HardwareInfo;
        pub use snapfzz_budget::preset::{detect_hardware, select_preset};
    }

    pub mod metrics {
        pub use snapfzz_budget::metrics::{
            BudgetMetrics, BudgetViolation, ProcessSnapshot, ProcessStatus,
        };
    }

    pub mod preset {
        pub use snapfzz_budget::preset::{build_preset, Preset, PresetName};
    }

    pub mod supervised {
        pub use snapfzz_budget::supervised::{
            ProcessBudget, ProcessLocation, StorageState, SupervisedBudgets,
        };
    }
}
pub mod process;
pub mod settings;
pub mod types;
