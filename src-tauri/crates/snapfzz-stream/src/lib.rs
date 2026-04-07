use std::time::Instant;

use futures::StreamExt;
use reqwest_eventsource::Event;

use crate::batch::BatchAccumulator;
use crate::sse::{build_sse_request, decode_sse_events, open_event_source, parse_event, StreamState};

pub mod batch;
pub mod sse;
pub mod types;

pub use types::*;

#[derive(Debug)]
pub enum StreamError {
    Http(reqwest::Error),
    Sse(sse::SseError),
    ChannelSend(String),
}

impl std::fmt::Display for StreamError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Http(error) => write!(f, "{error}"),
            Self::Sse(error) => write!(f, "{error}"),
            Self::ChannelSend(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for StreamError {}

impl From<reqwest::Error> for StreamError {
    fn from(value: reqwest::Error) -> Self {
        Self::Http(value)
    }
}

impl From<sse::SseError> for StreamError {
    fn from(value: sse::SseError) -> Self {
        Self::Sse(value)
    }
}

impl From<reqwest_eventsource::Error> for StreamError {
    fn from(value: reqwest_eventsource::Error) -> Self {
        Self::Sse(sse::SseError::from(value))
    }
}

pub async fn send_and_consume<F>(
    url: &str,
    text: &str,
    session_id: &str,
    batch_interval_ms: u64,
    mut on_batch: F,
) -> Result<MessageResult, StreamError>
where
    F: FnMut(ContentBlockBatch) -> Result<(), StreamError> + Send,
{
    let client = reqwest::Client::new();
    let request = build_sse_request(url, text, session_id, &client);
    let mut event_source = open_event_source(request)?;
    let mut accumulator = BatchAccumulator::new(session_id, Instant::now());
    let mut state = StreamState::new();

    while let Some(event) = event_source.next().await {
        match event? {
            Event::Open => {}
            Event::Message(message) => {
                let chunk = format!("data: {}\n\n", message.data);
                let decoded_events = decode_sse_events(&chunk);

                for raw_event in decoded_events {
                    let parsed = parse_event(raw_event);
                    if parsed.done {
                        for batch in accumulator.finish() {
                            on_batch(batch)?;
                        }
                        event_source.close();
                        return Ok(state.into_result());
                    }

                    state.apply_event(&parsed);
                    accumulator.push_blocks(parsed.blocks);

                    if let Some(batch) = accumulator.flush_due(Instant::now(), batch_interval_ms) {
                        on_batch(batch)?;
                    }
                }
            }
        }
    }

    for batch in accumulator.finish() {
        on_batch(batch)?;
    }

    Ok(state.into_result())
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

#[cfg(test)]
mod tests {
    use super::{send_and_consume, StreamError};
    use crate::types::ContentBlockBatch;

    async fn spawn_http_server(response: String) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test listener");
        let addr = listener.local_addr().expect("listener local addr");

        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buf = [0_u8; 4096];
                let _ = socket.read(&mut buf).await;
                let _ = socket.write_all(response.as_bytes()).await;
                let _ = socket.shutdown().await;
            }
        });

        format!("http://{addr}/v1/messages")
    }

    #[tokio::test]
    async fn a001_stream_send_and_consume_handles_done_event_and_batches() {
        let response = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {\"id\":\"msg_1\",\"content_blocks\":[{\"type\":\"text\",\"text\":\"hello\"}],\"finish_reason\":\"stop\"}\n\ndata: [DONE]\n\n".to_string();
        let url = spawn_http_server(response).await;

        let mut batches: Vec<ContentBlockBatch> = Vec::new();
        let result = send_and_consume(&url, "hi", "session-1", 1, |batch| {
            batches.push(batch);
            Ok(())
        })
        .await
        .expect("send_and_consume should succeed");

        assert_eq!(result.id, "msg_1");
        assert_eq!(result.finish_reason, "stop");
        assert_eq!(result.total_tokens, 1);

        assert_eq!(batches.len(), 2);
        assert_eq!(batches[0].token_count, 1);
        assert_eq!(batches[0].blocks.len(), 1);
        assert!(!batches[0].done);
        assert!(batches[1].done);
    }

    #[tokio::test]
    async fn a001_stream_send_and_consume_returns_sse_error_when_stream_ends_without_done() {
        let response = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {\"content_blocks\":[{\"type\":\"text\",\"text\":\"tail\"}]}\n\n".to_string();
        let url = spawn_http_server(response).await;

        let error = send_and_consume(&url, "hi", "session-2", 5000, |_batch| Ok(()))
            .await
            .expect_err("stream ending without done should bubble eventsource error");

        assert!(matches!(error, StreamError::Sse(_)));
    }

    #[tokio::test]
    async fn a001_stream_send_and_consume_propagates_channel_send_errors() {
        let response = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {\"content_blocks\":[{\"type\":\"text\",\"text\":\"hello\"}]}\n\ndata: [DONE]\n\n".to_string();
        let url = spawn_http_server(response).await;

        let error = send_and_consume(&url, "hi", "session-3", 1, |_batch| {
            Err(StreamError::ChannelSend("sink closed".to_string()))
        })
        .await
        .expect_err("callback errors should propagate");

        match error {
            StreamError::ChannelSend(message) => assert_eq!(message, "sink closed"),
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[tokio::test]
    async fn a001_stream_send_and_consume_maps_eventsource_errors() {
        let response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string();
        let url = spawn_http_server(response).await;

        let error = send_and_consume(&url, "hi", "session-4", 1, |_batch| Ok(())).await;
        assert!(matches!(error, Err(StreamError::Sse(_))));
    }

    #[tokio::test]
    async fn a001_stream_error_from_reqwest_and_display_surface_message() {
        let reqwest_error = reqwest::get("http://127.0.0.1:1")
            .await
            .expect_err("expected reqwest connection error");
        let stream_error: StreamError = reqwest_error.into();
        assert!(matches!(stream_error, StreamError::Http(_)));
        assert!(!stream_error.to_string().is_empty());
    }
}
