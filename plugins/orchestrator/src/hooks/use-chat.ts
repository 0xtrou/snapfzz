// Per A020/PhaseD: Real SSE client — replaces the Phase-A mock stream.
//
// Data flow:
//   configureChatRuntime(ctx)
//     → calls get_plugin_runtime_url('chat.orchestrator') via ctx.rust.invoke
//     → caches base URL at module scope
//   sendMessage(text)
//     → appends user message to snapshot
//     → POST /api/agent/process with AgentRequest + X-Agent-Id: default
//     → reads ReadableStream, parses data: {...}\n\n envelopes
//     → translates AgentScope MessageType → ContentBlock, feeds applyStreamBatch
//   stopGeneration()
//     → POST /api/console/chat/stop?chat_id=<sessionId>&X-Agent-Id: default
//
// Stop/interrupt discovery:
//   AgentApp (agentscope-runtime) has no exposed /stop HTTP route — InterruptMixin.stop_chat()
//   is a Python-internal method only (interrupt_mixin.py:140). The console router
//   (qwenpaw/app/routers/console.py:180) exposes POST /console/chat/stop?chat_id=<id>
//   which calls workspace.task_tracker.request_stop(chat_id). build_app() mounts
//   api_router at /api, which includes the console router — so the endpoint is:
//   POST /api/console/chat/stop?chat_id=<sessionId>
//   (AgentContextMiddleware routes the request to the "default" workspace via X-Agent-Id).
//
// Public hook signature is stable — same shape as Phase A:
//   { messages, isStreaming, pendingMessageId, connectionStatus, tokenCount, sessionId,
//     send, stop, clearConversation }

import { useSyncExternalStore } from 'react';
import type { PluginContext } from '@snapfzz/plugin-sdk';
import { getToastAPI } from '@snapfzz/shared';
import type {
  AgentHealthResponse,
  ChatMessage,
  ContentBlock,
  ContentBlockBatch,
  Msg,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
} from '../types';
import type {
  AgentSseEnvelope,
  AgentRequest,
  AgentRequestMessage,
} from './sse-contracts';

// ── Snapshot types ─────────────────────────────────────────────────────────────

interface ChatRuntimeSnapshot {
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingMessageId: string | null;
  connectionStatus: AgentHealthResponse['status'];
  tokenCount: number;
  sessionId: string;
}

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

// ── Module-scope state ─────────────────────────────────────────────────────────

const EMPTY_SESSION_ID = '';

const initialSnapshot: ChatRuntimeSnapshot = {
  messages: [],
  isStreaming: false,
  pendingMessageId: null,
  connectionStatus: 'disconnected',
  tokenCount: 0,
  sessionId: EMPTY_SESSION_ID,
};

let snapshot: ChatRuntimeSnapshot = { ...initialSnapshot };
const listeners = new Set<() => void>();

/** Cached base URL from get_plugin_runtime_url. Null until first configureChatRuntime. */
let _runtimeBaseUrl: string | null = null;

/** Stored plugin context — needed for rust.invoke. */
let _pluginCtx: PluginContext | null = null;

/** AbortController for the active SSE fetch. */
let _activeFetchController: AbortController | null = null;

// ── Core snapshot machinery ────────────────────────────────────────────────────

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

// ── Timestamp helpers ──────────────────────────────────────────────────────────

function formatTimestampLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Message helpers ────────────────────────────────────────────────────────────

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

function applyStreamBatch(batch: ContentBlockBatch): void {
  updateSnapshot((current) => ({
    ...current,
    messages: appendBatch(current.messages, batch),
    pendingMessageId: batch.done ? null : batch.messageId,
    isStreaming: !batch.done,
    tokenCount: current.tokenCount + (batch.tokenCount ?? 0),
  }));
}

// ── User message helpers ───────────────────────────────────────────────────────

function appendLocalUserMessage(text: string): string {
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
      pendingMessageId: null,
    };
  });

  return messageId;
}

// ── SSE parsing ────────────────────────────────────────────────────────────────

/**
 * Build ContentBlock(s) from an AgentScope SSE envelope.
 * Per A020/PhaseD: Translates AgentScope MessageType → our ContentBlock union.
 *
 * Translated types:
 *   message (content[].type='text')  → TextBlock
 *   reasoning                         → ThinkingBlock
 *   function_call                     → ToolUseBlock (status='running')
 *   function_call_output              → ToolResultBlock + ToolUseBlock flip to 'done'
 *   heartbeat                         → [] (keep-alive, no-op)
 *   error                             → returns null (caller surfaces toast)
 *   all others                        → [] (logged, skipped, never crash)
 */
