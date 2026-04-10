use crate::types::{GeneratedKey, KeyGenerateParams, KeyInfo, KeyListResponse, KeyUpdateParams, LlmError};
use serde::de::DeserializeOwned;

pub async fn generate_key(
    client: &reqwest::Client,
    base_url: &str,
    master_key: &str,
    params: &KeyGenerateParams,
) -> Result<GeneratedKey, LlmError> {
    post_json(client, base_url, "/key/generate", master_key, params).await
}

pub async fn list_keys(
    client: &reqwest::Client,
    base_url: &str,
    master_key: &str,
    page: Option<u32>,
    size: Option<u32>,
) -> Result<KeyListResponse, LlmError> {
    let mut request = client
        .get(endpoint(base_url, "/key/list"))
        .header(reqwest::header::AUTHORIZATION, bearer(master_key));

    if let Some(page) = page {
        request = request.query(&[("page", page)]);
    }

    if let Some(size) = size {
        request = request.query(&[("size", size)]);
    }

    send_and_parse(request).await
}

pub async fn delete_key(
    client: &reqwest::Client,
    base_url: &str,
    master_key: &str,
    key: &str,
) -> Result<bool, LlmError> {
    #[derive(serde::Serialize)]
    struct DeleteRequest<'a> {
        key: &'a str,
    }

    #[derive(serde::Deserialize)]
    struct DeleteResponse {
        deleted: bool,
    }

    let response: DeleteResponse = post_json(
        client,
        base_url,
        "/key/delete",
        master_key,
        &DeleteRequest { key },
    )
    .await?;

    Ok(response.deleted)
}

pub async fn get_key_info(
    client: &reqwest::Client,
    base_url: &str,
    master_key: &str,
    key: &str,
) -> Result<KeyInfo, LlmError> {
    let request = client
        .get(endpoint(base_url, "/key/info"))
        .header(reqwest::header::AUTHORIZATION, bearer(master_key))
        .query(&[("key", key)]);

    send_and_parse(request).await
}

pub async fn update_key(
    client: &reqwest::Client,
    base_url: &str,
    master_key: &str,
    key: &str,
    params: &KeyUpdateParams,
) -> Result<KeyInfo, LlmError> {
    let body = serde_json::json!({
        "key": key,
        "models": params.models,
        "max_budget": params.max_budget,
        "budget_duration": params.budget_duration,
        "metadata": params.metadata,
        "rpm_limit": params.rpm_limit,
        "tpm_limit": params.tpm_limit,
    });

    post_json(client, base_url, "/key/update", master_key, &body).await
}

async fn post_json<TRequest: serde::Serialize, TResponse: DeserializeOwned>(
    client: &reqwest::Client,
    base_url: &str,
    path: &str,
    master_key: &str,
    body: &TRequest,
) -> Result<TResponse, LlmError> {
    let request = client
        .post(endpoint(base_url, path))
        .header(reqwest::header::AUTHORIZATION, bearer(master_key))
        .json(body);

    send_and_parse(request).await
}

async fn send_and_parse<T: DeserializeOwned>(request: reqwest::RequestBuilder) -> Result<T, LlmError> {
    let response = request.send().await?;
    let status = response.status();

    if !status.is_success() {
        return Err(LlmError::HttpStatus {
            status: status.as_u16(),
            body: response.text().await.unwrap_or_default(),
        });
    }

    Ok(response.json().await?)
}

fn endpoint(base_url: &str, path: &str) -> String {
    format!("{}{}", base_url.trim_end_matches('/'), path)
}

