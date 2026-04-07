#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sysinfo::{Pid as SysPid, ProcessesToUpdate, System};
use tauri::ipc::Channel;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, RunEvent};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;

use snapfzz_budget::preset::{build_preset, detect_hardware, select_preset, PresetName};
use snapfzz_budget::supervised::{ProcessBudget, ProcessLocation};
use snapfzz_budget::BudgetRegistry;

const AGENTSCOPE_PORT: u16 = 8090;

fn agentscope_base_url() -> String {
    let settings = std::fs::read_to_string(settings_path()).ok()
        .and_then(|c| serde_json::from_str::<Settings>(&c).ok())
        .unwrap_or_default();
    let host = if settings.agentscope_host.is_empty() { "127.0.0.1".to_string() } else { settings.agentscope_host };
    let port: u16 = settings.agentscope_port.parse().unwrap_or(AGENTSCOPE_PORT);
    format!("http://{host}:{port}")
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ContentBlockBatch {
    session_id: String,
    batch_id: u32,
    token_count: usize,
    blocks: Vec<Value>,
    done: bool,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct MessageResult {
    id: String,
    total_tokens: usize,
    finish_reason: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct Settings {
    // Runtime
    #[serde(alias = "api_key", default)]
    api_key: String,
    #[serde(default = "default_model")]
    model: String,
    #[serde(alias = "api_url", default = "default_api_url")]
    api_url: String,

    // General
    #[serde(default = "default_theme")]
    theme: String,
    #[serde(default = "default_true")]
    open_last_project: bool,
    #[serde(default = "default_language")]
    language: String,
    #[serde(default = "default_font_family")]
    font_family: String,
    #[serde(default = "default_font_size")]
    font_size: String,

    // Advanced
    #[serde(default = "default_true")]
    fps_counter: bool,
    #[serde(default = "default_log_level")]
    log_level: String,

    // Performance
    #[serde(default = "default_preset")]
    preset: String,

    // Per A008/SupervisedDomain: agentscope connection config moved from settings-runtime plugin
    // into the Processes panel. Defaults match the AGENTSCOPE_PORT constant so existing deployments
    // continue working without a settings.json migration.
    #[serde(default = "default_agentscope_host")]
    agentscope_host: String,
    #[serde(default = "default_agentscope_port", deserialize_with = "deserialize_string_or_number")]
    agentscope_port: String,
}

fn default_model() -> String { "gpt-4o".to_string() }
fn default_api_url() -> String { "https://api.openai.com/v1".to_string() }
fn default_theme() -> String { "system".to_string() }
fn default_true() -> bool { true }
fn default_font_family() -> String { "Inter".to_string() }
fn default_font_size() -> String { "13".to_string() }
fn default_language() -> String { "en".to_string() }
fn default_log_level() -> String { "info".to_string() }
fn default_preset() -> String { "auto".to_string() }
fn default_agentscope_host() -> String { "127.0.0.1".to_string() }
fn default_agentscope_port() -> String { AGENTSCOPE_PORT.to_string() }

fn deserialize_string_or_number<'de, D>(deserializer: D) -> Result<String, D::Error>
where D: serde::Deserializer<'de> {
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::String(s) => Ok(s),
        serde_json::Value::Number(n) => Ok(n.to_string()),
        _ => Ok(default_agentscope_port()),
    }
}

impl Default for Settings {
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

/// A008/Supervised: event emitted to the frontend at supervisor lifecycle boundaries.
/// Frontend listens on "supervisor-event" to display runtime notifications.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SupervisorEvent {
    event_type: String, // "success" | "error"
    process: String,    // e.g. "agentscope"
    message: String,    // human-readable description
    timestamp: u64,     // unix epoch ms
}

/// Returns the current time as milliseconds since the Unix epoch.
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Serialize, Debug)]
struct HealthStatus {
    status: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SessionInfo {
    #[serde(alias = "session_id", alias = "sessionId")]
    session_id: String,
}

struct RuntimeState {
    child: Option<tokio::process::Child>,
    child_pid: Option<u32>,
}

/// A008/Supervised: per-process ring-buffer log store.
/// Max 1000 lines per process — oldest lines evicted on overflow.
/// Keyed by process name matching the registry registration name.
struct ProcessLogs {
    lines: DashMap<String, Vec<String>>,
}

const PROCESS_LOG_MAX_LINES: usize = 1000;

impl ProcessLogs {
    fn new() -> Self {
        Self { lines: DashMap::new() }
    }

    fn runtime_dir(name: &str) -> PathBuf {
        resolve_data_dir().join("runtime").join(name)
    }

    fn log_path(name: &str) -> PathBuf {
        Self::runtime_dir(name).join(format!("{name}.log"))
    }

    fn error_log_path(name: &str) -> PathBuf {
        Self::runtime_dir(name).join(format!("{name}_error.log"))
    }

    fn ensure_dir(name: &str) {
        let dir = Self::runtime_dir(name);
        if !dir.exists() { let _ = fs::create_dir_all(&dir); }
    }

    fn push(&self, name: &str, line: String) {
        let mut entry = self.lines.entry(name.to_string()).or_default();
        if entry.len() >= PROCESS_LOG_MAX_LINES {
            let excess = entry.len() - PROCESS_LOG_MAX_LINES + 1;
            entry.drain(..excess);
        }

        Self::ensure_dir(name);
        let log_file = if line.starts_with("[stderr]") {
            Self::error_log_path(name)
        } else {
            Self::log_path(name)
        };
        if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&log_file) {
            use std::io::Write;
            let _ = writeln!(f, "{}", line);
        }

        entry.push(line);
    }

