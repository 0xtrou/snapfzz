use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(transparent)]
pub struct ContentBlock(pub Value);

impl ContentBlock {
    pub fn text<T>(text: T) -> Self
    where
        T: Into<String>,
    {
        Self(serde_json::json!({
            "type": "text",
            "text": text.into(),
        }))
    }

    pub fn from_value(value: Value) -> Self {
        Self(value)
    }
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContentBlockBatch {
    pub session_id: String,
    pub batch_id: u32,
    pub token_count: usize,
    pub blocks: Vec<ContentBlock>,
    pub done: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MessageResult {
    pub id: String,
    pub total_tokens: usize,
    pub finish_reason: String,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    Stop,
    EndTurn,
    MaxTokens,
    StopSequence,
    ToolUse,
    Length,
    Error,
    #[serde(other)]
    Unknown,
}

impl Default for StopReason {
    fn default() -> Self {
        Self::Stop
    }
}

impl StopReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Stop => "stop",
            Self::EndTurn => "end_turn",
            Self::MaxTokens => "max_tokens",
            Self::StopSequence => "stop_sequence",
            Self::ToolUse => "tool_use",
            Self::Length => "length",
            Self::Error => "error",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Default)]
pub struct Delta {
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub content_blocks: Vec<ContentBlock>,
    #[serde(default)]
    pub stop_reason: Option<StopReason>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Default)]
pub struct MessageMetadata {
    #[serde(default)]
    pub finish_reason: Option<StopReason>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Default)]
pub struct ChoiceDelta {
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub content_blocks: Vec<ContentBlock>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Default)]
pub struct Choice {
    #[serde(default)]
    pub delta: Option<ChoiceDelta>,
    #[serde(default)]
    pub finish_reason: Option<StopReason>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Default)]
pub struct SsePayload {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub finish_reason: Option<StopReason>,
    #[serde(default)]
    pub metadata: Option<MessageMetadata>,
    #[serde(default)]
    pub content_blocks: Vec<ContentBlock>,
    #[serde(default)]
    pub content: Vec<ContentBlock>,
    #[serde(default)]
    pub delta: Option<Delta>,
    #[serde(default)]
    pub choices: Vec<Choice>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[cfg(test)]
mod tests {
    use super::{ContentBlock, Delta, MessageMetadata, SsePayload, StopReason};

    #[test]
    fn a001_stream_types_content_block_helpers_preserve_json() {
        let text = ContentBlock::text("hello");
        let raw = ContentBlock::from_value(serde_json::json!({"type":"tool_use","name":"search"}));

        assert_eq!(
            text,
            ContentBlock(serde_json::json!({"type":"text","text":"hello"}))
        );
        assert_eq!(
            raw,
            ContentBlock(serde_json::json!({"type":"tool_use","name":"search"}))
        );
    }

    #[test]
    fn a001_stream_types_stop_reason_as_str_covers_all_variants() {
        let cases = [
            (StopReason::Stop, "stop"),
            (StopReason::EndTurn, "end_turn"),
            (StopReason::MaxTokens, "max_tokens"),
            (StopReason::StopSequence, "stop_sequence"),
            (StopReason::ToolUse, "tool_use"),
            (StopReason::Length, "length"),
            (StopReason::Error, "error"),
            (StopReason::Unknown, "unknown"),
        ];

        for (reason, expected) in cases {
            assert_eq!(reason.as_str(), expected);
        }
        assert_eq!(StopReason::default(), StopReason::Stop);
    }

    #[test]
    fn a001_stream_types_payload_defaults_and_unknown_reason_deserialize() {
        let payload: SsePayload = serde_json::from_value(serde_json::json!({
            "finish_reason": "unexpected",
            "delta": {"content": "hi"},
            "metadata": {"finish_reason": "stop"}
        }))
        .expect("deserialize payload");

        assert_eq!(payload.finish_reason, Some(StopReason::Unknown));
        assert_eq!(
            payload.delta,
            Some(Delta {
                content: Some("hi".to_string()),
                ..Delta::default()
            })
        );
        assert_eq!(
            payload.metadata,
            Some(MessageMetadata {
                finish_reason: Some(StopReason::Stop),
                ..MessageMetadata::default()
            })
        );
    }
}
