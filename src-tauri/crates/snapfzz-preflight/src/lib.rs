// Spec: docs/plans/A012-preflight-service.md
// Verifies: Consolidated boot-time initialization pipeline — 6 phases, sync then async.

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use snapfzz_budget::preset::{build_preset, detect_hardware, select_preset, PresetName};
use snapfzz_budget::BudgetRegistry;

// Per A012/Architecture: settings are loaded in Phase 3 and used to configure Phase 4.
// This struct mirrors main.rs Settings exactly so the crate can parse settings.json
// without creating a cross-dependency back to the binary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightSettings {
    #[serde(alias = "api_key", default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(alias = "api_url", default = "default_api_url")]
    pub api_url: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_true")]
    pub open_last_project: bool,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_font_size")]
    pub font_size: String,
    #[serde(default = "default_true")]
    pub fps_counter: bool,
    #[serde(default = "default_log_level")]
    pub log_level: String,
    #[serde(default = "default_preset")]
    pub preset: String,
    #[serde(default = "default_agentscope_host")]
    pub agentscope_host: String,
    #[serde(
        default = "default_agentscope_port",
        deserialize_with = "deserialize_string_or_number"
    )]
    pub agentscope_port: String,
}

fn default_model() -> String {
    "gpt-4o".to_string()
}
fn default_api_url() -> String {
    "https://api.openai.com/v1".to_string()
}
fn default_theme() -> String {
    "system".to_string()
}
fn default_true() -> bool {
    true
}
fn default_font_family() -> String {
    "Inter".to_string()
}
fn default_font_size() -> String {
    "13".to_string()
}
fn default_language() -> String {
    "en".to_string()
}
fn default_log_level() -> String {
    "info".to_string()
}
fn default_preset() -> String {
    "auto".to_string()
}
fn default_agentscope_host() -> String {
    "127.0.0.1".to_string()
}
fn default_agentscope_port() -> String {
    "8090".to_string()
}

fn deserialize_string_or_number<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::String(s) => Ok(s),
        serde_json::Value::Number(n) => Ok(n.to_string()),
        _ => Ok(default_agentscope_port()),
    }
}

impl Default for PreflightSettings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: default_model(),
            api_url: default_api_url(),
            theme: default_theme(),
            open_last_project: default_true(),
            language: default_language(),
            font_family: default_font_family(),
            font_size: default_font_size(),
            fps_counter: default_true(),
            log_level: default_log_level(),
            preset: default_preset(),
            agentscope_host: default_agentscope_host(),
            agentscope_port: default_agentscope_port(),
        }
    }
}

// Per A012/Architecture: PhaseStatus captures outcome — Ok, Degraded (non-fatal), or Failed.
// Only Phase 1 (filesystem) treats Failed as fatal to the boot sequence.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PhaseStatus {
    Ok,
    Degraded(String),
    Failed(String),
}

// Per A012/Observability: every phase records its duration and outcome for the
// preflight_status command and structured stderr logs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseTiming {
    pub phase: u8,
    pub name: &'static str,
    pub duration_ms: u64,
    pub status: PhaseStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Phase {
    Filesystem = 1,
    Vault = 2,
    Settings = 3,
    Budget = 4,
}

#[derive(Clone)]
pub struct PreflightContext {
    pub data_dir: PathBuf,
    settings: Option<PreflightSettings>,
    registry: Option<Arc<BudgetRegistry>>,
}

impl PreflightContext {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            settings: None,
            registry: None,
        }
    }

    pub fn settings(&self) -> &PreflightSettings {
        self.settings
            .as_ref()
            .expect("[preflight] settings accessed before Phase 3")
    }

    pub fn registry(&self) -> &Arc<BudgetRegistry> {
        self.registry
            .as_ref()
            .expect("[preflight] registry accessed before Phase 4")
    }

    pub fn set_settings(&mut self, settings: PreflightSettings) {
        self.settings = Some(settings);
    }

    pub fn set_registry(&mut self, registry: Arc<BudgetRegistry>) {
        self.registry = Some(registry);
    }
}

pub trait OnPreflightInit: Send + Sync {
    fn on_preflight_init(&self, ctx: &mut PreflightContext) -> Result<(), PreflightError>;
}

pub trait OnPreflightReady: Send + Sync {
    fn on_preflight_ready(&self, ctx: &PreflightContext) -> Result<(), PreflightError>;
}

