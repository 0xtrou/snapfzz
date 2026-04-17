import { useSyncExternalStore } from 'react';
import type { PluginContext, RustBridge } from '@snapfzz/plugin-sdk';
import type {
  AgentHealthResponse,
  ChatMessage,
  ContentBlock,
  ContentBlockBatch,
  Msg,
} from '../types';
// Per project/SparkDesignFirst: no pre-parse — Spark's Markdown renders raw text at view time,
// OperateCard/StatusCard render structured tool data directly.

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

interface SessionResponse {
  sessionId: string;
}

interface LoadSessionResponse {
  messages: Msg[];
}

const CHAT_STREAM_EVENT = 'chat_stream_batch';
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
let bridge: RustBridge | null = null;
let bridgeListeners: Array<() => void> = [];
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

function loadSessionMessages(messages: Msg[]): void {
  const normalized: ChatMessage[] = [];
  for (const message of messages) {
    const previous = normalized.length > 0 ? normalized[normalized.length - 1] : null;
    normalized.push(normalizeMsg(message, previous));
  }

  updateSnapshot((current) => ({
    ...current,
    messages: normalized,
  }));
}

async function ensureBridgeSession(rustBridge: RustBridge): Promise<void> {
  const created = await rustBridge.invoke<SessionResponse>('create_session', {});
  updateSnapshot((current) => ({
    ...current,
    sessionId: created.sessionId,
  }));

  const loaded = await rustBridge.invoke<LoadSessionResponse>('load_session', { sessionId: created.sessionId });
  loadSessionMessages(loaded.messages);
}

function disposeBridgeListeners(): void {
  for (const dispose of bridgeListeners) {
    dispose();
  }
  bridgeListeners = [];
}

function attachBridgeListeners(rustBridge: RustBridge): void {
  rustBridge.listen<ContentBlockBatch>(CHAT_STREAM_EVENT, (batch) => {
    applyStreamBatch(batch);
  }).then((dispose) => {
    bridgeListeners.push(dispose);
  });

  rustBridge.listen<AgentHealthResponse>('agent_health_changed', (payload) => {
    updateSnapshot((current) => ({ ...current, connectionStatus: payload.status }));
  }).then((dispose) => {
    bridgeListeners.push(dispose);
  });
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

export function configureChatRuntime(ctx: PluginContext): void {
  bridge = ctx.rust;
  clearMockTimer();
  disposeBridgeListeners();

  updateSnapshot((current) => ({
    ...current,
    connectionStatus: 'reconnecting',
  }));

  void bridge.invoke<AgentHealthResponse>('agent_health')
    .then((response) => {
      updateSnapshot((current) => ({ ...current, connectionStatus: response.status }));
    })
    .catch(() => {
      updateSnapshot((current) => ({ ...current, connectionStatus: 'disconnected' }));
    });

  void ensureBridgeSession(bridge).catch(() => {
    updateSnapshot((current) => ({ ...current, sessionId: EMPTY_SESSION_ID }));
  });

  attachBridgeListeners(bridge);
}

export function disposeChatRuntime(): void {
  clearMockTimer();
  disposeBridgeListeners();
  bridge = null;
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

  if (!bridge) {
    await runMockStream(trimmed);
    return;
  }

  await bridge.invoke<void>('send_message', { text: trimmed, sessionId: snapshot.sessionId });
}

export async function stopGeneration(): Promise<void> {
  clearMockTimer();

  if (bridge) {
    await bridge.invoke<void>('stop_generation', { sessionId: snapshot.sessionId });
  }

  updateSnapshot((current) => ({
    ...current,
    isStreaming: false,
    pendingMessageId: null,
  }));
}

export async function clearConversationSession(): Promise<void> {
  clearMockTimer();

  if (!bridge) {
    emitSnapshot(initialSnapshot);
    return;
  }

  const currentConnectionStatus = snapshot.connectionStatus;
  const created = await bridge.invoke<SessionResponse>('create_session', {});
  emitSnapshot({
    ...initialSnapshot,
    connectionStatus: currentConnectionStatus,
    sessionId: created.sessionId,
  });
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
