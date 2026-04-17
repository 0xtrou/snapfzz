// Per chat/SPEC DomainModel + project/SparkDesignFirst: frontend mirrors AgentScope Msg +
// ContentBlock directly. Markdown parsing, status previews, and segment splitting are handled
// by Spark (@agentscope-ai/chat) Markdown/OperateCard/StatusCard at render time — no
// pre-processing layer lives in the types.

export type MsgRole = 'user' | 'assistant' | 'system';

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown> | string;
  status?: 'running' | 'done' | 'error';
}

export interface ToolResultBlock {
  type: 'tool_result';
  id: string;
  output: unknown;
  name?: string;
  isError?: boolean;
}

export interface ImageBlock {
  type: 'image';
  source: string;
  alt?: string;
}

export interface AudioBlock {
  type: 'audio';
  source: string;
}

export interface VideoBlock {
  type: 'video';
  source: string;
}

export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | ImageBlock
  | AudioBlock
  | VideoBlock;

export interface Msg {
  id: string;
  name: string;
  role: MsgRole;
  content: string | ContentBlock[];
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  name: string;
  role: MsgRole;
  content: ContentBlock[];
  metadata: Record<string, unknown>;
  timestamp: string;
  timestampLabel: string;
  groupedWithPrevious: boolean;
}

export interface ContentBlockBatch {
  sessionId: string;
  messageId: string;
  name: string;
  role: MsgRole;
  blocks: ContentBlock[];
  timestamp?: string;
  done?: boolean;
  tokenCount?: number;
}

export interface AgentHealthResponse {
  status: 'connected' | 'reconnecting' | 'disconnected';
}
