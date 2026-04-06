#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sysinfo::{Pid as SysPid, ProcessesToUpdate, System};
use tauri::ipc::Channel;
use tauri::{Emitter, RunEvent};
use tokio::sync::Mutex;

use snapfzz_budget::supervised::{ProcessBudget, ProcessLocation};
use snapfzz_budget::BudgetRegistry;

const AGENTSCOPE_PORT: u16 = 8090;

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
    #[serde(alias = "api_key")]
    api_key: String,
    model: String,
    #[serde(alias = "api_url")]
    api_url: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: "gpt-4o".to_string(),
            api_url: "https://api.openai.com/v1".to_string(),
        }
    }
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

    let url = format!("http://127.0.0.1:{AGENTSCOPE_PORT}/process");
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
        .post(format!("http://127.0.0.1:{AGENTSCOPE_PORT}/stop"))
        .json(&json!({ "session_id": session_id }))
        .send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn create_session(template_id: Option<String>) -> Result<SessionInfo, String> {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{AGENTSCOPE_PORT}/session");
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
        .get(format!("http://127.0.0.1:{AGENTSCOPE_PORT}/session/{session_id}"))
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

#[tauri::command]
async fn get_settings() -> Result<Settings, String> {
    let path = settings_path();
    if !path.exists() { return Ok(Settings::default()); }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str::<Settings>(&content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_settings(settings: Settings) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_frame_target(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<u64, String> {
    Ok(registry.frame_target())
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
    eprintln!("[budget] violation: class={class} metric={metric} actual={actual_ms:.1}ms target={}ms", registry.frame_target());
    Ok(())
}

#[tauri::command]
async fn budget_snapshot(registry: tauri::State<'_, Arc<BudgetRegistry>>) -> Result<Value, String> {
    let snap = registry.snapshot();
    serde_json::to_value(snap).map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_preferences(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::WebviewUrl;
    use tauri::WebviewWindowBuilder;

    if let Some(window) = app.get_webview_window("preferences") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        "preferences",
        WebviewUrl::App("preferences.html".into()),
    )
    .title("Snapfzz Preferences")
    .inner_size(720.0, 560.0)
    .min_inner_size(600.0, 400.0)
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

fn settings_path() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".snapfzz-global").join("settings.json")
}

fn pid_file_path() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".snapfzz-global").join("agent.pid")
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
    if let Some(proc) = sys.process(SysPid::from_u32(pid)) { proc.kill(); }
    let _ = fs::remove_file(&path);
}

fn write_pid_file(pid: u32) {
    let path = pid_file_path();
    if let Some(parent) = path.parent() { let _ = fs::create_dir_all(parent); }
    let _ = fs::write(&path, pid.to_string());
}

fn remove_pid_file() { let _ = fs::remove_file(pid_file_path()); }

async fn spawn_runtime(
    registry: &Arc<BudgetRegistry>,
    runtime: &Arc<Mutex<RuntimeState>>,
) -> Result<(), String> {
    cleanup_stale_pid();
    let intelligence_dir = resolve_intelligence_dir()?;

    let child = tokio::process::Command::new("uv")
        .args(["run", "python", "app.py"])
        .current_dir(intelligence_dir)
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| e.to_string())?;

    let child_pid = child.id().unwrap_or(0);
    write_pid_file(child_pid);

    {
        let mut guard = runtime.lock().await;
        guard.child = Some(child);
        guard.child_pid = Some(child_pid);
    }

    registry.register_process("agentscope", ProcessBudget {
        pid: Some(child_pid),
        max_memory_mb: registry.preset.memory.agentscope_max_mb,
        health_url: format!("http://127.0.0.1:{AGENTSCOPE_PORT}/health"),
        health_interval_ms: 2000,
        max_health_failures: 3,
        max_restarts: registry.preset.reliability.max_restarts,
        location: ProcessLocation::Local,
        consecutive_failures: 0,
        restart_count: 0,
    });

    for _ in 0..120 {
        tokio::time::sleep(Duration::from_millis(1000)).await;
        if registry.supervised.check_health("agentscope").await {
            eprintln!("[budget] AgentScope Runtime healthy on port {AGENTSCOPE_PORT}");
            return Ok(());
        }
    }
    Err("AgentScope Runtime did not become healthy within 120s".to_string())
}

async fn shutdown_runtime(runtime: &Arc<Mutex<RuntimeState>>) {
    let mut guard = runtime.lock().await;
    if let Some(mut child) = guard.child.take() { let _ = child.kill().await; }
    guard.child_pid = None;
    remove_pid_file();
}

fn main() {
    let registry = Arc::new(BudgetRegistry::from_hardware());
    eprintln!("[budget] preset: {} (frame={}ms, cpu={}, mem={}MB)",
        registry.preset.name, registry.frame_target(),
        registry.preset.cpu.permits, registry.preset.memory.agentscope_max_mb);

    let runtime_state = Arc::new(Mutex::new(RuntimeState { child: None, child_pid: None }));

    let setup_registry = registry.clone();
    let setup_runtime = runtime_state.clone();

    tauri::Builder::default()
        .manage(registry.clone())
        .manage(runtime_state.clone())
        .invoke_handler(tauri::generate_handler![
            send_message,
            stop_generation,
            create_session,
            load_session,
            agent_health,
            get_settings,
            save_settings,
            get_frame_target,
            get_startup_budget,
            budget_record_strike,
            budget_report_violation,
            budget_snapshot,
            open_preferences,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let reg = setup_registry.clone();
            let rt = setup_runtime.clone();

            tauri::async_runtime::spawn(async move {
                if let Err(e) = spawn_runtime(&reg, &rt).await {
                    eprintln!("[budget] {e}");
                }
                let _ = handle.emit("agent-status", "online");
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running snapfzz")
        .run(move |_app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                let rt = runtime_state.clone();
                tauri::async_runtime::block_on(shutdown_runtime(&rt));
                eprintln!("[budget] shutdown complete");
            }
        });
}
