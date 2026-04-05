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
use tauri::{Manager, RunEvent};
use tokio::sync::Mutex;

const AGENTSCOPE_PORT: u16 = 8090;
const TOKEN_BATCH_MS: u64 = 16;
const HEALTH_TIMEOUT_SECS: u64 = 2;

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

struct AgentSupervisorState {
    child: Option<tokio::process::Child>,
    child_pid: Option<u32>,
    port: u16,
}


#[tauri::command]
async fn send_message(
    text: String,
    session_id: String,
    on_token: Channel<ContentBlockBatch>,
    state: tauri::State<'_, Arc<Mutex<AgentSupervisorState>>>,
) -> Result<MessageResult, String> {
    let port = {
        let guard = state.lock().await;
        guard.port
    };

    let url = format!("http://127.0.0.1:{port}/process");
    let client = reqwest::Client::new();

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
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;

    let mut stream = response.bytes_stream();
    let mut line_buffer = String::new();
    let mut event_data_lines: Vec<String> = Vec::new();

    let mut pending_blocks: Vec<Value> = Vec::new();
    let mut batch_id: u32 = 0;
    let mut batch_token_count: usize = 0;
    let mut total_tokens: usize = 0;
    let mut finish_reason: String = "stop".to_string();
    let mut message_id: Option<String> = None;
    let mut batch_start = Instant::now();
    let mut stream_finished = false;

    'stream: while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|error| error.to_string())?;
        line_buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(newline_index) = line_buffer.find('\n') {
            let mut line = line_buffer[..newline_index].to_string();
            line_buffer.drain(..=newline_index);

            if line.ends_with('\r') {
                line.pop();
            }

            if line.is_empty() {
                if event_data_lines.is_empty() {
                    continue;
                }

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
                    .get("finish_reason")
                    .and_then(Value::as_str)
                    .or_else(|| {
                        payload_value
                            .get("metadata")
                            .and_then(|metadata| metadata.get("finish_reason"))
                            .and_then(Value::as_str)
                    })
                {
                    finish_reason = reason.to_string();
                }

                let mut extracted_blocks = extract_content_blocks(&payload_value);
                if extracted_blocks.is_empty() {
                    extracted_blocks.push(payload_value);
                }

                batch_token_count += extracted_blocks.len();
                total_tokens += extracted_blocks.len();
                pending_blocks.extend(extracted_blocks);

                // Per A001/Performance: flush token batch every 16ms (1 frame budget)
                if batch_start.elapsed() >= Duration::from_millis(TOKEN_BATCH_MS) {
                    flush_content_block_batch(
                        &on_token,
                        &session_id,
                        &mut pending_blocks,
                        &mut batch_id,
                        &mut batch_token_count,
                        false,
                    )?;
                    batch_start = Instant::now();
                }

                continue;
            }

            if line.starts_with(':') {
                continue;
            }

            if let Some(data) = line.strip_prefix("data:") {
                event_data_lines.push(data.trim_start().to_string());
            }
        }
    }

    if !event_data_lines.is_empty() {
        let payload = event_data_lines.join("\n");
        if payload != "[DONE]" {
            let payload_value =
                serde_json::from_str::<Value>(&payload).unwrap_or_else(|_| json!({ "type": "text", "text": payload }));
            let mut extracted_blocks = extract_content_blocks(&payload_value);
            if extracted_blocks.is_empty() {
                extracted_blocks.push(payload_value);
            }
            batch_token_count += extracted_blocks.len();
            total_tokens += extracted_blocks.len();
            pending_blocks.extend(extracted_blocks);
        } else {
            stream_finished = true;
        }
    }

    if !pending_blocks.is_empty() {
        flush_content_block_batch(
            &on_token,
            &session_id,
            &mut pending_blocks,
            &mut batch_id,
            &mut batch_token_count,
            false,
        )?;
    }

    if stream_finished {
        flush_content_block_batch(
            &on_token,
            &session_id,
            &mut pending_blocks,
            &mut batch_id,
            &mut batch_token_count,
            true,
        )?;
    }

    Ok(MessageResult {
        id: message_id.unwrap_or_else(uuid_string),
        total_tokens,
        finish_reason,
    })
}

