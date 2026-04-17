import { useSyncExternalStore } from 'react';
import type { PluginContext } from '@snapfzz/plugin-sdk';
import type {
  AgentHealthResponse,
  ChatMessage,
  ContentBlock,
  ContentBlockBatch,
  Msg,
} from '../types';
// Per project/SparkDesignFirst: no pre-parse — Spark's Markdown renders raw text at view time,
// OperateCard/StatusCard render structured tool data directly.
//
// Phase A of the AgentScope integration stripped the Rust chat bridge (send_message /
// stop_generation / create_session / load_session) — those commands no longer exist. This
// hook now drives a local mock stream only; Phase D rewires it to fetch the Python runtime's
// `/process` SSE directly.

interface UseChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingMessageId: string | null;
  connectionStatus: AgentHealthResponse['status'];
  tokenCount: number;
  sessionId: string;
  send: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  clearConversation: () => Promise<void>;
}

interface ChatRuntimeSnapshot {
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingMessageId: string | null;
  connectionStatus: AgentHealthResponse['status'];
  tokenCount: number;
  sessionId: string;
}

const EMPTY_SESSION_ID = 'mock-session';

const initialSnapshot: ChatRuntimeSnapshot = {
  messages: [],
  isStreaming: false,
  pendingMessageId: null,
  connectionStatus: 'connected',
  tokenCount: 0,
  sessionId: EMPTY_SESSION_ID,
};

let snapshot: ChatRuntimeSnapshot = initialSnapshot;
let mockTimer: number | null = null;
const listeners = new Set<() => void>();