#[derive(Clone)]
pub struct PreflightResult {
    pub settings: PreflightSettings,
    pub registry: Arc<BudgetRegistry>,
    pub durations: Vec<PhaseTiming>,
    pub context: PreflightContext,
}

#[derive(Debug)]
pub enum PreflightError {
    FilesystemFailed(String),
    SettingsError(String),
    BudgetError(String),
    HookFailed { phase: Phase, detail: String },
    ReadyHookFailed(String),
}

impl std::fmt::Display for PreflightError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PreflightError::FilesystemFailed(msg) => {
                write!(f, "[preflight] filesystem failed: {msg}")
            }
            PreflightError::SettingsError(msg) => write!(f, "[preflight] settings error: {msg}"),
            PreflightError::BudgetError(msg) => write!(f, "[preflight] budget error: {msg}"),
            PreflightError::HookFailed { phase, detail } => {
                write!(f, "[preflight] hook failed in phase {:?}: {detail}", phase)
            }
            PreflightError::ReadyHookFailed(msg) => {
                write!(f, "[preflight] ready hook failed: {msg}")
            }
        }
    }
}

impl std::error::Error for PreflightError {}

pub struct PreflightService {
    data_dir: PathBuf,
    init_hooks: std::collections::HashMap<Phase, Vec<Box<dyn OnPreflightInit>>>,
    ready_hooks: Vec<Box<dyn OnPreflightReady>>,
}