#[tauri::command]
async fn stop_generation(
    session_id: String,
    state: tauri::State<'_, Arc<Mutex<AgentSupervisorState>>>,
) -> Result<(), String> {
    let port = {
        let guard = state.lock().await;
        guard.port
    };

    let url = format!("http://127.0.0.1:{port}/stop");
    reqwest::Client::new()
        .post(&url)
        .json(&json!({ "session_id": session_id }))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
async fn create_session(
    template_id: Option<String>,
    state: tauri::State<'_, Arc<Mutex<AgentSupervisorState>>>,
) -> Result<SessionInfo, String> {
    let port = {
        let guard = state.lock().await;
        guard.port
    };

    let url = format!("http://127.0.0.1:{port}/session");
    let client = reqwest::Client::new();
    let request = match template_id {
        Some(template_id) => client.post(&url).json(&json!({ "template_id": template_id })),
        None => client.post(&url),
    };

    request
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<SessionInfo>()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn load_session(
    session_id: String,
    state: tauri::State<'_, Arc<Mutex<AgentSupervisorState>>>,
) -> Result<Value, String> {
    let port = {
        let guard = state.lock().await;
        guard.port
    };

    let url = format!("http://127.0.0.1:{port}/session/{session_id}");
    reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn agent_health(
    state: tauri::State<'_, Arc<Mutex<AgentSupervisorState>>>,
) -> Result<HealthStatus, String> {
    let (port, child_running) = {
        let mut guard = state.lock().await;
        let child_running = match guard.child.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(None) => true,
                Ok(Some(_)) | Err(_) => {
                    guard.child = None;
                    false
                }
            },
            None => false,
        };

        (guard.port, child_running)
    };

    // Per A005/AgentSupervisor: health is checked with a 2s poll window
    let url = format!("http://127.0.0.1:{port}/health");
    let status = match reqwest::Client::new()
        .get(&url)
        .timeout(Duration::from_secs(HEALTH_TIMEOUT_SECS))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => "connected",
        _ if child_running => "reconnecting",
        _ => "disconnected",
    };

    Ok(HealthStatus {
        status: status.to_string(),
    })
}

#[tauri::command]
async fn get_settings() -> Result<Settings, String> {
    let path = settings_path();

    if !path.exists() {
        return Ok(Settings::default());
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    serde_json::from_str::<Settings>(&content).map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_settings(settings: Settings) -> Result<(), String> {
    let path = settings_path();

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let content = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(&path, content).map_err(|error| error.to_string())
}

fn extract_content_blocks(payload: &Value) -> Vec<Value> {
    if let Some(content_blocks) = payload.get("content_blocks").and_then(Value::as_array) {
        return content_blocks.to_vec();
    }

    if let Some(content_blocks) = payload
        .get("delta")
        .and_then(|delta| delta.get("content_blocks"))
        .and_then(Value::as_array)
    {
        return content_blocks.to_vec();
    }

    if let Some(content) = payload.get("content").and_then(Value::as_array) {
        return content.to_vec();
    }

    if let Some(delta_text) = payload
        .get("delta")
        .and_then(|delta| delta.get("content"))
        .and_then(Value::as_str)
    {
        return vec![json!({ "type": "text", "text": delta_text })];
    }

    if let Some(choice_text) = payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("delta"))
        .and_then(|delta| delta.get("content"))
        .and_then(Value::as_str)
    {
        return vec![json!({ "type": "text", "text": choice_text })];
    }

    Vec::new()
}

fn flush_content_block_batch(
    on_token: &Channel<ContentBlockBatch>,
    session_id: &str,
    pending_blocks: &mut Vec<Value>,
    batch_id: &mut u32,
    batch_token_count: &mut usize,
    done: bool,
) -> Result<(), String> {
    if pending_blocks.is_empty() && !done {
        return Ok(());
    }

    on_token
        .send(ContentBlockBatch {
            session_id: session_id.to_string(),
            batch_id: *batch_id,
            token_count: *batch_token_count,
            blocks: std::mem::take(pending_blocks),
            done,
        })
        .map_err(|error| error.to_string())?;

    *batch_id += 1;
    *batch_token_count = 0;

    Ok(())
}

fn settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".snapfzz-global")
        .join("settings.json")
}

