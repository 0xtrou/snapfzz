#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::ipc::Channel;
use tokio::sync::Mutex;

const AGENTSCOPE_PORT: u16 = 8000;
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

#[derive(Default)]
struct AgentSupervisorState {
    child: Option<tokio::process::Child>,
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

    let url = format!("http://127.0.0.1:{port}/chat");
    let client = reqwest::Client::new();

    let response = client
        .post(&url)
        .json(&json!({
            "text": text,
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

fn resolve_intelligence_dir() -> Result<PathBuf, String> {
    let current_dir = std::env::current_dir().map_err(|error| error.to_string())?;

    let mut candidates = vec![
        current_dir.join("intelligence"),
        current_dir.join("..").join("intelligence"),
        current_dir.join("..").join("..").join("intelligence"),
    ];

    if let Some(parent) = current_dir.parent() {
        candidates.push(parent.join("intelligence"));
    }

    for candidate in candidates {
        if candidate.join("pyproject.toml").exists() {
            return Ok(candidate);
        }
    }

    Err("Unable to find intelligence/ directory for AgentScope startup".to_string())
}

async fn spawn_agentscope_process(
    state: Arc<Mutex<AgentSupervisorState>>,
) -> Result<(), String> {
    let intelligence_dir = resolve_intelligence_dir()?;

    let mut guard = state.lock().await;

    if let Some(child) = guard.child.as_mut() {
        if child.try_wait().map_err(|error| error.to_string())?.is_none() {
            return Ok(());
        }
        guard.child = None;
    }

    // Per A005/AgentSupervisor: start AgentScope via uv on app launch
    let child = tokio::process::Command::new("uv")
        .args([
            "run",
            "uvicorn",
            "server:app",
            "--host",
            "127.0.0.1",
            "--port",
            &guard.port.to_string(),
        ])
        .current_dir(intelligence_dir)
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| error.to_string())?;

    guard.child = Some(child);

    Ok(())
}

fn main() {
    let supervisor_state = Arc::new(Mutex::new(AgentSupervisorState {
        child: None,
        port: AGENTSCOPE_PORT,
    }));

    tauri::Builder::default()
        .manage(supervisor_state.clone())
        .invoke_handler(tauri::generate_handler![
            // Per A006/CoreRuntime: Tauri commands are the typed Rust IPC bridge
            send_message,
            stop_generation,
            create_session,
            load_session,
            agent_health,
            get_settings,
            save_settings,
        ])
        .setup(move |_app| {
            let startup_state = supervisor_state.clone();
            tauri::async_runtime::spawn(async move {
                // Per A002/Zone1: process supervision and SSE pipeline live in Rust
                // Per A002/Zone1: SSE parsing happens in Rust, never on JS main thread
                if let Err(error) = spawn_agentscope_process(startup_state).await {
                    eprintln!("failed to start AgentScope via uv: {error}");
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running snapfzz");
}