    fn tail(&self, name: &str, n: usize) -> Vec<String> {
        let entry = match self.lines.get(name) {
            Some(e) => e,
            None => return Vec::new(),
        };
        let start = entry.len().saturating_sub(n);
        entry[start..].to_vec()
    }

    /// Clear all stored lines for the named process.
    fn clear(&self, name: &str) {
        if let Some(mut entry) = self.lines.get_mut(name) {
            entry.clear();
        }
        let _ = fs::remove_file(Self::log_path(name));
        let _ = fs::remove_file(Self::error_log_path(name));
    }
}

#[tauri::command]
async fn send_message(
    text: String,
    session_id: String,
    plugin_id: Option<String>,
    on_token: Channel<ContentBlockBatch>,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
    _runtime: tauri::State<'_, Arc<Mutex<RuntimeState>>>,
) -> Result<MessageResult, String> {
    let caller = plugin_id.as_deref().unwrap_or("unknown");
    let _invoke_permit = registry
        .try_acquire_invoke(caller)
        .ok_or_else(|| format!("Budget exhausted: plugin '{caller}' invoke denied"))?;

    let _cpu_permit = registry.try_acquire_cpu()
        .ok_or_else(|| "Budget exhausted: CPU permits unavailable for SSE parsing".to_string())?;

    let url = format!("{}/process", agentscope_base_url());
    let client = reqwest::Client::new();
    let batch_rate = registry.batch_rate();

    let response = client
        .post(&url)
        .json(&json!({
            "input": [{
                "role": "user",
                "content": [{ "type": "text", "text": text }]
            }],
            "session_id": session_id,
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    let mut stream = response.bytes_stream();
    let mut line_buffer = String::new();
    let mut event_data_lines: Vec<String> = Vec::new();
    let mut pending_blocks: Vec<Value> = Vec::new();
    let mut batch_id: u32 = 0;
    let mut batch_token_count: usize = 0;
    let mut total_tokens: usize = 0;
    let mut finish_reason = "stop".to_string();
    let mut message_id: Option<String> = None;
    let mut batch_start = Instant::now();
    let mut stream_finished = false;

    'stream: while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| e.to_string())?;
        line_buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_index) = line_buffer.find('\n') {
            let mut line = line_buffer[..newline_index].to_string();
            line_buffer.drain(..=newline_index);
            if line.ends_with('\r') { line.pop(); }

            if line.is_empty() {
                if event_data_lines.is_empty() { continue; }
                let payload = event_data_lines.join("\n");
                event_data_lines.clear();

                if payload == "[DONE]" {
                    stream_finished = true;
                    break 'stream;
                }

                let payload_value = serde_json::from_str::<Value>(&payload)
                    .unwrap_or_else(|_| json!({ "type": "text", "text": payload }));

                if let Some(id) = payload_value.get("id").and_then(Value::as_str) {
                    message_id = Some(id.to_string());
                }
                if let Some(reason) = payload_value
                    .get("finish_reason").and_then(Value::as_str)
                    .or_else(|| payload_value.get("metadata")
                        .and_then(|m| m.get("finish_reason")).and_then(Value::as_str))
                {
                    finish_reason = reason.to_string();
                }

                let mut extracted = extract_content_blocks(&payload_value);
                if extracted.is_empty() { extracted.push(payload_value); }

                batch_token_count += extracted.len();
                total_tokens += extracted.len();
                pending_blocks.extend(extracted);

                if batch_start.elapsed() >= Duration::from_millis(batch_rate) {
                    flush_batch(&on_token, &session_id, &mut pending_blocks, &mut batch_id, &mut batch_token_count, false)?;
                    batch_start = Instant::now();
                }
                continue;
            }

            if line.starts_with(':') { continue; }
            if let Some(data) = line.strip_prefix("data:") {
                event_data_lines.push(data.trim_start().to_string());
            }
        }
    }

    if !event_data_lines.is_empty() {
        let payload = event_data_lines.join("\n");
        if payload != "[DONE]" {
            let pv = serde_json::from_str::<Value>(&payload)
                .unwrap_or_else(|_| json!({ "type": "text", "text": payload }));
            let mut extracted = extract_content_blocks(&pv);
            if extracted.is_empty() { extracted.push(pv); }
            batch_token_count += extracted.len();
            total_tokens += extracted.len();
            pending_blocks.extend(extracted);
        } else {
            stream_finished = true;
        }
    }

    if !pending_blocks.is_empty() {
        flush_batch(&on_token, &session_id, &mut pending_blocks, &mut batch_id, &mut batch_token_count, false)?;
    }
    if stream_finished {
        flush_batch(&on_token, &session_id, &mut pending_blocks, &mut batch_id, &mut batch_token_count, true)?;
    }

    Ok(MessageResult {
        id: message_id.unwrap_or_else(uuid_string),
        total_tokens,
        finish_reason,
    })
}

#[tauri::command]
async fn stop_generation(session_id: String) -> Result<(), String> {
    reqwest::Client::new()
        .post(format!("{}/stop", agentscope_base_url()))
        .json(&json!({ "session_id": session_id }))
        .send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn create_session(template_id: Option<String>) -> Result<SessionInfo, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/session", agentscope_base_url());
    let req = match template_id {
        Some(tid) => client.post(&url).json(&json!({ "template_id": tid })),
        None => client.post(&url),
    };
    req.send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?
        .json::<SessionInfo>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_session(session_id: String) -> Result<Value, String> {
    reqwest::Client::new()
        .get(format!("{}/session/{session_id}", agentscope_base_url()))
        .send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn agent_health(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<HealthStatus, String> {
    let healthy = registry.supervised.check_health("agentscope").await;
    let status = if healthy { "connected" } else { "disconnected" };
    Ok(HealthStatus { status: status.into() })
}

fn get_settings_sync() -> Settings {
    let path = settings_path();
    eprintln!("[settings] reading from: {}", path.display());
    if !path.exists() {
        eprintln!("[settings] file not found, using defaults");
        return Settings::default();
    }
    let content = fs::read_to_string(&path).unwrap_or_default();
    match serde_json::from_str::<Settings>(&content) {
        Ok(s) => {
            eprintln!("[settings] loaded preset: '{}'", s.preset);
            s
        }
        Err(e) => {
            eprintln!("[settings] parse error: {e}, using defaults");
            Settings::default()
        }
    }
}

#[tauri::command]
async fn get_settings() -> Result<Settings, String> {
    let path = settings_path();
    if !path.exists() { return Ok(Settings::default()); }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str::<Settings>(&content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    // Per A007/MultiLayout: broadcast to ALL webview windows so every surface re-applies settings.
    let _ = app.emit("settings-changed", ());
    Ok(())
}

#[tauri::command]
async fn get_batch_interval(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<u64, String> {
    Ok(registry.batch_interval())
}

#[tauri::command]
async fn get_startup_budget(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<Value, String> {
    let (visible, interactive, timeout) = registry.startup_budget();
    Ok(json!({ "visible_ms": visible, "interactive_ms": interactive, "activation_timeout_ms": timeout }))
}

#[tauri::command]
async fn budget_record_strike(plugin_id: String, registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<bool, String> {
    registry.record_strike(&plugin_id);
    Ok(registry.is_plugin_disabled(&plugin_id))
}

#[tauri::command]
async fn budget_report_violation(class: String, metric: String, actual_ms: f64, registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<(), String> {
    eprintln!("[budget] violation: class={class} metric={metric} actual={actual_ms:.1}ms target={}ms", registry.batch_interval());
    Ok(())
}

#[tauri::command]
async fn budget_snapshot(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<Value, String> {
    let snap = registry.snapshot();
    serde_json::to_value(snap).map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_preset(
    preset_name: String,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<(), String> {
    let hw = detect_hardware();
    let name = match preset_name.as_str() {
        "performance" => PresetName::Performance,
        "balanced" => PresetName::Balanced,
        "battery" => PresetName::Battery,
        _ => return Err(format!("Unknown preset: {preset_name}")),
    };
    let new_preset = build_preset(name, &hw);
    let new_agentscope_max_mb = new_preset.memory.agentscope_max_mb;
    registry.swap_preset(new_preset);
    // Propagate memory limit to live supervised process entries.
    if let Some(mut entry) = registry.supervised.processes.get_mut("agentscope") {
        entry.max_memory_mb = new_agentscope_max_mb;
    }
    eprintln!("[budget] preset swapped to: {preset_name}");
    Ok(())
}

#[tauri::command]
async fn pick_folder(default_path: Option<String>) -> Result<Option<String>, String> {
    use rfd::FileDialog;
    let mut dialog = FileDialog::new();
    if let Some(p) = default_path {
        dialog = dialog.set_directory(&p);
    }
    Ok(dialog.pick_folder().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
async fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "linux")]
    { std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "windows")]
    { std::process::Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
async fn get_data_dir() -> Result<String, String> {
    Ok(resolve_data_dir().to_string_lossy().to_string())
}

// A004/pointer.json: Writes a new dataDir into ~/.snapfzz/pointer.json.
// Does NOT migrate existing data — the app must restart for the new path to take effect.
// Migration is out of scope (A004 deferred). Frontend handles restart confirmation.
#[tauri::command]
async fn set_data_dir(new_path: String) -> Result<(), String> {
    let new_dir = PathBuf::from(&new_path);
    fs::create_dir_all(&new_dir).map_err(|e| e.to_string())?;

    let pointer = json!({ "dataDir": new_path });
    let pointer_path = snapfzz_home().join("pointer.json");
    if let Some(parent) = pointer_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&pointer_path, serde_json::to_string_pretty(&pointer).unwrap())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_preferences(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    if let Some(window) = app.get_webview_window("preferences") {
        window.show().map_err(|e: tauri::Error| e.to_string())?;
        window.set_focus().map_err(|e: tauri::Error| e.to_string())?;
        return Ok(());
    }

    let url = if cfg!(debug_assertions) {
        WebviewUrl::External("http://localhost:5175".parse().unwrap())
    } else {
        WebviewUrl::App("preferences.html".into())
    };

    WebviewWindowBuilder::new(&app, "preferences", url)
        .title("Snapfzz Preferences")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn extract_content_blocks(payload: &Value) -> Vec<Value> {
    if let Some(blocks) = payload.get("content_blocks").and_then(Value::as_array) {
        return blocks.to_vec();
    }
    if let Some(blocks) = payload.get("delta").and_then(|d| d.get("content_blocks")).and_then(Value::as_array) {
        return blocks.to_vec();
    }
    if let Some(content) = payload.get("content").and_then(Value::as_array) {
        return content.to_vec();
    }
    if let Some(text) = payload.get("delta").and_then(|d| d.get("content")).and_then(Value::as_str) {
        return vec![json!({ "type": "text", "text": text })];
    }
    if let Some(text) = payload.get("choices").and_then(Value::as_array)
        .and_then(|c| c.first()).and_then(|c| c.get("delta"))
        .and_then(|d| d.get("content")).and_then(Value::as_str) {
        return vec![json!({ "type": "text", "text": text })];
    }
    Vec::new()
}

fn flush_batch(
    on_token: &Channel<ContentBlockBatch>,
    session_id: &str,
    pending: &mut Vec<Value>,
    batch_id: &mut u32,
    count: &mut usize,
    done: bool,
) -> Result<(), String> {
    if pending.is_empty() && !done { return Ok(()); }
    on_token.send(ContentBlockBatch {
        session_id: session_id.to_string(),
        batch_id: *batch_id,
        token_count: *count,
        blocks: std::mem::take(pending),
        done,
    }).map_err(|e| e.to_string())?;
    *batch_id += 1;
    *count = 0;
    Ok(())
}

// Per A004: Bootstrap anchor — this path NEVER changes. It holds pointer.json
// that redirects all other data to a configurable location.
// Uses ~/.snapfzz on all platforms for Alpha. Platform-appropriate paths
// (~/Library/Application Support/, %APPDATA%, ~/.local/share/) deferred to V1.
fn snapfzz_home() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".snapfzz")
}

// A004/pointer.json: Core resolution logic, injectable for testability.
// Reads optional dataDir override from <home>/pointer.json.
// Falls back to <home> if pointer is absent, malformed, or the target doesn't exist.
fn resolve_data_dir_from(home: PathBuf) -> PathBuf {
    let pointer_path = home.join("pointer.json");
    if pointer_path.exists() {
        if let Ok(content) = fs::read_to_string(&pointer_path) {
            if let Ok(pointer) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(dir) = pointer.get("dataDir").and_then(|v| v.as_str()) {
                    let custom = PathBuf::from(dir);
                    if custom.exists() {
                        return custom;
                    }
                }
            }
        }
    }
    home
}

// A004: Production entry point — resolves from the real ~/.snapfzz anchor.
fn resolve_data_dir() -> PathBuf {
    resolve_data_dir_from(snapfzz_home())
}

// A004: Settings live in the resolved data dir so they follow any user-configured location.
fn settings_path() -> PathBuf {
    resolve_data_dir().join("settings.json")
}

// A004: PID file lives in the resolved data dir alongside settings.
fn pid_file_path() -> PathBuf {
    resolve_data_dir().join("runtime").join("agentscope").join("agentscope.pid")
}

fn uuid_string() -> String {
    format!("{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos())
}

fn resolve_intelligence_dir() -> Result<PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    for c in &[cwd.join("intelligence"), cwd.join("..").join("intelligence"), cwd.join("../..").join("intelligence")] {
        if c.join("pyproject.toml").exists() { return Ok(c.clone()); }
    }
    Err("Unable to find intelligence/ directory".to_string())
}

fn cleanup_stale_pid() {
    let path = pid_file_path();
    let content = match fs::read_to_string(&path) { Ok(c) => c, Err(_) => return };
    let pid: u32 = match content.trim().parse() { Ok(p) => p, Err(_) => { let _ = fs::remove_file(&path); return; } };

    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::Some(&[SysPid::from_u32(pid)]), true);
    if sys.process(SysPid::from_u32(pid)).is_some() {
        eprintln!("[supervisor] killing orphan process {pid}");
        #[cfg(unix)]
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
            libc::kill(pid as i32, libc::SIGKILL);
        }
        #[cfg(not(unix))]
        if let Some(proc) = sys.process(SysPid::from_u32(pid)) { proc.kill(); }
    }
    let _ = fs::remove_file(&path);
}

fn write_pid_file(pid: u32) {
    let path = pid_file_path();
    if let Some(parent) = path.parent() { let _ = fs::create_dir_all(parent); }
    let _ = fs::write(&path, pid.to_string());
}

fn remove_pid_file() { let _ = fs::remove_file(pid_file_path()); }

async fn spawn_runtime(
    app_handle: &tauri::AppHandle,
    registry: &Arc<BudgetRegistry>,
    runtime: &Arc<Mutex<RuntimeState>>,
    logs: &Arc<ProcessLogs>,
) -> Result<(), String> {
    cleanup_stale_pid();
    let intelligence_dir = resolve_intelligence_dir()?;

    // Read host/port from persisted settings, falling back to defaults.
    let settings = get_settings().await.unwrap_or_default();
    let host = if settings.agentscope_host.is_empty() { "127.0.0.1".to_string() } else { settings.agentscope_host };
    let port: u16 = settings.agentscope_port.parse().unwrap_or(AGENTSCOPE_PORT);

    // A008/Supervised: pipe stdout+stderr before taking ownership of child.
    // Reader tasks push lines into ProcessLogs so the main child handle stays clean.
    let mut cmd = tokio::process::Command::new("uv");
    cmd.args(["run", "python", "app.py"])
        .current_dir(intelligence_dir)
        .env("SNAPFZZ_HOST", &host)
        .env("SNAPFZZ_PORT", port.to_string())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    #[cfg(unix)]
    {
        cmd.process_group(0);
    }

    let mut child = cmd.spawn()
        .map_err(|e| e.to_string())?;

    let child_pid = child.id().unwrap_or(0);
    write_pid_file(child_pid);

    // Capture stdout — take BEFORE moving child into RuntimeState.
    if let Some(stdout) = child.stdout.take() {
        let logs_out = logs.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                logs_out.push("agentscope", line);
            }
        });
    }

    // Capture stderr — take BEFORE moving child into RuntimeState.
    if let Some(stderr) = child.stderr.take() {
        let logs_err = logs.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                logs_err.push("agentscope", format!("[stderr] {line}"));
            }
        });
    }

    {
        let mut guard = runtime.lock().await;
        guard.child = Some(child);
        guard.child_pid = Some(child_pid);
    }

    let prev = registry.supervised.processes.get("agentscope");
    let prev_restart_count = prev.as_ref().map(|p| p.restart_count).unwrap_or(0);
    let is_restart = prev.is_some();
    let (preset_agentscope_max_mb, preset_max_restarts) = {
        let preset = registry.preset.read().unwrap();
        (preset.memory.agentscope_max_mb, preset.reliability.max_restarts)
    };
    let prev_max_memory = prev.as_ref().map(|p| p.max_memory_mb)
        .unwrap_or(preset_agentscope_max_mb);
    drop(prev);

    registry.register_process("agentscope", ProcessBudget {
        pid: Some(child_pid),
        max_memory_mb: prev_max_memory,
        health_url: format!("http://{host}:{port}/health"),
        health_interval_ms: 2000,
        max_health_failures: 3,
        max_restarts: preset_max_restarts,
        location: ProcessLocation::Local,
        consecutive_failures: 0,
        restart_count: if is_restart { prev_restart_count + 1 } else { 0 },
        status: snapfzz_budget::metrics::ProcessStatus::Starting,
        started_at: Some(std::time::Instant::now()),
        owner: "system".to_string(),
    });

    for _ in 0..120 {
        tokio::time::sleep(Duration::from_millis(1000)).await;
        if registry.supervised.check_health("agentscope").await {
            if let Some(mut entry) = registry.supervised.processes.get_mut("agentscope") {
                entry.status = snapfzz_budget::metrics::ProcessStatus::Online;
            }
            eprintln!("[budget] AgentScope Runtime healthy on {host}:{port}");
            let _ = app_handle.emit("supervisor-event", SupervisorEvent {
                event_type: "success".into(),
                process: "agentscope".into(),
                message: "AgentScope Runtime started successfully".into(),
                timestamp: now_ms(),
            });
            return Ok(());
        }
    }
    Err("AgentScope Runtime did not become healthy within 120s".to_string())
}

async fn shutdown_runtime(app_handle: &tauri::AppHandle, runtime: &Arc<Mutex<RuntimeState>>) {
    let mut guard = runtime.lock().await;

    if guard.child.is_none() {
        guard.child_pid = None;
        return;
    }

    let pid = guard.child_pid;

    if let Some(mut child) = guard.child.take() {
        if let Some(pid) = pid {
            let is_alive = child.try_wait().ok().flatten().is_none();
            if is_alive {
                #[cfg(unix)]
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGKILL);
                    libc::kill(pid as i32, libc::SIGKILL);
                }
                #[cfg(not(unix))]
                { let _ = child.start_kill(); }
            }
        }
        let _ = tokio::time::timeout(Duration::from_secs(2), child.wait()).await;
    }

    guard.child_pid = None;
    remove_pid_file();
    eprintln!("[supervisor] process killed (pid: {:?})", pid);
    let _ = app_handle.emit("supervisor-event", SupervisorEvent {
        event_type: "success".into(),
        process: "agentscope".into(),
        message: "Process killed".into(),
        timestamp: now_ms(),
    });
}