function envelopeToBlocks(
  envelope: AgentSseEnvelope,
): ContentBlock[] | null {
  const type = envelope.type;

  // ── message (text delta) ───────────────────────────────────────────────────
  if (type === 'message') {
    if (!envelope.content || envelope.content.length === 0) {
      return [];
    }
    const blocks: TextBlock[] = [];
    for (const c of envelope.content) {
      if (c.type === 'text') {
        const tc = c as { type: 'text'; text?: string | null };
        if (tc.text) {
          blocks.push({ type: 'text', text: tc.text });
        }
      }
    }
    return blocks;
  }

  // ── reasoning → ThinkingBlock ──────────────────────────────────────────────
  if (type === 'reasoning') {
    if (!envelope.content || envelope.content.length === 0) {
      return [];
    }
    const parts: ThinkingBlock[] = [];
    for (const c of envelope.content) {
      if (c.type === 'text') {
        const tc = c as { type: 'text'; text?: string | null };
        if (tc.text) {
          parts.push({ type: 'thinking', thinking: tc.text });
        }
      }
    }
    return parts;
  }

  // ── function_call → ToolUseBlock (running) ─────────────────────────────────
  if (type === 'function_call') {
    if (!envelope.content || envelope.content.length === 0) {
      return [];
    }
    const callBlocks: ToolUseBlock[] = [];
    for (const c of envelope.content) {
      if (c.type === 'data') {
        const dc = c as { type: 'data'; data?: Record<string, unknown> | null };
        const d = dc.data ?? {};
        const callId = (d['call_id'] as string | undefined) ?? `tool-${crypto.randomUUID()}`;
        const name = (d['name'] as string | undefined) ?? 'unknown';
        let input: Record<string, unknown> | string = {};
        const rawArgs = d['arguments'];
        if (typeof rawArgs === 'string') {
          try {
            input = JSON.parse(rawArgs) as Record<string, unknown>;
          } catch {
            input = rawArgs;
          }
        } else if (rawArgs && typeof rawArgs === 'object') {
          input = rawArgs as Record<string, unknown>;
        }
        callBlocks.push({ type: 'tool_use', id: callId, name, input, status: 'running' });
      }
    }
    return callBlocks;
  }

  // ── function_call_output → ToolResultBlock ─────────────────────────────────
  if (type === 'function_call_output') {
    if (!envelope.content || envelope.content.length === 0) {
      return [];
    }
    const resultBlocks: ToolResultBlock[] = [];
    for (const c of envelope.content) {
      if (c.type === 'data') {
        const dc = c as { type: 'data'; data?: Record<string, unknown> | null };
        const d = dc.data ?? {};
        const callId = (d['call_id'] as string | undefined) ?? 'unknown';
        const name = (d['name'] as string | undefined) ?? undefined;
        const output = d['output'] ?? '';
        resultBlocks.push({ type: 'tool_result', id: callId, name, output });
      }
    }
    return resultBlocks;
  }

  // ── heartbeat → no-op ─────────────────────────────────────────────────────
  if (type === 'heartbeat') {
    return [];
  }

  // ── error → signal to caller ──────────────────────────────────────────────
  if (type === 'error') {
    return null;
  }

  // ── unrecognized type: log + skip (never crash) ───────────────────────────
  // Per A020/PhaseD: unknown envelope types are logged with full structure.
  // eslint-disable-next-line no-console
  console.warn('[use-chat] unknown SSE envelope type — skipping', { type, envelope });
  return [];
}

/**
 * Extract a user-facing error message from an AgentScope error envelope.
 */
function extractErrorMessage(envelope: AgentSseEnvelope): string {
  const err = envelope.error;
  if (!err) return 'Agent stream error';
  if (typeof err === 'string') return err;
  return err.message ?? err.code ?? 'Agent stream error';
}

// ── Build AgentRequest from snapshot messages ──────────────────────────────────

function buildAgentRequest(messages: ChatMessage[], sessionId: string): AgentRequest {
  const input: AgentRequestMessage[] = messages.map((m) => {
    const texts = m.content
      .filter((b): b is ContentBlock & { type: 'text'; text: string } => b.type === 'text')
      .map((b) => ({ type: 'text' as const, text: b.text }));

    return {
      role: m.role as 'user' | 'assistant' | 'system' | 'tool',
      type: 'message',
      content: texts.length > 0 ? texts : [{ type: 'text', text: '' }],
    };
  });

  return { input, session_id: sessionId, stream: true };
}

// ── SSE reader ─────────────────────────────────────────────────────────────────