function emitSnapshot(next: ChatRuntimeSnapshot): void {
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function updateSnapshot(updater: (current: ChatRuntimeSnapshot) => ChatRuntimeSnapshot): void {
  emitSnapshot(updater(snapshot));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function formatTimestampLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function normalizeMsg(msg: Msg, previous: ChatMessage | null): ChatMessage {
  const blocks: ContentBlock[] = Array.isArray(msg.content)
    ? msg.content
    : [{ type: 'text', text: msg.content }];

  return {
    id: msg.id,
    name: msg.name,
    role: msg.role,
    metadata: msg.metadata,
    timestamp: msg.timestamp,
    timestampLabel: formatTimestampLabel(msg.timestamp),
    groupedWithPrevious: previous?.name === msg.name,
    content: blocks,
  };
}

function appendBatch(messages: ChatMessage[], batch: ContentBlockBatch): ChatMessage[] {
  const existingIndex = messages.findIndex((message) => message.id === batch.messageId);
  const previous = existingIndex > 0 ? messages[existingIndex - 1] : messages[messages.length - 1] ?? null;
  const incomingBlocks: ContentBlock[] = batch.blocks;
  const timestamp = batch.timestamp ?? new Date().toISOString();

  if (existingIndex >= 0) {
    const current = messages[existingIndex];
    const mergedBlocks = [...current.content, ...incomingBlocks];
    const updated: ChatMessage = {
      ...current,
      name: batch.name,
      role: batch.role,
      content: mergedBlocks,
      timestamp,
      timestampLabel: formatTimestampLabel(timestamp),
    };

    const next = [...messages];
    next[existingIndex] = updated;
    return next;
  }

  const created: ChatMessage = {
    id: batch.messageId,
    name: batch.name,
    role: batch.role,
    metadata: {},
    timestamp,
    timestampLabel: formatTimestampLabel(timestamp),
    groupedWithPrevious: previous?.name === batch.name,
    content: incomingBlocks,
  };

  return [...messages, created];
}

function clearMockTimer(): void {
  if (mockTimer !== null) {
    window.clearTimeout(mockTimer);
    mockTimer = null;
  }
}

function createMockAssistantBatches(prompt: string, sessionId: string): ContentBlockBatch[] {
  const messageId = `mock-assistant-${crypto.randomUUID()}`;
  const toolId = `tool-${crypto.randomUUID()}`;

  return [
    {
      sessionId,
      messageId,
      name: 'Orchestrator',
      role: 'assistant',
      blocks: [{ type: 'thinking', thinking: `Planning the next step for: ${prompt}` }],
      tokenCount: 8,
    },
    {
      sessionId,
      messageId,
      name: 'Orchestrator',
      role: 'assistant',
      blocks: [{ type: 'tool_use', id: toolId, name: 'write_file', input: { path: 'app/page.tsx', action: 'update' }, status: 'running' }],
      tokenCount: 12,
    },
    {
      sessionId,
      messageId,
      name: 'Orchestrator',
      role: 'assistant',
      blocks: [{ type: 'tool_result', id: toolId, name: 'write_file', output: 'Updated app/page.tsx with starter content' }],
      tokenCount: 16,
    },
    {
      sessionId,
      messageId,
      name: 'Orchestrator',
      role: 'assistant',
      blocks: [{ type: 'text', text: 'Done. Here is a preview block:\n\n```tsx\nexport default function Home() {\n  return <main>Hello from Snapfzz</main>;\n}\n```' }],
      done: true,
      tokenCount: 34,
    },
  ];
}

function appendLocalUserMessage(text: string): void {
  const messageId = `user-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  updateSnapshot((current) => {
    const previous = current.messages.length > 0 ? current.messages[current.messages.length - 1] : null;
    const userMessage: Msg = {
      id: messageId,
      name: 'User',
      role: 'user',
      content: [{ type: 'text', text }],
      metadata: {},
      timestamp: now,
    };

    return {
      ...current,
      messages: [...current.messages, normalizeMsg(userMessage, previous)],
      isStreaming: true,
    };
  });
}

function applyStreamBatch(batch: ContentBlockBatch): void {
  updateSnapshot((current) => ({
    ...current,
    messages: appendBatch(current.messages, batch),
    pendingMessageId: batch.done ? null : batch.messageId,
    isStreaming: !batch.done,
    tokenCount: current.tokenCount + (batch.tokenCount ?? 0),
  }));
}

// Per A013/ModelPicker: module-level plugin context store — mirrors the bridge pattern above.
// Allows ChatPanel's React subtree to access PluginContext via usePluginContextStore()
// without threading ctx as a prop through every component in the tree.
let _pluginCtx: PluginContext | null = null;

export function configurePluginContext(ctx: PluginContext): void {
  _pluginCtx = ctx;
}

export function disposePluginContext(): void {
  _pluginCtx = null;
}

/** Returns the stored PluginContext or null when called outside activate(). */
export function getPluginContext(): PluginContext | null {
  return _pluginCtx;
}

export function configureChatRuntime(_ctx: PluginContext): void {
  // Phase A of the AgentScope integration removed the Rust chat bridge. Configuration is
  // a no-op during this transition — Phase D will replace this with a direct SSE client
  // against the Python runtime's `/process` endpoint.
  clearMockTimer();
  updateSnapshot((current) => ({
    ...current,
    connectionStatus: 'connected',
  }));
}

export function disposeChatRuntime(): void {
  clearMockTimer();
  emitSnapshot(initialSnapshot);
}

async function runMockStream(text: string): Promise<void> {
  const batches = createMockAssistantBatches(text, snapshot.sessionId);
  let index = 0;

  const tick = () => {
    if (index >= batches.length) {
      clearMockTimer();
      updateSnapshot((current) => ({
        ...current,
        isStreaming: false,
        pendingMessageId: null,
      }));
      return;
    }

    const batch = batches[index];
    applyStreamBatch(batch);
    index += 1;
    mockTimer = window.setTimeout(tick, 220);
  };

  tick();
}

export async function sendMessage(text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length === 0 || snapshot.isStreaming) {
    return;
  }

  appendLocalUserMessage(trimmed);
  // Phase A: the Rust chat bridge is gone. Phase D rewires this to fetch the Python
  // runtime's `/process` SSE directly — until then, the mock stream drives the UI.
  await runMockStream(trimmed);
}

export async function stopGeneration(): Promise<void> {
  clearMockTimer();
  updateSnapshot((current) => ({
    ...current,
    isStreaming: false,
    pendingMessageId: null,
  }));
}

export async function clearConversationSession(): Promise<void> {
  clearMockTimer();
  emitSnapshot(initialSnapshot);
}

export function useChat(): UseChatState {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

  return {
    messages: current.messages,
    isStreaming: current.isStreaming,
    pendingMessageId: current.pendingMessageId,
    connectionStatus: current.connectionStatus,
    tokenCount: current.tokenCount,
    sessionId: current.sessionId,
    send: sendMessage,
    stop: stopGeneration,
    clearConversation: clearConversationSession,
  };
}
