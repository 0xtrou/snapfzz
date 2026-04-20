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

// Why the combo carries a raw api_key (not an `os.environ/...` reference):
//
// LiteLLM resolves `os.environ/VAR` via `get_secret()` at request time only for models
// loaded from the yaml config. Models added through `/model/new` / `/model/update` are
// encrypted into the LiteLLM DB (using `LITELLM_SALT_KEY`), decrypted at load into the
// router, and passed directly to the upstream SDK with **no `get_secret()` call** (see
// `litellm/proxy/proxy_server.py` → `_add_db_models_to_router_instance` and
// `litellm/main.py:2045` where `api_key` is consumed verbatim). Embedding an
// `os.environ/...` string would therefore be sent as the literal Bearer token and
// upstream would 401 with "Invalid API key".
//
// So the combo stores a raw api_key pulled from the snapfzz-vault on every mutation.
// That raw key only ever lives encrypted at rest (vault + LiteLLM's DB), and in each
// process' memory at request time.

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
    /// Custom provider id stamped by settings-llm when the model was imported.
    /// Not masked by LiteLLM's `/v1/model/info` (only `api_key`/`client_secret`/
    /// vertex/aws fields are popped). Used to build the `os.environ/...` api_key ref.
    #[serde(default)]
    pub snapfzz_provider_id: Option<String>,
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
    let mut params = serde_json::json!({
        "model": model,
        "api_key": api_key,
    });
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
    provider_id: &str,
    api_key: &str,
) -> Result<(), LlmError> {
    let body = serde_json::json!({
        "model_name": name,
        "litellm_params": build_litellm_params(target_model, api_base, api_key),
        "model_info": {
            "snapfzz_system_combo": true,
            "snapfzz_provider_id": provider_id,
        },
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
    provider_id: &str,
    api_key: &str,
) -> Result<(), LlmError> {
    let body = serde_json::json!({
        "id": combo_id,
        "litellm_params": build_litellm_params(target_model, api_base, api_key),
        "model_info": {
            "id": combo_id,
            "snapfzz_system_combo": true,
            "snapfzz_provider_id": provider_id,
        },
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
///
/// `resolve_raw_key` receives the target's `snapfzz_provider_id` and must return the
/// raw provider api key (typically a snapfzz-vault read). If the vault has no entry
/// for that id, return `Err(...)` so the caller can skip bootstrapping.
pub async fn ensure_orchestrator_combo(
    base_url: &str,
    master_key: &str,
    resolve_raw_key: impl Fn(&str) -> Result<String, LlmError>,
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
    let provider_id = default
        .model_info
        .as_ref()
        .and_then(|m| m.snapfzz_provider_id.clone())
        .ok_or_else(|| {
            LlmError::Message(format!(
                "default model '{}' has no model_info.snapfzz_provider_id — re-add the provider via Settings → LLM",
                default.model_name
            ))
        })?;
    let raw_api_key = resolve_raw_key(&provider_id)?;

    let client = Client::new();
    create_combo(
        &client,
        base_url,
        master_key,
        ORCHESTRATOR_COMBO_NAME,
        &target_model,
        api_base.as_deref(),
        &provider_id,
        &raw_api_key,
    )
    .await?;

    Ok(EnsureOutcome::Created { target: target_model })
}

/// Called when the user picks a new model in the UI. Resolves the target by its
/// LiteLLM `model_name`, then mutates the combo's `litellm_params` in place. If the
/// combo doesn't exist yet, creates it first. `resolve_raw_key` receives the target's
/// `snapfzz_provider_id` and must return the matching raw api key (typically a
/// snapfzz-vault read). LiteLLM will encrypt the key at rest via `LITELLM_SALT_KEY`.
pub async fn update_orchestrator_combo(
    base_url: &str,
    master_key: &str,
    new_target_model_name: &str,
    resolve_raw_key: impl Fn(&str) -> Result<String, LlmError>,
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
    let provider_id = target
        .model_info
        .as_ref()
        .and_then(|m| m.snapfzz_provider_id.clone())
        .ok_or_else(|| {
            LlmError::Message(format!(
                "model '{new_target_model_name}' has no model_info.snapfzz_provider_id — re-add the provider via Settings → LLM"
            ))
        })?;

    let raw_api_key = resolve_raw_key(&provider_id)?;
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
                &provider_id,
                &raw_api_key,
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
                &provider_id,
                &raw_api_key,
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
        // LiteLLM masks `api_key` in /v1/model/info responses, so tests don't include it —
        // the combo code must resolve the provider id (which is preserved) and emit an
        // `os.environ/SNAPFZZ_KEY_<id>` reference instead.
        serde_json::json!({
            "model_name": "acme/gpt-4",
            "litellm_params": {
                "model": "openai/gpt-4",
                "api_base": "https://api.openai.com/v1"
            },
            "model_info": {
                "id": "model-uuid-1",
                "snapfzz_provider_id": "custom-acme"
            }
        })
    }

    fn orchestrator_combo_entry() -> serde_json::Value {
        serde_json::json!({
            "model_name": ORCHESTRATOR_COMBO_NAME,
            "litellm_params": {
                "model": "openai/gpt-4"
            },
            "model_info": {
                "id": "combo-uuid-xyz",
                "snapfzz_system_combo": true,
                "snapfzz_provider_id": "custom-acme"
            }
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

        let outcome = ensure_orchestrator_combo(&server.uri(), "sk-master", |_| Ok("sk-real".to_string()))
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

        let outcome = ensure_orchestrator_combo(&server.uri(), "sk-master", |_| Ok("sk-real".to_string()))
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
                    "api_key": "sk-real-acme"
                },
                "model_info": {
                    "snapfzz_system_combo": true,
                    "snapfzz_provider_id": "custom-acme"
                }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "ok": true })))
            .expect(1)
            .mount(&server)
            .await;

        let outcome = ensure_orchestrator_combo(&server.uri(), "sk-master", |pid| {
            assert_eq!(pid, "custom-acme");
            Ok("sk-real-acme".to_string())
        })
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
                "api_base": "https://api.anthropic.com"
            },
            "model_info": {
                "id": "model-uuid-2",
                "snapfzz_provider_id": "custom-anthropic"
            }
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

        // Combo mutation must carry the TARGET model's model + api_base + the raw
        // api_key fetched via `resolve_raw_key` (LiteLLM doesn't resolve `os.environ/`
        // for DB-stored deployments — the raw key is stored encrypted at rest).
        Mock::given(method("POST"))
            .and(path("/model/update"))
            .and(body_json(serde_json::json!({
                "id": "combo-uuid-xyz",
                "litellm_params": {
                    "model": "anthropic/claude-opus",
                    "api_base": "https://api.anthropic.com",
                    "api_key": "sk-real-anthropic"
                },
                "model_info": {
                    "id": "combo-uuid-xyz",
                    "snapfzz_system_combo": true,
                    "snapfzz_provider_id": "custom-anthropic"
                }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "ok": true })))
            .expect(1)
            .mount(&server)
            .await;

        update_orchestrator_combo(&server.uri(), "sk-master", "anthropic/claude", |pid| {
            assert_eq!(pid, "custom-anthropic");
            Ok("sk-real-anthropic".to_string())
        })
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

        update_orchestrator_combo(&server.uri(), "sk-master", "acme/gpt-4", |_| {
            Ok("sk-real-acme".to_string())
        })
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

        let err = update_orchestrator_combo(&server.uri(), "sk-master", "does-not-exist", |_| {
            Ok("unused".to_string())
        })
        .await
        .expect_err("unknown target must error");
        assert!(err.to_string().contains("not found"));
    }
}