async function consumeSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  messageId: string,
  sessionId: string,
  signal: AbortSignal,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  while (!done) {
    if (signal.aborted) break;

    const { value, done: streamDone } = await reader.read();
    done = streamDone;

    if (value) {
      buffer += decoder.decode(value, { stream: !streamDone });
    }

    // Parse all complete `data: ...\n\n` frames from the buffer.
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');

      if (!frame.startsWith('data:')) continue;

      const raw = frame.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;

      let envelope: AgentSseEnvelope;
      try {
        envelope = JSON.parse(raw) as AgentSseEnvelope;
      } catch {
        // Per A020/PhaseD: malformed frames are logged + skipped, never crash.
        // eslint-disable-next-line no-console
        console.warn('[use-chat] malformed SSE frame — skipping', raw);
        continue;
      }

      const blocks = envelopeToBlocks(envelope);

      if (blocks === null) {
        // error envelope
        const errMsg = extractErrorMessage(envelope);
        getToastAPI()?.error(errMsg);
        updateSnapshot((s) => ({
          ...s,
          isStreaming: false,
          pendingMessageId: null,
          connectionStatus: 'disconnected',
        }));
        return;
      }

      if (blocks.length === 0) continue;

      // Extract token count from usage field if present.
      let tokenCount = 0;
      if (envelope.usage) {
        tokenCount =
          (envelope.usage['total_tokens'] ?? 0) +
          (envelope.usage['completion_tokens'] ?? 0);
      }

      // Determine if this is the final frame (status=completed).
      const isDone = envelope.status === 'completed' || done;

      const batch: ContentBlockBatch = {
        sessionId,
        messageId,
        name: 'Orchestrator',
        role: 'assistant',
        blocks,
        done: isDone,
        tokenCount,
      };

      applyStreamBatch(batch);
    }
  }

  // Mark streaming complete if the stream ended cleanly without a completed frame.
  updateSnapshot((s) => {
    if (!s.isStreaming) return s;
    return {
      ...s,
      isStreaming: false,
      pendingMessageId: null,
    };
  });
}

// ── Plugin context store ───────────────────────────────────────────────────────

// Per A013/ModelPicker: module-level plugin context store — mirrors the bridge pattern.
// Allows ChatPanel's React subtree to access PluginContext via usePluginContextStore()
// without threading ctx as a prop through every component in the tree.

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

// ── Runtime URL discovery ──────────────────────────────────────────────────────

/**
 * Resolve and cache the Python runtime base URL.
 * Per A020/PhaseD: calls get_plugin_runtime_url('chat.orchestrator') once per
 * plugin lifecycle. Sets connectionStatus='reconnecting' while in-flight,
 * 'connected' on success, 'disconnected' on failure.
 */
