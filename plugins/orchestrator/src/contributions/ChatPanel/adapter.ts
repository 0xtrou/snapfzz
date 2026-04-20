// Per A013/ChatPanel: API adapter between Spark's `AgentScopeRuntimeWebUI` and
// our QwenPaw-backed Python runtime. We talk to `POST /api/console/chat` so:
//   • Each chat is registered in QwenPaw's `ChatManager` (persisted to disk at
//     `{workspace_dir}/chats.json` via `JsonChatRepository`), which means the
//     backend exposes it on `GET /api/agents/.../chats` and a reload survives
//     the Python process restart.
//   • The run is tracked by `TaskTracker` → we get buffered SSE replay +
//     live event broadcast for free. Spark's built-in `api.reconnect` path
//     slots into that when a session is marked `generating: true`.
//
// QwenPaw's `/console/chat` emits the same AgentScope Runtime frame format
// Spark parses (see `console/channel.py:stream_one` → `event.model_dump_json()`
// wrapped in `data: …\n\n`), so no transformation is needed on the response.

import type { PluginContext } from '@snapfzz/plugin-sdk';

const AGENT_ID = 'default';
/** QwenPaw's console channel — what /console/chat resolves session_id against. */
const CHANNEL = 'console';
const USER_ID = 'default';

let _runtimeBaseUrl: string | null = null;
let _pluginCtx: PluginContext | null = null;
// Spark's `api.fetch` callback does NOT receive a session_id; Spark tracks it
// internally via `ChatAnywhereSessionsContext`. A `<SessionIdBridge />` rendered
// inside the webui reads that context and pushes the id here so chat requests
// carry the session the user has active.
let _currentSessionId: string | null = null;

export function setActiveSessionId(id: string | null): void { _currentSessionId = id; }

export function configureChatAdapter(ctx: PluginContext): void { _pluginCtx = ctx; }

export function disposeChatAdapter(): void {
  _pluginCtx = null;
  _runtimeBaseUrl = null;
  _currentSessionId = null;
}

async function resolveRuntimeUrl(): Promise<string> {
  if (_runtimeBaseUrl) return _runtimeBaseUrl;
  if (!_pluginCtx) {
    throw new Error('Chat adapter not configured — did plugin.activate() run?');
  }
  const url = await _pluginCtx.rust.invoke<string>('get_plugin_runtime_url', {
    runtimeId: 'chat.orchestrator',
  });
  _runtimeBaseUrl = url;
  return url;
}

/**
 * Exported so sessionStore can share the same Rust bridge lookup without
 * duplicating the resolution logic or the cached value.
 * Returns null when the plugin context is not yet configured.
 */
export async function getRuntimeBaseUrl(): Promise<string | null> {
  try {
    return await resolveRuntimeUrl();
  } catch {
    return null;
  }
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'X-Agent-Id': AGENT_ID,
} as const;

/** Shared body shape for `/api/console/chat`. `session_id` lives under the
 *  channel_meta resolver, not as a first-class field in `AgentRequest` — but
 *  QwenPaw's `_extract_session_and_payload` reads it either way. */
interface ConsoleChatBody {
  input: unknown[];
  session_id: string;
  user_id: string;
  channel: string;
  stream?: boolean;
  biz_params?: Record<string, unknown>;
  reconnect?: boolean;
}

/** Spark's `options.api.fetch`. */
export async function chatFetch(data: {
  input: unknown[];
  biz_params?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<Response> {
  const baseUrl = await resolveRuntimeUrl();

  // Bug-fix: Spark's custom-fetch path passes the full historyMessages array as
  // `data.input` even when `enableHistoryMessages: false` is set. The backend
  // also rebuilds full history from its session file via `load_session_state`,
  // so forwarding all history duplicates context for the LLM. Slice to only the
  // latest user turn before posting.
  const latestUserOnly = (() => {
    const arr = Array.isArray(data.input) ? data.input : [];
    for (let i = arr.length - 1; i >= 0; i--) {
      const msg = arr[i] as { role?: string } | undefined;
      if (msg?.role === 'user') return [msg];
    }
    return arr.slice(-1);
  })();

  const body: ConsoleChatBody = {
    input: latestUserOnly,
    session_id: _currentSessionId ?? 'default',
    user_id: USER_ID,
    channel: CHANNEL,
    stream: true,
    biz_params: data.biz_params,
  };
  return fetch(`${baseUrl}/api/console/chat`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    signal: data.signal,
  });
}

/** Spark's `options.api.reconnect`. Fires automatically when a restored session
 *  has `generating: true`. Hits the same endpoint with `reconnect: true`, which
 *  routes through `TaskTracker.attach(chat_id)` — replays the buffer and keeps
 *  yielding live events until the run completes. */
export async function chatReconnect(data: {
  session_id: string;
  signal?: AbortSignal;
}): Promise<Response> {
  const baseUrl = await resolveRuntimeUrl();
  const body: ConsoleChatBody = {
    input: [],
    session_id: data.session_id,
    user_id: USER_ID,
    channel: CHANNEL,
    reconnect: true,
  };
  return fetch(`${baseUrl}/api/console/chat`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    signal: data.signal,
  });
}

/** Spark's `options.api.cancel`. QwenPaw's stop endpoint keys by
 *  `ChatSpec.id` (UUID), not session_id, so we first resolve session_id →
 *  chat_id via `GET /api/agents/{id}/chats`, then fire the stop. Best-effort:
 *  the client-side `AbortController` already halts the SSE consumer, so
 *  failures here only mean the backend run drains on its own. */
export async function chatCancel({ session_id }: { session_id: string }): Promise<void> {
  try {
    const baseUrl = await resolveRuntimeUrl();
    const res = await fetch(
      `${baseUrl}/api/agents/${encodeURIComponent(AGENT_ID)}/chats`,
      { headers: { 'X-Agent-Id': AGENT_ID } },
    );
    if (!res.ok) return;
    const list = (await res.json()) as Array<{ id: string; session_id: string }>;
    const chat = list.find((c) => c.session_id === session_id);
    if (!chat) return;
    await fetch(
      `${baseUrl}/api/console/chat/stop?chat_id=${encodeURIComponent(chat.id)}`,
      { method: 'POST', headers: { 'X-Agent-Id': AGENT_ID } },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[chat-adapter] cancel failed', err);
  }
}