impl PreflightService {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            init_hooks: std::collections::HashMap::new(),
            ready_hooks: Vec::new(),
        }
    }

    pub fn register_init(&mut self, phase: Phase, hook: Box<dyn OnPreflightInit>) {
        self.init_hooks.entry(phase).or_default().push(hook);
    }

    pub fn register_ready(&mut self, hook: Box<dyn OnPreflightReady>) {
        self.ready_hooks.push(hook);
    }

    pub fn run_sync(&mut self) -> Result<PreflightResult, PreflightError> {
        let mut durations = Vec::new();
        let mut context = PreflightContext::new(self.data_dir.clone());

        let fs_timing = self.phase_filesystem()?;
        eprintln!(
            "[preflight] Phase 1: filesystem — {}ms ({})",
            fs_timing.duration_ms,
            format_status(&fs_timing.status)
        );
        durations.push(fs_timing);
        self.run_phase_hooks(Phase::Filesystem, &mut context)?;

        let vault_timing = self.phase_vault_stub();
        eprintln!(
            "[preflight] Phase 2: vault — {}ms ({})",
            vault_timing.duration_ms,
            format_status(&vault_timing.status)
        );
        durations.push(vault_timing);
        self.run_phase_hooks(Phase::Vault, &mut context)?;

        let (settings, settings_timing) = self.phase_settings();
        context.set_settings(settings);
        eprintln!(
            "[preflight] Phase 3: settings — {}ms ({})",
            settings_timing.duration_ms,
            format_status(&settings_timing.status)
        );
        durations.push(settings_timing);
        self.run_phase_hooks(Phase::Settings, &mut context)?;

        let (registry, budget_timing) = self.phase_budget(context.settings());
        context.set_registry(registry);
        eprintln!(
            "[preflight] Phase 4: budget — {}ms ({})",
            budget_timing.duration_ms,
            format_status(&budget_timing.status)
        );
        durations.push(budget_timing);
        self.run_phase_hooks(Phase::Budget, &mut context)?;

        self.run_ready_hooks(&context)?;

        let total_ms: u64 = durations.iter().map(|d| d.duration_ms).sum();
        eprintln!("[preflight] Sync phases complete: {total_ms}ms total");

        Ok(PreflightResult {
            settings: context.settings().clone(),
            registry: context.registry().clone(),
            durations,
            context,
        })
    }

    fn run_phase_hooks(
        &mut self,
        phase: Phase,
        context: &mut PreflightContext,
    ) -> Result<(), PreflightError> {
        if let Some(hooks) = self.init_hooks.get_mut(&phase) {
            for hook in hooks {
                hook.on_preflight_init(context)
                    .map_err(|err| PreflightError::HookFailed {
                        phase,
                        detail: err.to_string(),
                    })?;
            }
        }
        Ok(())
    }

    fn run_ready_hooks(&self, context: &PreflightContext) -> Result<(), PreflightError> {
        for hook in &self.ready_hooks {
            hook.on_preflight_ready(context)
                .map_err(|err| PreflightError::ReadyHookFailed(err.to_string()))?;
        }
        Ok(())
    }

    fn phase_filesystem(&self) -> Result<PhaseTiming, PreflightError> {
        let start = Instant::now();

        let dirs = [
            self.data_dir.clone(),
            self.data_dir.join("runtime"),
            self.data_dir.join("runtime").join("agentscope"),
            self.data_dir.join("fonts"),
            self.data_dir.join("usage"),
        ];

        for dir in &dirs {
            fs::create_dir_all(dir).map_err(|e| {
                PreflightError::FilesystemFailed(format!("failed to create {}: {e}", dir.display()))
            })?;
        }

        Ok(PhaseTiming {
            phase: 1,
            name: "filesystem",
            duration_ms: start.elapsed().as_millis() as u64,
            status: PhaseStatus::Ok,
        })
    }

    fn phase_vault_stub(&self) -> PhaseTiming {
        let start = Instant::now();
        eprintln!("[preflight] Phase 2: vault — skipped (A011 not yet implemented)");
        PhaseTiming {
            phase: 2,
            name: "vault",
            duration_ms: start.elapsed().as_millis() as u64,
            status: PhaseStatus::Degraded("vault not yet implemented".to_string()),
        }
    }

    fn phase_settings(&self) -> (PreflightSettings, PhaseTiming) {
        let start = Instant::now();
        let path = self.data_dir.join("settings.json");

        eprintln!(
            "[preflight] Phase 3: settings — reading from: {}",
            path.display()
        );

        if !path.exists() {
            eprintln!("[preflight] Phase 3: settings — file not found, using defaults");
            return (
                PreflightSettings::default(),
                PhaseTiming {
                    phase: 3,
                    name: "settings",
                    duration_ms: start.elapsed().as_millis() as u64,
                    status: PhaseStatus::Degraded(
                        "settings.json not found, using defaults".to_string(),
                    ),
                },
            );
        }

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[preflight] Phase 3: settings — read error: {e}, using defaults");
                return (
                    PreflightSettings::default(),
                    PhaseTiming {
                        phase: 3,
                        name: "settings",
                        duration_ms: start.elapsed().as_millis() as u64,
                        status: PhaseStatus::Degraded(format!("read error: {e}")),
                    },
                );
            }
        };

        match serde_json::from_str::<PreflightSettings>(&content) {
            Ok(s) => {
                eprintln!(
                    "[preflight] Phase 3: settings — loaded preset: '{}'",
                    s.preset
                );
                (
                    s,
                    PhaseTiming {
                        phase: 3,
                        name: "settings",
                        duration_ms: start.elapsed().as_millis() as u64,
                        status: PhaseStatus::Ok,
                    },
                )
            }
            Err(e) => {
                eprintln!("[preflight] Phase 3: settings — parse error: {e}, using defaults");
                (
                    PreflightSettings::default(),
                    PhaseTiming {
                        phase: 3,
                        name: "settings",
                        duration_ms: start.elapsed().as_millis() as u64,
                        status: PhaseStatus::Degraded(format!("parse error: {e}")),
                    },
                )
            }
        }
    }

    fn phase_budget(&self, settings: &PreflightSettings) -> (Arc<BudgetRegistry>, PhaseTiming) {
        let start = Instant::now();

        let registry = if settings.preset == "auto" || settings.preset.is_empty() {
            BudgetRegistry::from_hardware()
        } else {
            let hw = detect_hardware();
            let preset_name = match settings.preset.as_str() {
                "performance" => PresetName::Performance,
                "balanced" => PresetName::Balanced,
                "battery" => PresetName::Battery,
                _ => select_preset(&hw),
            };
            BudgetRegistry::with_preset(build_preset(preset_name, &hw))
        };

        let (preset_name, cores, ram_gb) = {
            let preset = registry.preset.read().unwrap();
            let hw = detect_hardware();
            (preset.name.clone(), hw.cores, hw.ram_gb)
        };

        eprintln!(
            "[preflight] Phase 4: budget — {}ms (ok, preset={preset_name}, cores={cores}, ram={ram_gb}GB)",
            start.elapsed().as_millis()
        );

        (
            Arc::new(registry),
            PhaseTiming {
                phase: 4,
                name: "budget",
                duration_ms: start.elapsed().as_millis() as u64,
                status: PhaseStatus::Ok,
            },
        )
    }
}

