use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use snapfzz_kernel::budget::BudgetRegistry;
use snapfzz_kernel::settings::SettingsManager;
use snapfzz_stream::{send_and_consume, ContentBlockBatch, MessageResult, StreamError};
use std::sync::Arc;
use tauri::ipc::Channel;

use crate::helpers;

pub(crate) fn stream_process_url(settings_mgr: &SettingsManager) -> String {
    format!("{}/process", helpers::agentscope_base_url(settings_mgr))
}

pub(crate) fn stream_stop_url(settings_mgr: &SettingsManager) -> String {
    format!("{}/stop", helpers::agentscope_base_url(settings_mgr))
}

pub(crate) fn stream_session_url(settings_mgr: &SettingsManager) -> String {
    format!("{}/session", helpers::agentscope_base_url(settings_mgr))
}

pub(crate) fn stream_load_session_url(settings_mgr: &SettingsManager, session_id: &str) -> String {
    format!("{}/session/{session_id}", helpers::agentscope_base_url(settings_mgr))
}

pub(crate) fn acquire_stream_permits(
    registry: &BudgetRegistry,
    plugin_id: Option<&str>,
) -> Result<(), String> {
    let caller = plugin_id.unwrap_or("unknown");
    let _invoke = registry
        .try_acquire_invoke(caller)
        .ok_or_else(|| format!("Budget exhausted: plugin '{caller}' invoke denied"))?;
    let _cpu = registry
        .try_acquire_cpu()
        .ok_or_else(|| "Budget exhausted: CPU permits unavailable for SSE parsing".to_string())?;
    Ok(())
}

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
    acquire_stream_permits(&registry, plugin_id.as_deref())?;

    send_and_consume(
        &stream_process_url(&settings_mgr),
        &text,
        &session_id,
        registry.batch_rate(),
        |batch| on_token.send(batch).map_err(|e| StreamError::ChannelSend(e.to_string())),
    )
    .await
    .map_err(|e| e.to_string())
}

pub(crate) fn create_session_request(
    client: &reqwest::Client,
    url: &str,
    template_id: Option<String>,
) -> reqwest::RequestBuilder {
    match template_id {
        Some(template_id) => client.post(url).json(&json!({"template_id": template_id})),
        None => client.post(url),
    }
}