fn bearer(master_key: &str) -> String {
    format!("Bearer {master_key}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use wiremock::matchers::{body_json, header, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn a013_keys_generate_key_calls_post_key_generate() {
        // A013/Keys: generate_key calls POST /key/generate
        let server = MockServer::start().await;
        let params = KeyGenerateParams {
            models: vec!["gpt-4o".to_string()],
            max_budget: 10.0,
            budget_duration: "30d".to_string(),
            metadata: HashMap::from([("env".to_string(), "dev".to_string())]),
            rpm_limit: Some(100),
            tpm_limit: Some(1000),
        };

        Mock::given(method("POST"))
            .and(path("/key/generate"))
            .and(header("authorization", "Bearer master-123"))
            .and(body_json(&params))
            .respond_with(ResponseTemplate::new(200).set_body_json(GeneratedKey {
                key: "sk-generated".to_string(),
                key_alias: Some("dev-key".to_string()),
            }))
            .expect(1)
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let response = generate_key(&client, &server.uri(), "master-123", &params)
            .await
            .expect("generate key");

        assert_eq!(response.key, "sk-generated");
        assert_eq!(response.key_alias, Some("dev-key".to_string()));
    }

    #[tokio::test]
    async fn a013_keys_list_keys_calls_get_key_list_with_pagination() {
        // A013/Keys: list_keys calls GET /key/list with pagination
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/key/list"))
            .and(query_param("page", "2"))
            .and(query_param("size", "25"))
            .and(header("authorization", "Bearer master-123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(KeyListResponse {
                keys: vec![KeyInfo {
                    key: "sk-key".to_string(),
                    models: vec!["gpt-4o".to_string()],
                    spend: Some(2.5),
                    max_budget: Some(20.0),
                    budget_duration: Some("30d".to_string()),
                    metadata: None,
                }],
                total_count: Some(1),
            }))
            .expect(1)
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let response = list_keys(&client, &server.uri(), "master-123", Some(2), Some(25))
            .await
            .expect("list keys");

        assert_eq!(response.total_count, Some(1));
        assert_eq!(response.keys.len(), 1);
    }

    #[tokio::test]
    async fn a013_keys_delete_key_calls_post_key_delete() {
        // A013/Keys: delete_key calls POST /key/delete
        let server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/key/delete"))
            .and(header("authorization", "Bearer master-123"))
            .and(body_json(serde_json::json!({ "key": "sk-key" })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "deleted": true })))
            .expect(1)
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let deleted = delete_key(&client, &server.uri(), "master-123", "sk-key")
            .await
            .expect("delete key");

        assert!(deleted);
    }

    #[tokio::test]
    async fn a013_keys_get_key_info_calls_get_key_info() {
        // A013/Keys: get_key_info calls GET /key/info
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/key/info"))
            .and(query_param("key", "sk-key"))
            .and(header("authorization", "Bearer master-123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(KeyInfo {
                key: "sk-key".to_string(),
                models: vec!["gpt-4o".to_string()],
                spend: Some(3.0),
                max_budget: Some(10.0),
                budget_duration: Some("7d".to_string()),
                metadata: Some(HashMap::from([("team".to_string(), "core".to_string())])),
            }))
            .expect(1)
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let info = get_key_info(&client, &server.uri(), "master-123", "sk-key")
            .await
            .expect("get key info");

        assert_eq!(info.key, "sk-key");
        assert_eq!(info.models, vec!["gpt-4o".to_string()]);
    }

    #[tokio::test]
    async fn a013_keys_update_key_calls_post_key_update() {
        let server = MockServer::start().await;
        let params = KeyUpdateParams {
            models: Some(vec!["claude-sonnet".to_string()]),
            max_budget: Some(15.0),
            budget_duration: Some("14d".to_string()),
            metadata: Some(HashMap::from([("env".to_string(), "prod".to_string())])),
            rpm_limit: Some(50),
            tpm_limit: Some(500),
        };

        Mock::given(method("POST"))
            .and(path("/key/update"))
            .and(header("authorization", "Bearer master-123"))
            .and(body_json(serde_json::json!({
                "key": "sk-key",
                "models": ["claude-sonnet"],
                "max_budget": 15.0,
                "budget_duration": "14d",
                "metadata": {"env": "prod"},
                "rpm_limit": 50,
                "tpm_limit": 500
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(KeyInfo {
                key: "sk-key".to_string(),
                models: vec!["claude-sonnet".to_string()],
                spend: Some(1.1),
                max_budget: Some(15.0),
                budget_duration: Some("14d".to_string()),
                metadata: Some(HashMap::from([("env".to_string(), "prod".to_string())])),
            }))
            .expect(1)
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let updated = update_key(&client, &server.uri(), "master-123", "sk-key", &params)
            .await
            .expect("update key");

        assert_eq!(updated.models, vec!["claude-sonnet".to_string()]);
        assert_eq!(updated.max_budget, Some(15.0));
    }
}