async function resolveRuntimeUrl(ctx: PluginContext): Promise<string | null> {
  updateSnapshot((s) => ({ ...s, connectionStatus: 'reconnecting' }));
  try {
    const url = await ctx.rust.invoke<string>('get_plugin_runtime_url', {
      runtimeId: 'chat.orchestrator',
    });
    _runtimeBaseUrl = url;
    updateSnapshot((s) => ({ ...s, connectionStatus: 'connected' }));
    return url;
  } catch (err) {
    // Per A020/PhaseD: runtime not yet spawned or plugin deactivated — log + disconnect.
    // eslint-disable-next-line no-console
    console.error('[use-chat] get_plugin_runtime_url failed', err);
    updateSnapshot((s) => ({ ...s, connectionStatus: 'disconnected' }));
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Initialise the SSE runtime: resolves the Python runtime URL and caches it.
 * Called once from activate() in index.ts.
 */
export function configureChatRuntime(ctx: PluginContext): void {
  // Per A020/PhaseD: abort any stale stream from a prior activate cycle.
  _activeFetchController?.abort();
  _activeFetchController = null;

  // Kick off URL resolution asynchronously — the snapshot starts in 'reconnecting'.
  void resolveRuntimeUrl(ctx);
}

export function disposeChatRuntime(): void {
  _activeFetchController?.abort();
  _activeFetchController = null;
  _runtimeBaseUrl = null;
  emitSnapshot({ ...initialSnapshot });
}

/**
 * Send a user message and stream the assistant response via SSE.
 * Per A020/PhaseD: generates a session_id on first send, reuses it within the
 * conversation. Sends X-Agent-Id: 'default' so AgentContextMiddleware routes
 * to the correct workspace.
 */
export async function sendMessage(text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length === 0 || snapshot.isStreaming) {
    return;
  }

  // Generate session id on first send of a fresh conversation.
  const sessionId = snapshot.sessionId || crypto.randomUUID();
  if (!snapshot.sessionId) {
    updateSnapshot((s) => ({ ...s, sessionId }));
  }

  appendLocalUserMessage(trimmed);

  // Resolve base URL — either from cache or fresh (if configureChatRuntime hasn't
  // resolved yet, we wait here; typically cache is warm).
  let baseUrl = _runtimeBaseUrl;
  if (!baseUrl) {
    if (!_pluginCtx) {
      updateSnapshot((s) => ({
        ...s,
        isStreaming: false,
        connectionStatus: 'disconnected',
      }));
      getToastAPI()?.error('Orchestrator runtime is not available.');
      return;
    }
    baseUrl = await resolveRuntimeUrl(_pluginCtx);
    if (!baseUrl) {
      updateSnapshot((s) => ({
        ...s,
        isStreaming: false,
        connectionStatus: 'disconnected',
      }));
      getToastAPI()?.error('Orchestrator runtime is not available.');
      return;
    }
  }

  const assistantMessageId = `assistant-${crypto.randomUUID()}`;
  const agentRequest: AgentRequest = buildAgentRequest(snapshot.messages, sessionId);

  const controller = new AbortController();
  _activeFetchController = controller;

  let response: Response;
  try {
    updateSnapshot((s) => ({ ...s, connectionStatus: 'connected' }));
    response = await fetch(`${baseUrl}/api/agent/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        // Per A020/PhaseD: X-Agent-Id routes to the 'default' workspace via
        // AgentContextMiddleware (qwenpaw/app/routers/agent_scoped.py:42-47).
        'X-Agent-Id': 'default',
      },
      body: JSON.stringify(agentRequest),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      // Intentional stop — already handled by stopGeneration().
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[use-chat] fetch failed', err);
    updateSnapshot((s) => ({
      ...s,
      isStreaming: false,
      pendingMessageId: null,
      connectionStatus: 'disconnected',
    }));
    getToastAPI()?.error('Failed to connect to orchestrator runtime.');
    return;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.error('[use-chat] non-2xx response', response.status, body);
    updateSnapshot((s) => ({
      ...s,
      isStreaming: false,
      pendingMessageId: null,
      connectionStatus: 'disconnected',
    }));
    getToastAPI()?.error(`Orchestrator returned ${response.status}.`);
    return;
  }

  if (!response.body) {
    updateSnapshot((s) => ({
      ...s,
      isStreaming: false,
      pendingMessageId: null,
    }));
    return;
  }

  // Mark the first batch pending so the UI can render a typing indicator.
  updateSnapshot((s) => ({ ...s, pendingMessageId: assistantMessageId }));

  try {
    await consumeSseStream(
      response.body.getReader(),
      assistantMessageId,
      sessionId,
      controller.signal,
    );
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    // eslint-disable-next-line no-console
    console.error('[use-chat] SSE stream error', err);
    updateSnapshot((s) => ({
      ...s,
      isStreaming: false,
      pendingMessageId: null,
      connectionStatus: 'disconnected',
    }));
    getToastAPI()?.error('Orchestrator stream interrupted.');
  } finally {
    if (_activeFetchController === controller) {
      _activeFetchController = null;
    }
  }
}

/**
 * Stop the active generation.
 *
 * Per A020/PhaseD: Two-layer stop:
 *   1. Abort the browser-side fetch (closes the SSE reader immediately).
 *   2. POST /api/console/chat/stop?chat_id=<sessionId> to signal the Python
 *      runtime's task_tracker to cancel the running task.
 *      Endpoint discovered in: qwenpaw/src/qwenpaw/app/routers/console.py:180
 *      Mounted via: build_app() → app.include_router(api_router, prefix="/api")
 *        → api_router includes console_router at /console
 *        → full path: POST /api/console/chat/stop?chat_id=<sessionId>
 *      AgentContextMiddleware routes to 'default' workspace via X-Agent-Id header.
 *      Fire-and-forget: if the HTTP call fails we still clear local state.
 */
export async function stopGeneration(): Promise<void> {
  const currentSessionId = snapshot.sessionId;

  // Abort browser-side fetch first.
  _activeFetchController?.abort();
  _activeFetchController = null;

  updateSnapshot((s) => ({
    ...s,
    isStreaming: false,
    pendingMessageId: null,
  }));

  // Signal the Python runtime to cancel the task.
  if (currentSessionId && _runtimeBaseUrl) {
    try {
      await fetch(
        `${_runtimeBaseUrl}/api/console/chat/stop?chat_id=${encodeURIComponent(currentSessionId)}`,
        {
          method: 'POST',
          headers: { 'X-Agent-Id': 'default' },
        },
      );
    } catch {
      // Per A020/PhaseD: fire-and-forget; local state is already clean.
    }
  }
}

/**
 * Clear the conversation — resets messages, session id, and streaming state.
 * Per A020/PhaseD: generates a new session_id on next sendMessage.
 */
export async function clearConversationSession(): Promise<void> {
  _activeFetchController?.abort();
  _activeFetchController = null;
  emitSnapshot({ ...initialSnapshot, connectionStatus: snapshot.connectionStatus });
}

// ── React hook ─────────────────────────────────────────────────────────────────

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
