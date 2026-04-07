use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

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
pub struct ContentBlock {
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub input: Option<Value>,
    #[serde(default)]
    pub content: Option<Value>,
    #[serde(default)]
    pub tool_use_id: Option<String>,
    #[serde(default)]
    pub thinking: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl ContentBlock {
    pub fn text<T>(text: T) -> Self
    where
        T: Into<String>,
    {
        Self {
            kind: "text".to_string(),
            text: Some(text.into()),
            ..Self::default()
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
