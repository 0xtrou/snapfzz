// Per chat/SPEC DomainModel: frontend mirrors AgentScope Msg + ContentBlock union without custom message format.
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

export interface MarkdownInlineToken {
  kind: 'text' | 'bold' | 'italic' | 'code' | 'link';
  text: string;
  href?: string;
}

export interface MarkdownHeadingSegment {
  kind: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  inlines: MarkdownInlineToken[];
}

export interface MarkdownParagraphSegment {
  kind: 'paragraph';
  inlines: MarkdownInlineToken[];
}

export interface MarkdownListSegment {
  kind: 'list';
  ordered: boolean;
  items: MarkdownInlineToken[][];
}

export interface MarkdownCodeSegment {
  kind: 'code';
  language: string;
  code: string;
}

export type MarkdownSegment =
  | MarkdownHeadingSegment
  | MarkdownParagraphSegment
  | MarkdownListSegment
  | MarkdownCodeSegment;

export interface RenderableTextBlock extends TextBlock {
  segments: MarkdownSegment[];
}

export interface RenderableToolUseBlock extends ToolUseBlock {
  inputPreview: string;
}

export interface RenderableToolResultBlock extends ToolResultBlock {
  outputPreview: string;
}

export type RenderableContentBlock =
  | RenderableTextBlock
  | ThinkingBlock
  | RenderableToolUseBlock
  | RenderableToolResultBlock
  | ImageBlock
  | AudioBlock
  | VideoBlock;

export interface ChatMessage {
  id: string;
  name: string;
  role: MsgRole;
  content: RenderableContentBlock[];
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
