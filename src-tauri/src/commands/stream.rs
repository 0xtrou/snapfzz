use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use snapfzz_kernel::budget::BudgetRegistry;
use snapfzz_kernel::settings::SettingsManager;
use snapfzz_stream::{send_and_consume, ContentBlockBatch, MessageResult, StreamError};
use std::sync::Arc;
use tauri::ipc::Channel;

use crate::helpers;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    #[serde(alias = "session_id", alias = "sessionId")]
    session_id: String,
}

#[tauri::command]
pub async fn send_message(
    text: String,
    session_id: String,
    plugin_id: Option<String>,
    on_token: Channel<ContentBlockBatch>,
    registry: tauri::State<'_, Arc<BudgetRegistry>>,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
) -> Result<MessageResult, String> {
    let caller = plugin_id.as_deref().unwrap_or("unknown");
    let _invoke = registry
        .try_acquire_invoke(caller)
        .ok_or_else(|| format!("Budget exhausted: plugin '{caller}' invoke denied"))?;
    let _cpu = registry
        .try_acquire_cpu()
        .ok_or_else(|| "Budget exhausted: CPU permits unavailable for SSE parsing".to_string())?;

    send_and_consume(
        &format!("{}/process", helpers::agentscope_base_url(&settings_mgr)),
        &text,
        &session_id,
        registry.batch_rate(),
        |batch| on_token.send(batch).map_err(|e| StreamError::ChannelSend(e.to_string())),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_generation(
    session_id: String,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
) -> Result<(), String> {
    reqwest::Client::new()
        .post(format!(
            "{}/stop",
            helpers::agentscope_base_url(&settings_mgr)
        ))
        .json(&json!({"session_id": session_id}))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn create_session(
    template_id: Option<String>,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
) -> Result<SessionInfo, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/session", helpers::agentscope_base_url(&settings_mgr));
    let request = match template_id {
        Some(template_id) => client.post(&url).json(&json!({"template_id": template_id})),
        None => client.post(&url),
    };

    request
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json::<SessionInfo>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_session(
    session_id: String,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
) -> Result<Value, String> {
    reqwest::Client::new()
        .get(format!(
            "{}/session/{session_id}",
            helpers::agentscope_base_url(&settings_mgr)
        ))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn a014_commands_stream_module_exports_send_message() {
        let _send = super::send_message;
        let _stop = super::stop_generation;
        let _create = super::create_session;
        let _load = super::load_session;
    }
}