pub(crate) async fn do_stop_generation(url: &str, session_id: String) -> Result<(), String> {
    reqwest::Client::new()
        .post(url)
        .json(&json!({"session_id": session_id}))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) async fn do_create_session(
    url: &str,
    template_id: Option<String>,
) -> Result<SessionInfo, String> {
    let client = reqwest::Client::new();
    let request = create_session_request(&client, url, template_id);

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

pub(crate) async fn do_load_session(url: &str) -> Result<Value, String> {
    reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_generation(
    session_id: String,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
) -> Result<(), String> {
    do_stop_generation(&stream_stop_url(&settings_mgr), session_id).await
}

#[tauri::command]
pub async fn create_session(
    template_id: Option<String>,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
) -> Result<SessionInfo, String> {
    do_create_session(&stream_session_url(&settings_mgr), template_id).await
}

#[tauri::command]
pub async fn load_session(
    session_id: String,
    settings_mgr: tauri::State<'_, Arc<SettingsManager>>,
) -> Result<Value, String> {
    do_load_session(&stream_load_session_url(&settings_mgr, &session_id)).await
}

#[cfg(test)]
mod tests {
    use snapfzz_kernel::budget::{preset::PresetName, BudgetRegistry};
    use snapfzz_kernel::settings::SettingsManager;
    use std::sync::Arc;
    use tauri::{
        ipc::{Channel, InvokeResponseBody},
        test::{mock_builder, mock_context, noop_assets},
        Manager,
    };

    #[test]
    fn a014_commands_stream_acquire_stream_permits_rejects_disabled_plugin() {
        let registry = BudgetRegistry::with_preset_name(PresetName::Performance);
        registry.record_strike("plugin.test");
        registry.record_strike("plugin.test");
        registry.record_strike("plugin.test");

        let err = super::acquire_stream_permits(&registry, Some("plugin.test"))
            .expect_err("disabled plugin should be denied");
        assert!(err.contains("Budget exhausted"));
        assert!(err.contains("plugin 'plugin.test' invoke denied"));
    }

    #[test]
    fn a014_commands_stream_acquire_stream_permits_uses_unknown_default_plugin_id() {
        let registry = BudgetRegistry::with_preset_name(PresetName::Performance);
        registry.record_strike("unknown");
        registry.record_strike("unknown");
        registry.record_strike("unknown");

        let err = super::acquire_stream_permits(&registry, None)
            .expect_err("unknown plugin should be denied");
        assert!(err.contains("plugin 'unknown' invoke denied"));
    }

    #[test]
    fn a014_commands_stream_url_helpers_build_expected_routes() {
        let temp = tempfile::tempdir().expect("tempdir");
        let settings_mgr = SettingsManager::new(temp.path().to_path_buf());

        assert_eq!(
            super::stream_process_url(&settings_mgr),
            "http://127.0.0.1:8090/process"
        );
        assert_eq!(
            super::stream_stop_url(&settings_mgr),
            "http://127.0.0.1:8090/stop"
        );
        assert_eq!(
            super::stream_session_url(&settings_mgr),
            "http://127.0.0.1:8090/session"
        );
        assert_eq!(
            super::stream_load_session_url(&settings_mgr, "session-1"),
            "http://127.0.0.1:8090/session/session-1"
        );
    }

    #[test]
    fn a014_commands_stream_url_helpers_honor_custom_host_and_port_settings() {
        let temp = tempfile::tempdir().expect("tempdir");
        let settings_mgr = SettingsManager::new(temp.path().to_path_buf());
        let mut settings = snapfzz_kernel::settings::Settings::default();
        settings.agentscope_host = "0.0.0.0".to_string();
        settings.agentscope_port = "9150".to_string();
        settings_mgr.save(&settings).expect("save settings");

        assert_eq!(
            super::stream_process_url(&settings_mgr),
            "http://0.0.0.0:9150/process"
        );
        assert_eq!(
            super::stream_stop_url(&settings_mgr),
            "http://0.0.0.0:9150/stop"
        );
        assert_eq!(
            super::stream_session_url(&settings_mgr),
            "http://0.0.0.0:9150/session"
        );
    }

    #[test]
    fn a014_commands_stream_send_message_rejects_when_invoke_budget_exhausted() {
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Performance));
        registry.record_strike("plugin.test");
        registry.record_strike("plugin.test");
        registry.record_strike("plugin.test");

        let temp = tempfile::tempdir().expect("tempdir");
        let settings_mgr = Arc::new(SettingsManager::new(temp.path().to_path_buf()));
        let app = mock_builder()
            .manage(registry)
            .manage(settings_mgr)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let channel = Channel::new(|_payload: InvokeResponseBody| Ok(()));

        let err = tauri::async_runtime::block_on(super::send_message(
            "hello".to_string(),
            "session-1".to_string(),
            Some("plugin.test".to_string()),
            channel,
            app.state::<Arc<BudgetRegistry>>(),
            app.state::<Arc<SettingsManager>>(),
        ))
        .expect_err("disabled plugin should be denied");

        assert!(err.contains("Budget exhausted"));
        assert!(err.contains("plugin 'plugin.test' invoke denied"));
    }

    #[test]
    fn a014_commands_stream_send_message_uses_unknown_plugin_when_id_missing() {
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Performance));
        registry.record_strike("unknown");
        registry.record_strike("unknown");
        registry.record_strike("unknown");

        let temp = tempfile::tempdir().expect("tempdir");
        let settings_mgr = Arc::new(SettingsManager::new(temp.path().to_path_buf()));
        let app = mock_builder()
            .manage(registry)
            .manage(settings_mgr)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let channel = Channel::new(|_payload: InvokeResponseBody| Ok(()));

        let err = tauri::async_runtime::block_on(super::send_message(
            "hello".to_string(),
            "session-1".to_string(),
            None,
            channel,
            app.state::<Arc<BudgetRegistry>>(),
            app.state::<Arc<SettingsManager>>(),
        ))
        .expect_err("unknown plugin should be denied");

        assert!(err.contains("plugin 'unknown' invoke denied"));
    }

    #[test]
    fn a014_commands_stream_stop_load_and_create_fail_cleanly_without_server() {
        let temp = tempfile::tempdir().expect("tempdir");
        let registry = Arc::new(BudgetRegistry::with_preset_name(PresetName::Balanced));
        let settings_mgr = Arc::new(SettingsManager::new(temp.path().to_path_buf()));
        let app = mock_builder()
            .manage(registry)
            .manage(settings_mgr)
            .build(mock_context(noop_assets()))
            .expect("build app");

        let stop_error = tauri::async_runtime::block_on(super::stop_generation(
            "session-1".to_string(),
            app.state::<Arc<SettingsManager>>(),
        ))
        .expect_err("stop_generation should fail without server");
        assert!(!stop_error.is_empty());

        let load_error = tauri::async_runtime::block_on(super::load_session(
            "session-1".to_string(),
            app.state::<Arc<SettingsManager>>(),
        ))
        .expect_err("load_session should fail without server");
        assert!(!load_error.is_empty());

        let create_error = tauri::async_runtime::block_on(super::create_session(
            Some("template-a".to_string()),
            app.state::<Arc<SettingsManager>>(),
        ))
        .expect_err("create_session should fail without server");
        assert!(!create_error.is_empty());
    }

    #[test]
    fn a014_commands_stream_session_info_accepts_alias_fields() {
        let parsed_alias = serde_json::from_value::<super::SessionInfo>(serde_json::json!({
            "session_id": "abc-123"
        }))
        .expect("deserialize session alias");
        let raw = serde_json::to_value(&parsed_alias).expect("serialize session info");
        assert_eq!(raw.get("sessionId").and_then(|v| v.as_str()), Some("abc-123"));
    }

    #[test]
    fn a014_commands_stream_session_info_accepts_camel_case_input() {
        let parsed = serde_json::from_value::<super::SessionInfo>(serde_json::json!({
            "sessionId": "camel-case-id"
        }))
        .expect("deserialize camelCase session info");
        let raw = serde_json::to_value(&parsed).expect("serialize session info");
        assert_eq!(
            raw.get("sessionId").and_then(|v| v.as_str()),
            Some("camel-case-id")
        );
    }

    #[test]
    fn a014_commands_stream_create_session_request_without_template_has_no_body() {
        let client = reqwest::Client::new();
        let request = super::create_session_request(&client, "http://127.0.0.1:8090/session", None)
            .build()
            .expect("build request");

        assert_eq!(request.method(), reqwest::Method::POST);
        assert_eq!(request.url().as_str(), "http://127.0.0.1:8090/session");
        assert!(request.body().is_none());
    }

    #[test]
    fn a014_commands_stream_create_session_request_with_template_serializes_payload() {
        let client = reqwest::Client::new();
        let request = super::create_session_request(
            &client,
            "http://127.0.0.1:8090/session",
            Some("template-a".to_string()),
        )
        .build()
        .expect("build request");

        let body = request
            .body()
            .and_then(|body| body.as_bytes())
            .expect("json body bytes");
        let parsed: serde_json::Value = serde_json::from_slice(body).expect("parse json body");
        assert_eq!(parsed["template_id"], "template-a");
    }

    #[tokio::test]
    async fn a014_commands_stream_do_stop_generation_surfaces_network_error() {
        let err = super::do_stop_generation(
            "http://127.0.0.1:9/stop",
            "session-1".to_string(),
        )
        .await
        .expect_err("stop should fail without server");
        assert!(!err.is_empty());
    }

    #[tokio::test]
    async fn a014_commands_stream_do_create_session_surfaces_network_error() {
        let err = super::do_create_session("http://127.0.0.1:9/session", None)
            .await
            .expect_err("create should fail without server");
        assert!(!err.is_empty());
    }

    #[tokio::test]
    async fn a014_commands_stream_do_load_session_surfaces_network_error() {
        let err = super::do_load_session("http://127.0.0.1:9/session/session-1")
            .await
            .expect_err("load should fail without server");
        assert!(!err.is_empty());
    }
}
