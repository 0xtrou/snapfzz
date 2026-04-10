use crate::types::{GlobalSpend, KeySpend, LlmError, ModelListResponse, SpendFilters, SpendLog};
use serde::de::DeserializeOwned;

pub async fn get_spend_logs(
    client: &reqwest::Client,
    base_url: &str,
    master_key: &str,
    filters: &SpendFilters,
) -> Result<Vec<SpendLog>, LlmError> {
    let mut request = client
        .get(endpoint(base_url, "/spend/logs"))
        .header(reqwest::header::AUTHORIZATION, bearer(master_key));

    if let Some(value) = filters.start_date.as_deref() {
        request = request.query(&[("start_date", value)]);
    }
    if let Some(value) = filters.end_date.as_deref() {
        request = request.query(&[("end_date", value)]);
    }
    if let Some(value) = filters.key.as_deref() {
        request = request.query(&[("key", value)]);
    }
    if let Some(value) = filters.model.as_deref() {
        request = request.query(&[("model", value)]);
    }
    if let Some(value) = filters.user.as_deref() {
        request = request.query(&[("user", value)]);
    }
    if let Some(value) = filters.page {
        request = request.query(&[("page", value)]);
    }
    if let Some(value) = filters.size {
        request = request.query(&[("size", value)]);
    }

    send_and_parse(request).await
}

pub async fn get_key_spend(
    client: &reqwest::Client,
    base_url: &str,
    master_key: &str,
    key: &str,
) -> Result<KeySpend, LlmError> {
    let request = client
        .get(endpoint(base_url, "/spend/keys"))
        .header(reqwest::header::AUTHORIZATION, bearer(master_key))
        .query(&[("key", key)]);

    send_and_parse(request).await
}

pub async fn get_global_spend(
    client: &reqwest::Client,
    base_url: &str,
    master_key: &str,
) -> Result<GlobalSpend, LlmError> {
    let request = client
        .get(endpoint(base_url, "/spend/global"))
        .header(reqwest::header::AUTHORIZATION, bearer(master_key));

    send_and_parse(request).await
}

pub async fn get_models(client: &reqwest::Client, base_url: &str) -> Result<ModelListResponse, LlmError> {
    let request = client.get(endpoint(base_url, "/v1/models"));
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
    use wiremock::matchers::{header, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn a013_spend_get_spend_logs_calls_logs_endpoint_with_date_filters() {
        // A013/Spend: get_spend_logs calls /spend/logs with date filters
        let server = MockServer::start().await;
        let filters = SpendFilters {
            start_date: Some("2026-01-01".to_string()),
            end_date: Some("2026-01-31".to_string()),
            key: Some("sk-key".to_string()),
            model: Some("gpt-4o".to_string()),
            user: Some("user-1".to_string()),
            page: Some(2),
            size: Some(20),
        };

        Mock::given(method("GET"))
            .and(path("/spend/logs"))
            .and(header("authorization", "Bearer master-123"))
            .and(query_param("start_date", "2026-01-01"))
            .and(query_param("end_date", "2026-01-31"))
            .and(query_param("key", "sk-key"))
            .and(query_param("model", "gpt-4o"))
            .and(query_param("user", "user-1"))
            .and(query_param("page", "2"))
            .and(query_param("size", "20"))
            .respond_with(ResponseTemplate::new(200).set_body_json(vec![SpendLog {
                request_id: "req-1".to_string(),
                api_key: "sk-key".to_string(),
                model: "gpt-4o".to_string(),
                spend: 0.12,
                timestamp: "2026-01-10T10:00:00Z".to_string(),
            }]))
            .expect(1)
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let logs = get_spend_logs(&client, &server.uri(), "master-123", &filters)
            .await
            .expect("spend logs");

        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].request_id, "req-1");
    }

    #[tokio::test]
    async fn a013_spend_get_key_spend_returns_per_key_spend() {
        // A013/Spend: get_key_spend returns per-key spend
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/spend/keys"))
            .and(header("authorization", "Bearer master-123"))
            .and(query_param("key", "sk-key"))
            .respond_with(ResponseTemplate::new(200).set_body_json(KeySpend {
                key: "sk-key".to_string(),
                spend: 12.34,
            }))
            .expect(1)
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let spend = get_key_spend(&client, &server.uri(), "master-123", "sk-key")
            .await
            .expect("key spend");

        assert_eq!(spend.key, "sk-key");
        assert_eq!(spend.spend, 12.34);
    }

    #[tokio::test]
    async fn a013_spend_get_global_spend_returns_total_spend() {
        // A013/Spend: get_global_spend returns total spend
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/spend/global"))
            .and(header("authorization", "Bearer master-123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(GlobalSpend {
                total_spend: 99.9,
                by_provider: HashMap::from([
                    ("openai".to_string(), 80.0),
                    ("anthropic".to_string(), 19.9),
                ]),
            }))
            .expect(1)
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let global = get_global_spend(&client, &server.uri(), "master-123")
            .await
            .expect("global spend");

        assert_eq!(global.total_spend, 99.9);
        assert_eq!(global.by_provider.get("openai"), Some(&80.0));
    }

    #[tokio::test]
    async fn a013_spend_get_models_calls_v1_models_without_master_key() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(ModelListResponse {
                data: vec![
                    crate::types::ModelInfo {
                        id: "gpt-4o".to_string(),
                    },
                    crate::types::ModelInfo {
                        id: "claude-sonnet".to_string(),
                    },
                ],
            }))
            .expect(1)
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let models = get_models(&client, &server.uri()).await.expect("models");

        assert_eq!(models.data.len(), 2);
        assert_eq!(models.data[0].id, "gpt-4o");
    }
}
