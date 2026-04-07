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