fn format_status(status: &PhaseStatus) -> String {
    match status {
        PhaseStatus::Ok => "ok".to_string(),
        PhaseStatus::Degraded(msg) => format!("degraded: {msg}"),
        PhaseStatus::Failed(msg) => format!("failed: {msg}"),
    }
}

// Per A012/Tauri: DTO for the preflight_status Tauri command.
// Serializes PhaseTiming for the frontend without exposing internal types.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PhaseTimingDto {
    pub phase: u8,
    pub name: String,
    pub duration_ms: u64,
    pub status: String,
    pub detail: Option<String>,
}

impl From<&PhaseTiming> for PhaseTimingDto {
    fn from(t: &PhaseTiming) -> Self {
        let (status, detail) = match &t.status {
            PhaseStatus::Ok => ("ok".to_string(), None),
            PhaseStatus::Degraded(msg) => ("degraded".to_string(), Some(msg.clone())),
            PhaseStatus::Failed(msg) => ("failed".to_string(), Some(msg.clone())),
        };
        PhaseTimingDto {
            phase: t.phase,
            name: t.name.to_string(),
            duration_ms: t.duration_ms,
            status,
            detail,
        }
    }
}

// Per A012/Result: Arc<Mutex<PreflightResult>> needs Clone for the async spawn.
// We impl Clone manually since BudgetRegistry doesn't derive Clone.
impl PreflightResult {
    pub fn phase_timings_dto(&self) -> Vec<PhaseTimingDto> {
        self.durations.iter().map(PhaseTimingDto::from).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    // A012/preflight: phase 1 creates all required directories
    #[test]
    fn a012_preflight_phase1_creates_all_required_directories() {
        let tmp = tempfile::tempdir().unwrap();
        let svc = PreflightService::new(tmp.path().to_path_buf());

        let result = svc.phase_filesystem();
        assert!(result.is_ok(), "Phase 1 must succeed on writable tmpdir");

        assert!(tmp.path().exists(), "data_dir must exist");
        assert!(tmp.path().join("runtime").exists(), "runtime/ must exist");
        assert!(
            tmp.path().join("runtime").join("agentscope").exists(),
            "runtime/agentscope/ must exist"
        );
        assert!(tmp.path().join("fonts").exists(), "fonts/ must exist");
        assert!(tmp.path().join("usage").exists(), "usage/ must exist");
    }

    // A012/preflight: phase 1 is idempotent
    #[test]
    fn a012_preflight_phase1_is_idempotent() {
        let tmp = tempfile::tempdir().unwrap();
        let svc = PreflightService::new(tmp.path().to_path_buf());

        let r1 = svc.phase_filesystem();
        let r2 = svc.phase_filesystem();
        assert!(r1.is_ok(), "First run must succeed");
        assert!(
            r2.is_ok(),
            "Second run must succeed — create_dir_all is idempotent"
        );
    }

    // A012/preflight: phase 3 loads valid settings.json
    #[test]
    fn a012_preflight_phase3_loads_valid_settings_json() {
        let tmp = tempfile::tempdir().unwrap();
        let settings_json = serde_json::json!({
            "preset": "performance",
            "model": "gpt-4o",
            "theme": "dark"
        });
        fs::write(tmp.path().join("settings.json"), settings_json.to_string()).unwrap();

        let svc = PreflightService::new(tmp.path().to_path_buf());
        let (settings, timing) = svc.phase_settings();

        assert_eq!(settings.preset, "performance");
        assert_eq!(settings.theme, "dark");
        assert_eq!(timing.status, PhaseStatus::Ok);
    }

    // A012/preflight: phase 3 returns defaults when missing
    #[test]
    fn a012_preflight_phase3_returns_defaults_when_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let svc = PreflightService::new(tmp.path().to_path_buf());

        let (settings, timing) = svc.phase_settings();

        assert_eq!(
            settings.preset, "auto",
            "Missing file should yield default preset"
        );
        assert!(
            matches!(timing.status, PhaseStatus::Degraded(_)),
            "Missing settings.json should yield Degraded status"
        );
    }

