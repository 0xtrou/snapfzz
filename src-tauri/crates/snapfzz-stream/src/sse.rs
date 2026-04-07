use std::collections::VecDeque;

use reqwest::header::ACCEPT;
use reqwest::{Client, RequestBuilder};
use reqwest_eventsource::{CannotCloneRequestError, EventSource, RequestBuilderExt};
use serde_json::Value;

use crate::types::{ContentBlock, MessageResult, SsePayload, StopReason};

#[derive(Debug)]
pub enum SseError {
    BuildRequest(CannotCloneRequestError),
    EventSource(reqwest_eventsource::Error),
}

impl std::fmt::Display for SseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BuildRequest(error) => write!(f, "{error}"),
            Self::EventSource(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for SseError {}

impl From<CannotCloneRequestError> for SseError {
    fn from(value: CannotCloneRequestError) -> Self {
        Self::BuildRequest(value)
    }
}

impl From<reqwest_eventsource::Error> for SseError {
    fn from(value: reqwest_eventsource::Error) -> Self {
        Self::EventSource(value)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum StreamEvent {
    Payload(SsePayload),
    Done,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedEvent {
    pub blocks: Vec<ContentBlock>,
    pub message_id: Option<String>,
    pub finish_reason: Option<StopReason>,
    pub done: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StreamState {
    pub total_tokens: usize,
    pub message_id: Option<String>,
    pub finish_reason: StopReason,
}

impl Default for StreamState {
    fn default() -> Self {
        Self {
            total_tokens: 0,
            message_id: None,
            finish_reason: StopReason::default(),
        }
    }
}

impl StreamState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn apply_event(&mut self, event: &ParsedEvent) {
        if let Some(message_id) = event.message_id.as_ref() {
            self.message_id = Some(message_id.clone());
        }

        if let Some(reason) = event.finish_reason.as_ref() {
            self.finish_reason = reason.clone();
        }

        self.total_tokens += event.blocks.len();
    }

    pub fn into_result(self) -> MessageResult {
        MessageResult {
            id: self.message_id.unwrap_or_else(super::uuid_string),
            total_tokens: self.total_tokens,
            finish_reason: self.finish_reason.as_str().to_string(),
        }
    }
}

pub fn build_sse_request(
    url: &str,
    text: &str,
    session_id: &str,
    client: &Client,
) -> RequestBuilder {
    client
        .post(url)
        .header(ACCEPT, "text/event-stream")
        .json(&serde_json::json!({
            "input": [{
                "role": "user",
                "content": [{ "type": "text", "text": text }]
            }],
            "session_id": session_id,
        }))
}

pub fn open_event_source(request: RequestBuilder) -> Result<EventSource, SseError> {
    Ok(request.eventsource()?)
}

pub fn decode_sse_events(raw_chunk: &str) -> VecDeque<StreamEvent> {
    let mut events = VecDeque::new();
    let mut data_lines: Vec<String> = Vec::new();

    for raw_line in raw_chunk.lines() {
        let line = raw_line.trim_end_matches('\r');

        if line.is_empty() {
            if data_lines.is_empty() {
                continue;
            }

            let payload_text = data_lines.join("\n");
            data_lines.clear();

            if payload_text == "[DONE]" {
                events.push_back(StreamEvent::Done);
                continue;
            }

            let payload = serde_json::from_str::<SsePayload>(&payload_text)
                .unwrap_or_else(|_| fallback_payload_from_text(payload_text.clone()));
            events.push_back(StreamEvent::Payload(payload));
            continue;
        }

        if line.starts_with(':') {
            continue;
        }

        if let Some(data) = line.strip_prefix("data:") {
            data_lines.push(data.trim_start().to_string());
        }
    }

    if !data_lines.is_empty() {
        let payload_text = data_lines.join("\n");
        if payload_text == "[DONE]" {
            events.push_back(StreamEvent::Done);
        } else {
            let payload = serde_json::from_str::<SsePayload>(&payload_text)
                .unwrap_or_else(|_| fallback_payload_from_text(payload_text.clone()));
            events.push_back(StreamEvent::Payload(payload));
        }
    }

    events
}

pub fn parse_event(event: StreamEvent) -> ParsedEvent {
    match event {
        StreamEvent::Done => ParsedEvent {
            blocks: Vec::new(),
            message_id: None,
            finish_reason: None,
            done: true,
        },
        StreamEvent::Payload(payload) => {
            let mut blocks = extract_content_blocks(&payload);
            if blocks.is_empty() {
                blocks.push(content_block_from_payload(payload.clone()));
            }

            let finish_reason = payload
                .finish_reason
                .clone()
                .or_else(|| {
                    payload
                        .metadata
                        .as_ref()
                        .and_then(|m| m.finish_reason.clone())
                })
                .or_else(|| {
                    payload
                        .choices
                        .iter()
                        .find_map(|choice| choice.finish_reason.clone())
                })
                .or_else(|| {
                    payload
                        .delta
                        .as_ref()
                        .and_then(|delta| delta.stop_reason.clone())
                });

            ParsedEvent {
                blocks,
                message_id: payload.id.clone(),
                finish_reason,
                done: false,
            }
        }
    }
}

pub fn extract_content_blocks(payload: &SsePayload) -> Vec<ContentBlock> {
    if !payload.content_blocks.is_empty() {
        return payload.content_blocks.clone();
    }

    if let Some(delta) = payload.delta.as_ref() {
        if !delta.content_blocks.is_empty() {
            return delta.content_blocks.clone();
        }
        if let Some(text) = delta.content.as_ref() {
            return vec![ContentBlock::text(text.clone())];
        }
    }

    if !payload.content.is_empty() {
        return payload.content.clone();
    }

    if let Some(choice_text) = payload
        .choices
        .first()
        .and_then(|choice| choice.delta.as_ref())
        .and_then(|delta| delta.content.as_ref())
    {
        return vec![ContentBlock::text(choice_text.clone())];
    }

    Vec::new()
}

fn fallback_payload_from_text(payload_text: String) -> SsePayload {
    let mut payload = SsePayload::default();
    payload.content_blocks = vec![ContentBlock::text(payload_text)];
    payload
}

fn content_block_from_payload(payload: SsePayload) -> ContentBlock {
    let raw = serde_json::to_value(payload).unwrap_or_else(|_| Value::Null);
    ContentBlock::from_value(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a001_stream_parsing_extracts_content_blocks_array() {
        let payload = serde_json::json!({
            "id": "msg_1",
            "content_blocks": [
                { "type": "text", "text": "hello" },
                { "type": "text", "text": "world" }
            ]
        });

        let payload = serde_json::from_value::<SsePayload>(payload).unwrap();
        let blocks = extract_content_blocks(&payload);

        assert_eq!(
            blocks,
            vec![ContentBlock::text("hello"), ContentBlock::text("world")]
        );
    }

    #[test]
    fn a001_stream_parsing_extracts_delta_content_block_array() {
        let payload = serde_json::json!({
            "delta": {
                "content_blocks": [{ "type": "text", "text": "delta" }]
            }
        });

        let payload = serde_json::from_value::<SsePayload>(payload).unwrap();
        let blocks = extract_content_blocks(&payload);

        assert_eq!(blocks, vec![ContentBlock::text("delta")]);
    }

    #[test]
    fn a001_stream_parsing_extracts_delta_content_string() {
        let payload = serde_json::json!({
            "delta": {
                "content": "hello from delta"
            }
        });

        let payload = serde_json::from_value::<SsePayload>(payload).unwrap();
        let blocks = extract_content_blocks(&payload);

        assert_eq!(blocks, vec![ContentBlock::text("hello from delta")]);
    }

    #[test]
    fn a001_stream_parsing_extracts_openai_choices_delta_content() {
        let payload = serde_json::json!({
            "choices": [
                {
                    "delta": {
                        "content": "from choices"
                    }
                }
            ]
        });

        let payload = serde_json::from_value::<SsePayload>(payload).unwrap();
        let blocks = extract_content_blocks(&payload);

        assert_eq!(blocks, vec![ContentBlock::text("from choices")]);
    }

    #[test]
    fn a001_stream_parsing_decodes_done_event() {
        let raw = "data: [DONE]\n\n";
        let events = decode_sse_events(raw);

        assert_eq!(events.len(), 1);
        assert_eq!(events[0], StreamEvent::Done);
    }

    #[test]
    fn a001_stream_parsing_decodes_payload_event_and_metadata_finish_reason() {
        let raw = "data: {\"id\":\"msg_1\",\"metadata\":{\"finish_reason\":\"stop\"},\"content_blocks\":[{\"type\":\"text\",\"text\":\"hello\"}]}\n\n";

        let event = decode_sse_events(raw)
            .into_iter()
            .next()
            .expect("expected payload event");

        let parsed = parse_event(event);

        assert_eq!(parsed.message_id.as_deref(), Some("msg_1"));
        assert_eq!(parsed.finish_reason, Some(StopReason::Stop));
        assert_eq!(parsed.blocks, vec![ContentBlock::text("hello")]);
        assert!(!parsed.done);
    }

    #[test]
    fn a001_stream_parsing_stream_state_accumulates_tokens_and_reason() {
        let raw = "data: {\"id\":\"msg_1\",\"content_blocks\":[{\"type\":\"text\",\"text\":\"hello\"}],\"finish_reason\":\"stop\"}\n\n";
        let event = decode_sse_events(raw)
            .into_iter()
            .next()
            .expect("expected payload event");

        let parsed = parse_event(event);
        let mut state = StreamState::default();
        state.apply_event(&parsed);
        let result = state.into_result();

        assert_eq!(result.id, "msg_1");
        assert_eq!(result.total_tokens, 1);
        assert_eq!(result.finish_reason, "stop");
    }
}