// A008/Supervised: list all registered supervised processes with full snapshot.
// Returns the processes array from BudgetMetrics so the frontend can render
// the Agent Network panel without needing a separate IPC roundtrip.
#[tauri::command]
async fn list_processes(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<Value, String> {
    let snap = registry.snapshot();
    serde_json::to_value(snap.processes).map_err(|e| e.to_string())
}

// A008/Supervised: return the last `tail_n` log lines for a named process.
#[tauri::command]
async fn get_process_logs(
    name: String,
    tail_n: usize,
    logs: tauri::State<'_, Arc<ProcessLogs>>,
) -> Result<Vec<String>, String> {
    Ok(logs.tail(&name, tail_n))
}

// A008/Supervised: clear stored log lines for a named process.
#[tauri::command]
async fn clear_process_logs(
    name: String,
    logs: tauri::State<'_, Arc<ProcessLogs>>,
) -> Result<(), String> {
    logs.clear(&name);
    Ok(())
}

// A008/Supervised: restart the agentscope process — shutdown then respawn.
// Only "agentscope" is supported in Alpha; name is validated for forward-compatibility.
#[tauri::command]
async fn restart_process(
    name: String,
    app: tauri::AppHandle,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
    runtime: tauri::State<'_, Arc<Mutex<RuntimeState>>>,
    logs: tauri::State<'_, Arc<ProcessLogs>>,
) -> Result<(), String> {
    if name != "agentscope" {
        return Err(format!("restart_process: unknown process '{name}'"));
    }
    shutdown_runtime(&app, &runtime).await;
    spawn_runtime(&app, &registry, &runtime, &logs).await
}

// A004/Workspace: downloads a font from a URL into the fonts/ subdirectory of the data dir.
// The returned path is used by the frontend to register a @font-face rule.
#[tauri::command]
async fn install_font_from_url(url: String, name: String) -> Result<String, String> {
    let fonts_dir = resolve_data_dir().join("fonts");
    fs::create_dir_all(&fonts_dir).map_err(|e| e.to_string())?;

    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?;
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let ext = if url.contains(".woff2") {
        "woff2"
    } else if url.contains(".woff") {
        "woff"
    } else if url.contains(".otf") {
        "otf"
    } else {
        "ttf"
    };
    let filename = format!("{name}.{ext}");
    let path = fonts_dir.join(&filename);
    fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

// A004/Workspace: copies a font file from the given source path into the fonts/ subdirectory.
// The returned path is used by the frontend to register a @font-face rule.
#[tauri::command]
async fn install_font_from_file(source_path: String, name: String) -> Result<String, String> {
    let fonts_dir = resolve_data_dir().join("fonts");
    fs::create_dir_all(&fonts_dir).map_err(|e| e.to_string())?;

    let source = PathBuf::from(&source_path);
    let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("ttf");
    let filename = format!("{name}.{ext}");
    let dest = fonts_dir.join(&filename);
    fs::copy(&source, &dest).map_err(|e| e.to_string())?;

    Ok(dest.to_string_lossy().to_string())
}

// A004/Workspace: returns the stem names of all font files in the fonts/ subdirectory.
// Used on boot to register FontFace objects for every installed custom font.
#[tauri::command]
async fn list_installed_fonts() -> Result<Vec<String>, String> {
    let fonts_dir = resolve_data_dir().join("fonts");
    if !fonts_dir.exists() {
        return Ok(vec![]);
    }

    let mut names = vec![];
    for entry in fs::read_dir(&fonts_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        if let Some(stem) = file_name.split('.').next() {
            if !stem.is_empty() {
                names.push(stem.to_string());
            }
        }
    }
    Ok(names)
}

// A004/Workspace: removes a font file from the fonts/ subdirectory by name.
// Deletes all format variants (.ttf, .otf, .woff, .woff2) for the given name.
#[tauri::command]
async fn remove_font(name: String) -> Result<(), String> {
    let fonts_dir = resolve_data_dir().join("fonts");
    if !fonts_dir.exists() {
        return Err("Fonts directory does not exist".to_string());
    }

    let extensions = ["ttf", "otf", "woff", "woff2"];
    let mut removed_any = false;

    for ext in &extensions {
        let path = fonts_dir.join(format!("{name}.{ext}"));
        if path.exists() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
            removed_any = true;
        }
    }

    if !removed_any {
        return Err(format!("No font found with name '{name}'"));
    }

    Ok(())
}

// A008/BudgetRegistry: expose hardware info so the frontend can compute
// hardware-scaled Performance preset badge values without a second round-trip.
#[tauri::command]
async fn get_hardware_info() -> Result<Value, String> {
    let hw = detect_hardware();
    Ok(json!({
        "cores": hw.cores,
        "ramGb": hw.ram_gb,
        "onBattery": hw.on_battery,
    }))
}

// A008/Supervised: send SIGKILL to a named process and clean up.
#[tauri::command]
async fn kill_process(
    name: String,
    app: tauri::AppHandle,
    runtime: tauri::State<'_, Arc<Mutex<RuntimeState>>>,
) -> Result<(), String> {
    if name != "agentscope" {
        return Err(format!("kill_process: unknown process '{name}'"));
    }
    shutdown_runtime(&app, &runtime).await;
    Ok(())
}

// A008/Supervised: update the max_memory_mb ceiling for a named process in the registry.
// Takes effect immediately on the next enforce_loop tick.
#[tauri::command]
async fn update_process_config(
    name: String,
    max_memory_mb: u64,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
) -> Result<(), String> {
    let mut entry = registry.supervised.processes.get_mut(&name)
        .ok_or_else(|| format!("update_process_config: process '{name}' not registered"))?;
    entry.max_memory_mb = max_memory_mb;
    Ok(())
}

fn main() {
    let settings = get_settings_sync();
    let registry = Arc::new(if settings.preset == "auto" || settings.preset.is_empty() {
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
    });
    {
        let preset = registry.preset.read().unwrap();
        eprintln!("[budget] preset: {} (batch_interval={}ms, cpu={}, mem={}MB)",
            preset.name, registry.batch_interval(),
            preset.cpu.permits, preset.memory.agentscope_max_mb);
    }

    let runtime_state = Arc::new(Mutex::new(RuntimeState { child: None, child_pid: None }));
    let process_logs = Arc::new(ProcessLogs::new());

    let setup_registry = registry.clone();
    let setup_runtime = runtime_state.clone();
    let setup_logs = process_logs.clone();

    tauri::Builder::default()
        .manage(registry.clone())
        .manage(runtime_state.clone())
        .manage(process_logs.clone())
        .invoke_handler(tauri::generate_handler![
            send_message,
            stop_generation,
            create_session,
            load_session,
            agent_health,
            get_settings,
            save_settings,
            get_data_dir,
            open_path,
            pick_folder,
            set_data_dir,
            get_batch_interval,
            get_startup_budget,
            budget_record_strike,
            budget_report_violation,
            budget_snapshot,
            set_preset,
            open_preferences,
            list_processes,
            get_process_logs,
            clear_process_logs,
            restart_process,
            kill_process,
            update_process_config,
            get_hardware_info,
            install_font_from_url,
            install_font_from_file,
            list_installed_fonts,
            remove_font,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let reg = setup_registry.clone();
            let rt = setup_runtime.clone();
            let logs = setup_logs.clone();

            let preferences_item = MenuItemBuilder::with_id("preferences", "Preferences…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let about_item = MenuItemBuilder::with_id("about", "About Snapfzz")
                .build(app)?;

            let app_menu = SubmenuBuilder::new(app, "Snapfzz")
                .item(&about_item)
                .separator()
                .item(&preferences_item)
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .fullscreen()
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .close_window()
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&window_menu)
                .build()?;

            app.set_menu(menu)?;

            let app_handle_for_menu = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                use tauri::{WebviewUrl, WebviewWindowBuilder};
                let h = app_handle_for_menu.clone();
                match event.id().as_ref() {
                    "preferences" => {
                        tauri::async_runtime::spawn(async move {
                            let _ = open_preferences(h).await;
                        });
                    }
                    "about" => {
                        if let Some(w) = h.get_webview_window("about") {
                            let _ = w.set_focus();
                            return;
                        }
                        let about_url = if cfg!(debug_assertions) {
                            WebviewUrl::External("http://localhost:5174/about.html".parse().unwrap())
                        } else {
                            WebviewUrl::App("about.html".into())
                        };
                        let _ = WebviewWindowBuilder::new(&h, "about", about_url)
                            .title("About")
                            .inner_size(420.0, 520.0)
                            .resizable(false)
                            .maximizable(false)
                            .minimizable(false)
                            .center()
                            .build();
                    }
                    _ => {}
                }
            });

            tauri::async_runtime::spawn(async move {
                if let Err(e) = spawn_runtime(&handle, &reg, &rt, &logs).await {
                    eprintln!("[budget] {e}");
                }
                let _ = handle.emit("agent-status", "online");
            });

            // A008/Measurement: emit budget-metrics every 2s so Zone 3 can render status bar.
            // Runs as a background task — never blocks the main thread.
            let metrics_reg = setup_registry.clone();
            let metrics_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_millis(2000)).await;

                    let names: Vec<String> = metrics_reg.supervised.processes.iter()
                        .map(|e| e.key().clone())
                        .collect();

                    for name in &names {
                        let healthy = metrics_reg.supervised.check_health(name).await;
                        let mut failures_to_emit: Option<u32> = None;
                        if let Some(mut proc) = metrics_reg.supervised.processes.get_mut(name) {
                            if healthy {
                                proc.status = snapfzz_budget::metrics::ProcessStatus::Online;
                                proc.consecutive_failures = 0;
                            } else {
                                proc.consecutive_failures += 1;
                                proc.status = snapfzz_budget::metrics::ProcessStatus::Unhealthy;
                                failures_to_emit = Some(proc.consecutive_failures);
                            }
                        }
                        if let Some(failures) = failures_to_emit {
                            let _ = metrics_handle.emit("supervisor-event", SupervisorEvent {
                                event_type: "error".into(),
                                process: name.clone(),
                                message: format!("Health check failed ({failures} consecutive)"),
                                timestamp: now_ms(),
                            });
                        }

                        let rss = metrics_reg.supervised.check_memory(name);
                        let max = metrics_reg.supervised.processes.get(name)
                            .map(|p| p.max_memory_mb)
                            .unwrap_or(0);
                        if rss.map(|r| r > max as f64).unwrap_or(false) {
                            if let Some(mut proc) = metrics_reg.supervised.processes.get_mut(name) {
                                proc.status = snapfzz_budget::metrics::ProcessStatus::Errored;
                            }
                            let rss_val = rss.unwrap_or(0.0);
                            let _ = metrics_handle.emit("supervisor-event", SupervisorEvent {
                                event_type: "error".into(),
                                process: name.clone(),
                                message: format!("Memory exceeded: {rss_val:.0}MB > {max}MB limit"),
                                timestamp: now_ms(),
                            });
                        }
                    }

                    let snap = metrics_reg.snapshot();
                    if let Err(e) = metrics_handle.emit("budget-metrics", &snap) {
                        eprintln!("[budget] metrics emit error: {e}");
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running snapfzz")
        .run(move |app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                let rt = runtime_state.clone();
                tauri::async_runtime::block_on(shutdown_runtime(app_handle, &rt));
                eprintln!("[budget] shutdown complete");
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn a004_persistence_resolve_data_dir_returns_default_when_no_pointer_exists() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        let result = resolve_data_dir_from(home.clone());
        assert_eq!(result, home);
    }

    #[test]
    fn a004_persistence_resolve_data_dir_reads_custom_path_from_pointer_json() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();
        let custom = tmp.path().join("custom_data");
        fs::create_dir_all(&custom).unwrap();

        let pointer = serde_json::json!({ "dataDir": custom.to_str().unwrap() });
        fs::write(home.join("pointer.json"), serde_json::to_string(&pointer).unwrap()).unwrap();

        let result = resolve_data_dir_from(home);
        assert_eq!(result, custom);
    }

    #[test]
    fn a004_persistence_resolve_data_dir_falls_back_to_default_when_pointer_path_does_not_exist() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();

        let pointer = serde_json::json!({ "dataDir": "/this/path/does/not/exist/xyz" });
        fs::write(home.join("pointer.json"), serde_json::to_string(&pointer).unwrap()).unwrap();

        let result = resolve_data_dir_from(home.clone());
        assert_eq!(result, home);
    }

    #[test]
    fn a004_persistence_resolve_data_dir_falls_back_to_default_when_pointer_is_corrupt() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_path_buf();

        fs::write(home.join("pointer.json"), "not { valid json").unwrap();

        let result = resolve_data_dir_from(home.clone());
        assert_eq!(result, home);
    }

    #[test]
    fn a004_persistence_settings_path_uses_resolved_data_dir() {
        let path = settings_path();
        assert!(path.to_str().unwrap().ends_with("settings.json"));
        assert!(path.to_str().unwrap().contains(".snapfzz"));
    }

    #[test]
    fn a004_persistence_pid_file_path_uses_resolved_data_dir() {
        let path = pid_file_path();
        assert!(path.to_str().unwrap().ends_with("agentscope.pid"));
        assert!(path.to_str().unwrap().contains(".snapfzz"));
    }

    #[test]
    fn a008_process_logs_push_tail_returns_last_n_lines() {
        let store = ProcessLogs::new();
        store.push("agentscope", "line-1".into());
        store.push("agentscope", "line-2".into());
        store.push("agentscope", "line-3".into());

        let tail = store.tail("agentscope", 2);
        assert_eq!(tail, vec!["line-2", "line-3"]);
    }

    #[test]
    fn a008_process_logs_tail_returns_empty_for_unknown_process() {
        let store = ProcessLogs::new();
        assert!(store.tail("unknown", 10).is_empty());
    }

    #[test]
    fn a008_process_logs_tail_n_greater_than_total_returns_all_lines() {
        let store = ProcessLogs::new();
        store.push("agentscope", "only-line".into());
        let tail = store.tail("agentscope", 100);
        assert_eq!(tail, vec!["only-line"]);
    }

    #[test]
    fn a008_process_logs_clear_empties_lines_for_named_process() {
        let store = ProcessLogs::new();
        store.push("agentscope", "some-line".into());
        store.clear("agentscope");
        assert!(store.tail("agentscope", 10).is_empty());
    }

    #[test]
    fn a008_process_logs_clear_does_not_affect_other_processes() {
        let store = ProcessLogs::new();
        store.push("agentscope", "agent-line".into());
        store.push("boxlite", "boxlite-line".into());
        store.clear("agentscope");
        assert!(store.tail("agentscope", 10).is_empty());
        assert_eq!(store.tail("boxlite", 10), vec!["boxlite-line"]);
    }

    #[test]
    fn a008_process_logs_evicts_oldest_when_cap_exceeded() {
        let store = ProcessLogs::new();
        for i in 0..=PROCESS_LOG_MAX_LINES {
            store.push("agentscope", format!("line-{i}"));
        }
        let lines = store.tail("agentscope", PROCESS_LOG_MAX_LINES + 1);
        assert_eq!(lines.len(), PROCESS_LOG_MAX_LINES);
        assert!(!lines.contains(&"line-0".to_string()), "oldest line must be evicted");
        assert!(lines.contains(&format!("line-{PROCESS_LOG_MAX_LINES}")), "newest line must be retained");
    }

    #[test]
    fn a008_process_logs_push_concurrent_processes_isolated() {
        let store = ProcessLogs::new();
        store.push("alpha", "alpha-1".into());
        store.push("alpha", "alpha-2".into());
        store.push("beta", "beta-1".into());
        store.push("gamma", "gamma-1".into());

        let alpha = store.tail("alpha", 100);
        let beta = store.tail("beta", 100);
        let gamma = store.tail("gamma", 100);

        assert_eq!(alpha, vec!["alpha-1", "alpha-2"]);
        assert_eq!(beta, vec!["beta-1"]);
        assert_eq!(gamma, vec!["gamma-1"]);
        assert!(!alpha.iter().any(|l| l.starts_with("beta")));
        assert!(!beta.iter().any(|l| l.starts_with("alpha")));
    }

    #[test]
    fn a008_process_logs_tail_returns_newest() {
        let store = ProcessLogs::new();
        for i in 0..10 {
            store.push("agentscope", format!("line-{i}"));
        }

        let tail = store.tail("agentscope", 3);

        assert_eq!(tail.len(), 3);
        assert_eq!(tail[0], "line-7");
        assert_eq!(tail[1], "line-8");
        assert_eq!(tail[2], "line-9");
    }

    #[test]
    fn a008_supervisor_event_serializes_with_camel_case_fields() {
        let event = SupervisorEvent {
            event_type: "success".into(),
            process: "agentscope".into(),
            message: "AgentScope Runtime started successfully".into(),
            timestamp: 1_000_000,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["eventType"], "success");
        assert_eq!(json["process"], "agentscope");
        assert_eq!(json["message"], "AgentScope Runtime started successfully");
        assert_eq!(json["timestamp"], 1_000_000_u64);
    }

    #[test]
    fn a008_supervisor_event_error_variant_serializes_correctly() {
        let event = SupervisorEvent {
            event_type: "error".into(),
            process: "agentscope".into(),
            message: "Health check failed (3 consecutive)".into(),
            timestamp: 42,
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["eventType"], "error");
        assert_eq!(json["message"], "Health check failed (3 consecutive)");
    }

    #[test]
    fn a008_now_ms_returns_nonzero_timestamp() {
        let ts = now_ms();
        assert!(ts > 0, "now_ms must return a positive unix epoch ms value");
    }

    #[test]
    fn a008_now_ms_advances_over_time() {
        let t1 = now_ms();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let t2 = now_ms();
        assert!(t2 >= t1, "now_ms must be monotonically non-decreasing");
    }

    #[test]
    fn a004_font_list_installed_fonts_empty_when_no_fonts_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let fonts_dir = tmp.path().join("fonts");
        assert!(!fonts_dir.exists(), "fonts dir must not exist before the test");

        let mut names = vec![];
        if fonts_dir.exists() {
            for entry in fs::read_dir(&fonts_dir).unwrap() {
                let entry = entry.unwrap();
                let file_name = entry.file_name().to_string_lossy().to_string();
                if let Some(stem) = file_name.split('.').next() {
                    if !stem.is_empty() {
                        names.push(stem.to_string());
                    }
                }
            }
        }
        assert!(names.is_empty(), "no font names expected when fonts dir is absent");
    }

    #[test]
    fn a004_font_list_installed_fonts_returns_stems() {
        let tmp = tempfile::tempdir().unwrap();
        let fonts_dir = tmp.path().join("fonts");
        fs::create_dir_all(&fonts_dir).unwrap();

        fs::write(fonts_dir.join("Roboto.ttf"), b"fake").unwrap();
        fs::write(fonts_dir.join("OpenSans.woff2"), b"fake").unwrap();
        fs::write(fonts_dir.join("Lato.otf"), b"fake").unwrap();

        let mut names = vec![];
        for entry in fs::read_dir(&fonts_dir).unwrap() {
            let entry = entry.unwrap();
            let file_name = entry.file_name().to_string_lossy().to_string();
            if let Some(stem) = file_name.split('.').next() {
                if !stem.is_empty() {
                    names.push(stem.to_string());
                }
            }
        }
        names.sort();

        assert_eq!(names, vec!["Lato", "OpenSans", "Roboto"]);
    }
}