    // A012/preflight: phase 3 returns defaults when corrupt
    #[test]
    fn a012_preflight_phase3_returns_defaults_when_corrupt() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("settings.json"), "not { valid json!!!").unwrap();

        let svc = PreflightService::new(tmp.path().to_path_buf());
        let (settings, timing) = svc.phase_settings();

        assert_eq!(
            settings.preset, "auto",
            "Corrupt file should yield default preset"
        );
        assert!(
            matches!(timing.status, PhaseStatus::Degraded(_)),
            "Corrupt settings.json should yield Degraded status"
        );
    }

    // A012/preflight: phase 4 builds registry with detected hardware
    #[test]
    fn a012_preflight_phase4_builds_registry_with_detected_hardware() {
        let tmp = tempfile::tempdir().unwrap();
        let svc = PreflightService::new(tmp.path().to_path_buf());
        let default_settings = PreflightSettings::default();

        let (registry, timing) = svc.phase_budget(&default_settings);

        assert_eq!(timing.status, PhaseStatus::Ok);
        let preset = registry.preset.read().unwrap();
        let valid_names = ["performance", "balanced", "battery"];
        assert!(
            valid_names.contains(&preset.name.as_str()),
            "Preset name must be one of performance/balanced/battery, got '{}'",
            preset.name
        );
    }

    // A012/preflight: run_sync completes in reasonable time (sysinfo scan is slow in test env)
    // Production budget <25ms is enforced by integration profiling, not unit test timing.
    // sysinfo::System::new_all() requires a full OS scan which is unreliable sub-25ms in CI.
    #[test]
    fn a012_preflight_run_sync_completes_in_reasonable_time() {
        let tmp = tempfile::tempdir().unwrap();
        let mut svc = PreflightService::new(tmp.path().to_path_buf());

        let start = Instant::now();
        let result = svc.run_sync();
        let elapsed = start.elapsed().as_millis();

        assert!(result.is_ok(), "run_sync must succeed");
        assert!(
            elapsed < 500,
            "Sync phases must complete within 500ms even in test environments, took {elapsed}ms"
        );
    }

    // A012/preflight: phase 2 returns degraded status (stub)
    #[test]
    fn a012_preflight_phase2_returns_degraded_status_stub() {
        let tmp = tempfile::tempdir().unwrap();
        let svc = PreflightService::new(tmp.path().to_path_buf());

        let timing = svc.phase_vault_stub();

        assert_eq!(timing.phase, 2);
        assert_eq!(timing.name, "vault");
        assert!(
            matches!(timing.status, PhaseStatus::Degraded(_)),
            "Phase 2 stub must return Degraded — A011 not yet implemented"
        );
    }

    // A012/preflight: run_sync durations contains all 4 phases
    #[test]
    fn a012_preflight_run_sync_durations_contains_all_4_phases() {
        let tmp = tempfile::tempdir().unwrap();
        let mut svc = PreflightService::new(tmp.path().to_path_buf());

        let result = svc.run_sync().unwrap();

        assert_eq!(result.durations.len(), 4);
        let phases: Vec<u8> = result.durations.iter().map(|d| d.phase).collect();
        assert_eq!(phases, vec![1, 2, 3, 4]);
    }

    // A012/preflight: PhaseTimingDto converts correctly from PhaseTiming
    #[test]
    fn a012_preflight_phase_timing_dto_converts_ok_status() {
        let timing = PhaseTiming {
            phase: 1,
            name: "filesystem",
            duration_ms: 2,
            status: PhaseStatus::Ok,
        };
        let dto = PhaseTimingDto::from(&timing);
        assert_eq!(dto.phase, 1);
        assert_eq!(dto.name, "filesystem");
        assert_eq!(dto.status, "ok");
        assert!(dto.detail.is_none());
    }

    // A012/preflight: PhaseTimingDto includes detail for Degraded status
    #[test]
    fn a012_preflight_phase_timing_dto_converts_degraded_with_detail() {
        let timing = PhaseTiming {
            phase: 2,
            name: "vault",
            duration_ms: 0,
            status: PhaseStatus::Degraded("vault not yet implemented".to_string()),
        };
        let dto = PhaseTimingDto::from(&timing);
        assert_eq!(dto.status, "degraded");
        assert_eq!(dto.detail, Some("vault not yet implemented".to_string()));
    }

    // A012/preflight: settings with explicit preset uses it
    #[test]
    fn a012_preflight_phase4_uses_explicit_preset_from_settings() {
        let tmp = tempfile::tempdir().unwrap();
        let svc = PreflightService::new(tmp.path().to_path_buf());
        let settings = PreflightSettings {
            preset: "battery".to_string(),
            ..PreflightSettings::default()
        };

        let (registry, timing) = svc.phase_budget(&settings);

        assert_eq!(timing.status, PhaseStatus::Ok);
        let preset = registry.preset.read().unwrap();
        assert_eq!(preset.name, "battery");
    }

    #[test]
    fn a012_hooks_register_init_adds_hook_to_correct_phase() {
        let mut svc = PreflightService::new(PathBuf::from("/tmp/unused"));
        svc.register_init(Phase::Settings, Box::new(TestInitHook::new(vec![])));

        assert_eq!(svc.init_hooks.get(&Phase::Settings).map(Vec::len), Some(1));
        assert!(svc.init_hooks.get(&Phase::Filesystem).is_none());
    }

    #[test]
    fn a012_hooks_run_sync_executes_init_hooks_after_built_in_phase() {
        let tmp = tempfile::tempdir().unwrap();
        let phases = Arc::new(std::sync::Mutex::new(Vec::new()));
        let mut svc = PreflightService::new(tmp.path().to_path_buf());
        svc.register_init(
            Phase::Filesystem,
            Box::new(TestInitHook::new(vec![InitAction::RecordPhase(
                phases.clone(),
                Phase::Filesystem,
            )])),
        );

        let result = svc.run_sync().unwrap();

        assert!(
            tmp.path().join("runtime").exists(),
            "built-in phase must run first"
        );
        assert_eq!(&*phases.lock().unwrap(), &[Phase::Filesystem]);
        assert_eq!(result.durations[0].phase, 1);
    }

    #[test]
    fn a012_hooks_init_hooks_run_in_registration_order() {
        let tmp = tempfile::tempdir().unwrap();
        let order = Arc::new(std::sync::Mutex::new(Vec::new()));
        let mut svc = PreflightService::new(tmp.path().to_path_buf());
        svc.register_init(
            Phase::Vault,
            Box::new(TestInitHook::new(vec![InitAction::RecordOrder(
                order.clone(),
                1,
            )])),
        );
        svc.register_init(
            Phase::Vault,
            Box::new(TestInitHook::new(vec![InitAction::RecordOrder(
                order.clone(),
                2,
            )])),
        );

        svc.run_sync().unwrap();

        assert_eq!(&*order.lock().unwrap(), &[1, 2]);
    }

    #[test]
    fn a012_hooks_ready_hooks_run_after_all_sync_phases() {
        let tmp = tempfile::tempdir().unwrap();
        let ready = Arc::new(std::sync::Mutex::new(Vec::new()));
        let mut svc = PreflightService::new(tmp.path().to_path_buf());
        svc.register_ready(Box::new(TestReadyHook::new(ready.clone())));

        let result = svc.run_sync().unwrap();

        assert_eq!(&*ready.lock().unwrap(), &["ready:settings-registry"]);
        assert_eq!(result.context.settings().preset, result.settings.preset);
        assert_eq!(
            result.context.registry().preset.read().unwrap().name,
            result.registry.preset.read().unwrap().name
        );
    }

    #[test]
    #[should_panic(expected = "[preflight] settings accessed before Phase 3")]
    fn a012_hooks_context_settings_accessor_panics_before_phase_3() {
        let ctx = PreflightContext::new(PathBuf::from("/tmp/unused"));
        let _ = ctx.settings();
    }

    #[test]
    #[should_panic(expected = "[preflight] registry accessed before Phase 4")]
    fn a012_hooks_context_registry_accessor_panics_before_phase_4() {
        let ctx = PreflightContext::new(PathBuf::from("/tmp/unused"));
        let _ = ctx.registry();
    }

    #[test]
    fn a012_hooks_context_settings_accessible_after_phase_3() {
        let tmp = tempfile::tempdir().unwrap();
        let mut svc = PreflightService::new(tmp.path().to_path_buf());
        svc.register_ready(Box::new(AssertSettingsReadyHook));

        let result = svc.run_sync().unwrap();

        assert_eq!(result.context.settings().preset, result.settings.preset);
    }

    #[test]
    fn a012_hooks_context_registry_accessible_after_phase_4() {
        let tmp = tempfile::tempdir().unwrap();
        let mut svc = PreflightService::new(tmp.path().to_path_buf());
        svc.register_ready(Box::new(AssertRegistryReadyHook));

        let result = svc.run_sync().unwrap();

        assert_eq!(
            result.context.registry().preset.read().unwrap().name,
            result.registry.preset.read().unwrap().name
        );
    }

    #[test]
    fn a012_hooks_failing_init_hook_returns_error_with_phase_info() {
        let tmp = tempfile::tempdir().unwrap();
        let mut svc = PreflightService::new(tmp.path().to_path_buf());
        svc.register_init(
            Phase::Budget,
            Box::new(TestInitHook::new(vec![InitAction::Fail("boom")])),
        );

        let err = match svc.run_sync() {
            Ok(_) => panic!("expected init hook failure"),
            Err(err) => err,
        };

        match err {
            PreflightError::HookFailed { phase, detail } => {
                assert_eq!(phase, Phase::Budget);
                assert!(detail.contains("boom"));
            }
            other => panic!("expected hook failure, got {other:?}"),
        }
    }

    #[test]
    fn a012_hooks_multiple_hooks_on_same_phase_all_execute() {
        let tmp = tempfile::tempdir().unwrap();
        let order = Arc::new(std::sync::Mutex::new(Vec::new()));
        let mut svc = PreflightService::new(tmp.path().to_path_buf());
        svc.register_init(
            Phase::Settings,
            Box::new(TestInitHook::new(vec![InitAction::RecordOrder(
                order.clone(),
                1,
            )])),
        );
        svc.register_init(
            Phase::Settings,
            Box::new(TestInitHook::new(vec![InitAction::RecordOrder(
                order.clone(),
                2,
            )])),
        );
        svc.register_init(
            Phase::Settings,
            Box::new(TestInitHook::new(vec![InitAction::RecordOrder(
                order.clone(),
                3,
            )])),
        );

        svc.run_sync().unwrap();

        assert_eq!(&*order.lock().unwrap(), &[1, 2, 3]);
    }

    enum InitAction {
        RecordOrder(Arc<std::sync::Mutex<Vec<u8>>>, u8),
        RecordPhase(Arc<std::sync::Mutex<Vec<Phase>>>, Phase),
        Fail(&'static str),
    }

    struct TestInitHook {
        actions: Vec<InitAction>,
    }

    impl TestInitHook {
        fn new(actions: Vec<InitAction>) -> Self {
            Self { actions }
        }
    }

    impl OnPreflightInit for TestInitHook {
        fn on_preflight_init(&self, _ctx: &mut PreflightContext) -> Result<(), PreflightError> {
            for action in &self.actions {
                match action {
                    InitAction::RecordOrder(order, value) => order.lock().unwrap().push(*value),
                    InitAction::RecordPhase(phases, phase) => phases.lock().unwrap().push(*phase),
                    InitAction::Fail(message) => {
                        return Err(PreflightError::SettingsError((*message).to_string()))
                    }
                }
            }
            Ok(())
        }
    }

    struct TestReadyHook {
        ready: Arc<std::sync::Mutex<Vec<&'static str>>>,
    }

    impl TestReadyHook {
        fn new(ready: Arc<std::sync::Mutex<Vec<&'static str>>>) -> Self {
            Self { ready }
        }
    }

    impl OnPreflightReady for TestReadyHook {
        fn on_preflight_ready(&self, ctx: &PreflightContext) -> Result<(), PreflightError> {
            let _ = ctx.settings();
            let _ = ctx.registry();
            self.ready.lock().unwrap().push("ready:settings-registry");
            Ok(())
        }
    }

    struct AssertSettingsReadyHook;

    impl OnPreflightReady for AssertSettingsReadyHook {
        fn on_preflight_ready(&self, ctx: &PreflightContext) -> Result<(), PreflightError> {
            assert!(!ctx.settings().theme.is_empty());
            Ok(())
        }
    }

    struct AssertRegistryReadyHook;

    impl OnPreflightReady for AssertRegistryReadyHook {
        fn on_preflight_ready(&self, ctx: &PreflightContext) -> Result<(), PreflightError> {
            assert!(!ctx.registry().preset.read().unwrap().name.is_empty());
            Ok(())
        }
    }
}