fn uuid_string() -> String {
    format!(
        "{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    )
}

fn pid_file_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".snapfzz-global")
        .join("agent.pid")
}

fn resolve_intelligence_dir() -> Result<PathBuf, String> {
    let current_dir = std::env::current_dir().map_err(|e| e.to_string())?;
    for candidate in &[
        current_dir.join("intelligence"),
        current_dir.join("..").join("intelligence"),
        current_dir.join("..").join("..").join("intelligence"),
    ] {
        if candidate.join("pyproject.toml").exists() {
            return Ok(candidate.clone());
        }
    }
    Err("Unable to find intelligence/ directory".to_string())
}

fn cleanup_stale_pid() {
    let path = pid_file_path();
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return,
    };
    let pid: u32 = match content.trim().parse() {
        Ok(p) => p,
        Err(_) => { let _ = fs::remove_file(&path); return; }
    };
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::Some(&[SysPid::from_u32(pid)]), true);
    if let Some(proc) = sys.process(SysPid::from_u32(pid)) {
        proc.kill();
    }
    let _ = fs::remove_file(&path);
}

fn write_pid_file(pid: u32) {
    let path = pid_file_path();
    if let Some(parent) = path.parent() { let _ = fs::create_dir_all(parent); }
    let _ = fs::write(&path, pid.to_string());
}

fn remove_pid_file() {
    let _ = fs::remove_file(pid_file_path());
}

async fn spawn_runtime(state: Arc<Mutex<AgentSupervisorState>>) -> Result<(), String> {
    cleanup_stale_pid();
    let intelligence_dir = resolve_intelligence_dir()?;
    let port = state.lock().await.port;

    let child = tokio::process::Command::new("uv")
        .args(["run", "python", "app.py"])
        .current_dir(intelligence_dir)
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| e.to_string())?;

    let child_pid = child.id().unwrap_or(0);
    write_pid_file(child_pid);

    let mut guard = state.lock().await;
    guard.child = Some(child);
    guard.child_pid = Some(child_pid);
    drop(guard);

    for _ in 0..120 {
        tokio::time::sleep(Duration::from_millis(1000)).await;
        if reqwest::Client::new()
            .get(format!("http://127.0.0.1:{port}/health"))
            .timeout(Duration::from_secs(2))
            .send().await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
        {
            eprintln!("[supervisor] AgentScope Runtime healthy on port {port}");
            return Ok(());
        }
    }
    Err("AgentScope Runtime did not become healthy within 120s".to_string())
}

async fn shutdown_runtime(state: &Arc<Mutex<AgentSupervisorState>>) {
    let mut guard = state.lock().await;
    if let Some(mut child) = guard.child.take() {
        let _ = child.kill().await;
    }
    guard.child_pid = None;
    remove_pid_file();
}

fn main() {
    let supervisor_state = Arc::new(Mutex::new(AgentSupervisorState {
        child: None,
        child_pid: None,
        port: AGENTSCOPE_PORT,
    }));

    let setup_state = supervisor_state.clone();

    tauri::Builder::default()
        .manage(supervisor_state.clone())
        .invoke_handler(tauri::generate_handler![
            send_message,
            stop_generation,
            create_session,
            load_session,
            agent_health,
            get_settings,
            save_settings,
        ])
        .setup(move |_app| {
            tauri::async_runtime::spawn(async move {
                if let Err(e) = spawn_runtime(setup_state).await {
                    eprintln!("[supervisor] {e}");
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running snapfzz")
        .run(move |app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                let state = app_handle
                    .state::<Arc<Mutex<AgentSupervisorState>>>()
                    .inner()
                    .clone();
                tauri::async_runtime::block_on(shutdown_runtime(&state));
            }
        });
}
