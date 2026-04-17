// Per A013/Orchestrator: the `orchestrator` combo is a system-level LiteLLM entry
// managed by Rust. Boot ensures it exists once LiteLLM is healthy; the frontend's
// ModelPicker mutates its underlying target via a Tauri command (never by hitting
// LiteLLM directly with the master key).

use reqwest::Client;
use serde::Deserialize;

use crate::LlmError;

/// The stable combo name the orchestrator agent always asks for. Swapping the
/// underlying target = single LiteLLM `/model/update` call — no agent reload.
pub const ORCHESTRATOR_COMBO_NAME: &str = "orchestrator";

#[derive(Debug, Deserialize)]
struct ModelInfoResponse {
    data: Vec<ModelInfoEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModelInfoEntry {
    pub model_name: String,
    #[serde(default)]
    pub litellm_params: Option<LiteLLMParamsView>,
    #[serde(default)]
    pub model_info: Option<ModelInfoMeta>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LiteLLMParamsView {
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub api_base: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ModelInfoMeta {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub snapfzz_combo: Option<bool>,
    #[serde(default)]
    pub snapfzz_system_combo: Option<bool>,
}

fn http_error(err: impl std::fmt::Display) -> LlmError {
    LlmError::Message(format!("LiteLLM HTTP error: {err}"))
}

async fn list_models(base_url: &str, master_key: &str) -> Result<Vec<ModelInfoEntry>, LlmError> {
    let client = Client::new();
    let res = client
        .get(format!("{base_url}/v1/model/info"))
        .bearer_auth(master_key)
        .send()
        .await
        .map_err(http_error)?
        .error_for_status()
        .map_err(http_error)?;
    let parsed: ModelInfoResponse = res.json().await.map_err(http_error)?;
    Ok(parsed.data)
}

fn find_combo_id(models: &[ModelInfoEntry], name: &str) -> Option<String> {
    models
        .iter()
        .find(|m| m.model_name == name)
        .and_then(|m| m.model_info.as_ref())
        .and_then(|info| info.id.clone())
}

/// First entry that is neither the orchestrator combo nor another combo marker.
/// Used as the default target when bootstrapping a fresh LiteLLM gateway.
fn find_first_non_combo(models: &[ModelInfoEntry]) -> Option<&ModelInfoEntry> {
    models.iter().find(|m| {
        if m.model_name == ORCHESTRATOR_COMBO_NAME {
            return false;
        }
        let info = m.model_info.as_ref();
        let is_combo = info
            .map(|i| i.snapfzz_combo == Some(true) || i.snapfzz_system_combo == Some(true))
            .unwrap_or(false);
        !is_combo
    })
}

fn build_litellm_params(model: &str, api_base: Option<&str>, api_key: &str) -> serde_json::Value {
    let mut params = serde_json::json!({ "model": model, "api_key": api_key });
    if let Some(base) = api_base {
        params["api_base"] = serde_json::json!(base);
    }
    params
}

async fn create_combo(
    client: &Client,
    base_url: &str,
    master_key: &str,
    name: &str,
    target_model: &str,
    api_base: Option<&str>,
    api_key: &str,
) -> Result<(), LlmError> {
    let body = serde_json::json!({
        "model_name": name,
        "litellm_params": build_litellm_params(target_model, api_base, api_key),
        "model_info": { "snapfzz_system_combo": true },
    });
    client
        .post(format!("{base_url}/model/new"))
        .bearer_auth(master_key)
        .json(&body)
        .send()
        .await
        .map_err(http_error)?
        .error_for_status()
        .map_err(http_error)?;
    Ok(())
}

async fn update_combo_target(
    client: &Client,
    base_url: &str,
    master_key: &str,
    combo_id: &str,
    target_model: &str,
    api_base: Option<&str>,
    api_key: &str,
) -> Result<(), LlmError> {
    let body = serde_json::json!({
        "id": combo_id,
        "litellm_params": build_litellm_params(target_model, api_base, api_key),
    });
    client
        .post(format!("{base_url}/model/update"))
        .bearer_auth(master_key)
        .json(&body)
        .send()
        .await
        .map_err(http_error)?
        .error_for_status()
        .map_err(http_error)?;
    Ok(())
}

/// Summary of an ensure/update result — callers log this, boot must not fail on it.
#[derive(Debug, PartialEq, Eq)]
pub enum EnsureOutcome {
    /// Combo already existed; no change.
    AlreadyPresent,
    /// Combo created with the given target model.
    Created { target: String },
    /// Gateway has no models yet; ModelPicker is the onboarding path.
    NoModelsAvailable,
}

/// Called once at boot after LiteLLM is healthy. Idempotent.
///
/// - If the `orchestrator` combo exists → do nothing.
/// - If no models are configured in the gateway yet → skip; log; return `NoModelsAvailable`.
/// - Otherwise → create the combo pointing at the first available real model.
pub async fn ensure_orchestrator_combo(
    base_url: &str,
    master_key: &str,
) -> Result<EnsureOutcome, LlmError> {
    let models = list_models(base_url, master_key).await?;

    if find_combo_id(&models, ORCHESTRATOR_COMBO_NAME).is_some() {
        return Ok(EnsureOutcome::AlreadyPresent);
    }

    let default = match find_first_non_combo(&models) {
        Some(m) => m,
        None => return Ok(EnsureOutcome::NoModelsAvailable),
    };

    let params = default.litellm_params.as_ref();
    let target_model = params
        .and_then(|p| p.model.clone())
        .ok_or_else(|| LlmError::Message("default model has no litellm_params.model".to_string()))?;
    let api_base = params.and_then(|p| p.api_base.clone());
    let api_key = params.and_then(|p| p.api_key.clone()).unwrap_or_default();

    let client = Client::new();
    create_combo(
        &client,
        base_url,
        master_key,
        ORCHESTRATOR_COMBO_NAME,
        &target_model,
        api_base.as_deref(),
        &api_key,
    )
    .await?;

    Ok(EnsureOutcome::Created { target: target_model })
}

/// Called when the user picks a new model in the UI. Resolves the target by its
/// LiteLLM `model_name`, then mutates the combo's `litellm_params` in place. If the
/// combo doesn't exist yet, creates it first.
pub async fn update_orchestrator_combo(
    base_url: &str,
    master_key: &str,
    new_target_model_name: &str,
) -> Result<(), LlmError> {
    let models = list_models(base_url, master_key).await?;

    let target = models
        .iter()
        .find(|m| m.model_name == new_target_model_name)
        .ok_or_else(|| LlmError::Message(format!("model '{new_target_model_name}' not found in gateway")))?;

    let params = target.litellm_params.as_ref();
    let target_model = params
        .and_then(|p| p.model.clone())
        .ok_or_else(|| LlmError::Message(format!("model '{new_target_model_name}' has no litellm_params.model")))?;
    let api_base = params.and_then(|p| p.api_base.clone());
    let api_key = params.and_then(|p| p.api_key.clone()).unwrap_or_default();

    let client = Client::new();

    match find_combo_id(&models, ORCHESTRATOR_COMBO_NAME) {
        Some(combo_id) => {
            update_combo_target(
                &client,
                base_url,
                master_key,
                &combo_id,
                &target_model,
                api_base.as_deref(),
                &api_key,
            )
            .await
        }
        None => {
            create_combo(
                &client,
                base_url,
                master_key,
                ORCHESTRATOR_COMBO_NAME,
                &target_model,
                api_base.as_deref(),
                &api_key,
            )
            .await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{body_json, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn model_info_payload(entries: Vec<serde_json::Value>) -> serde_json::Value {
        serde_json::json!({ "data": entries })
    }

    fn openai_gpt4_entry() -> serde_json::Value {
        serde_json::json!({
            "model_name": "acme/gpt-4",
            "litellm_params": {
                "model": "openai/gpt-4",
                "api_base": "https://api.openai.com/v1",
                "api_key": "sk-real"
            },
            "model_info": { "id": "model-uuid-1" }
        })
    }

    fn orchestrator_combo_entry() -> serde_json::Value {
        serde_json::json!({
            "model_name": ORCHESTRATOR_COMBO_NAME,
            "litellm_params": {
                "model": "openai/gpt-4",
                "api_key": "sk-real"
            },
            "model_info": { "id": "combo-uuid-xyz", "snapfzz_system_combo": true }
        })
    }

    #[tokio::test]
    async fn a013_ensure_returns_already_present_when_combo_exists() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/model/info"))
            .and(header("Authorization", "Bearer sk-master"))
            .respond_with(ResponseTemplate::new(200).set_body_json(model_info_payload(vec![
                openai_gpt4_entry(),
                orchestrator_combo_entry(),
            ])))
            .expect(1)
            .mount(&server)
            .await;

        let outcome = ensure_orchestrator_combo(&server.uri(), "sk-master")
            .await
            .expect("ensure should succeed");
        assert_eq!(outcome, EnsureOutcome::AlreadyPresent);
    }

    #[tokio::test]
    async fn a013_ensure_skips_when_gateway_has_no_models() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/model/info"))
            .respond_with(ResponseTemplate::new(200).set_body_json(model_info_payload(vec![])))
            .expect(1)
            .mount(&server)
            .await;

        let outcome = ensure_orchestrator_combo(&server.uri(), "sk-master")
            .await
            .expect("ensure should succeed");
        assert_eq!(outcome, EnsureOutcome::NoModelsAvailable);
    }

    #[tokio::test]
    async fn a013_ensure_creates_combo_from_first_non_combo_entry() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/model/info"))
            .respond_with(ResponseTemplate::new(200).set_body_json(model_info_payload(vec![
                openai_gpt4_entry(),
            ])))
            .mount(&server)
            .await;

        Mock::given(method("POST"))
            .and(path("/model/new"))
            .and(header("Authorization", "Bearer sk-master"))
            .and(body_json(serde_json::json!({
                "model_name": "orchestrator",
                "litellm_params": {
                    "model": "openai/gpt-4",
                    "api_base": "https://api.openai.com/v1",
                    "api_key": "sk-real"
                },
                "model_info": { "snapfzz_system_combo": true }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "ok": true })))
            .expect(1)
            .mount(&server)
            .await;

        let outcome = ensure_orchestrator_combo(&server.uri(), "sk-master")
            .await
            .expect("ensure should succeed");
        assert!(matches!(outcome, EnsureOutcome::Created { ref target } if target == "openai/gpt-4"));
    }

    #[tokio::test]
    async fn a013_update_mutates_existing_combo_via_model_update() {
        let server = MockServer::start().await;

        // Gateway has a second model the user wants to switch TO, plus the existing combo.
        let anthropic_entry = serde_json::json!({
            "model_name": "anthropic/claude",
            "litellm_params": {
                "model": "anthropic/claude-opus",
                "api_base": "https://api.anthropic.com",
                "api_key": "sk-anthropic"
            },
            "model_info": { "id": "model-uuid-2" }
        });

        Mock::given(method("GET"))
            .and(path("/v1/model/info"))
            .respond_with(ResponseTemplate::new(200).set_body_json(model_info_payload(vec![
                openai_gpt4_entry(),
                anthropic_entry.clone(),
                orchestrator_combo_entry(),
            ])))
            .mount(&server)
            .await;

        // Combo mutation must carry the TARGET model's params (api_base+api_key), not the combo's.
        Mock::given(method("POST"))
            .and(path("/model/update"))
            .and(body_json(serde_json::json!({
                "id": "combo-uuid-xyz",
                "litellm_params": {
                    "model": "anthropic/claude-opus",
                    "api_base": "https://api.anthropic.com",
                    "api_key": "sk-anthropic"
                }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "ok": true })))
            .expect(1)
            .mount(&server)
            .await;

        update_orchestrator_combo(&server.uri(), "sk-master", "anthropic/claude")
            .await
            .expect("update should succeed");
    }

    #[tokio::test]
    async fn a013_update_creates_combo_when_missing() {
        let server = MockServer::start().await;

        // No combo exists yet — user picks the first real model.
        Mock::given(method("GET"))
            .and(path("/v1/model/info"))
            .respond_with(ResponseTemplate::new(200).set_body_json(model_info_payload(vec![
                openai_gpt4_entry(),
            ])))
            .mount(&server)
            .await;

        Mock::given(method("POST"))
            .and(path("/model/new"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "ok": true })))
            .expect(1)
            .mount(&server)
            .await;

        update_orchestrator_combo(&server.uri(), "sk-master", "acme/gpt-4")
            .await
            .expect("update should succeed by creating the combo");
    }

    #[tokio::test]
    async fn a013_update_errors_when_target_model_not_found() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/model/info"))
            .respond_with(ResponseTemplate::new(200).set_body_json(model_info_payload(vec![
                openai_gpt4_entry(),
            ])))
            .mount(&server)
            .await;

        let err = update_orchestrator_combo(&server.uri(), "sk-master", "does-not-exist")
            .await
            .expect_err("unknown target must error");
        assert!(err.to_string().contains("not found"));
    }
}
