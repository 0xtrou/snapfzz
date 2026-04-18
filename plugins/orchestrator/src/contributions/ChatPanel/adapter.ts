// Per A013/ChatPanel: API adapter between Spark's `AgentScopeRuntimeWebUI` and
// our QwenPaw-backed Python runtime. Spark's default fetch posts to `${baseURL}/responses`
// with its own JSON shape; our FastAPI runtime exposes `POST /api/agent/process` and
// `POST /api/console/chat/stop?chat_id=<id>` instead. The adapter repoints the request,
// injects our `X-Agent-Id` header, and passes the abort signal through.
//
// The SSE body Spark reads back is exactly the AgentScope Runtime frame format QwenPaw
// streams — no transformation needed on the response side.

import type { PluginContext } from '@snapfzz/plugin-sdk';

const AGENT_ID = 'default';

/** Cached base URL fetched once per plugin lifecycle via `get_plugin_runtime_url`. */
let _runtimeBaseUrl: string | null = null;

/** Set during plugin `activate()`; enables adapter → Rust bridge for runtime URL lookup. */
let _pluginCtx: PluginContext | null = null;

// Spark's `api.fetch` callback does NOT receive a `session_id` (see
// `useChatRequest.tsx` request()), but Spark DOES track the active session
// internally via `ChatAnywhereSessionsContext`. A `<SessionIdBridge />` rendered
// inside the webui reads that context and pushes the id here, so the adapter can
// forward whatever session the user has active to the QwenPaw backend.
let _currentSessionId: string | null = null;

export function setActiveSessionId(id: string | null): void {
  _currentSessionId = id;
}

export function getActiveSessionId(): string | null {
  return _currentSessionId;
}

export function configureChatAdapter(ctx: PluginContext): void {
  _pluginCtx = ctx;
}

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
 * `options.api.fetch` implementation. Spark hands us the current `input[]` (user
 * message + optional history), optional `biz_params`, and an abort signal. We POST
 * to our runtime's `/api/agent/process`, attach `X-Agent-Id: default`, and let the
 * SSE body stream straight back — Spark's built-in parser handles the frames.
 */
export async function chatFetch(data: {
  input: unknown[];
  biz_params?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<Response> {
  const baseUrl = await resolveRuntimeUrl();
  const sessionId = _currentSessionId ?? 'default';
  const body = {
    input: data.input,
    session_id: sessionId,
    stream: true,
    biz_params: data.biz_params,
  };
  return fetch(`${baseUrl}/api/agent/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Id': AGENT_ID,
    },
    body: JSON.stringify(body),
    signal: data.signal,
  });
}

/**
 * `options.api.cancel` implementation. QwenPaw's `AgentApp.InterruptMixin` is Python-
 * internal only; `POST /api/console/chat/stop?chat_id=…` is what actually reaches it.
 * Spark passes the session_id it's tracking, which is the same value we just sent
 * in the /process body (via the bridge), so forwarding verbatim is correct.
 * Failures are swallowed — the client-side abort already stops the SSE consumer.
 */
export async function chatCancel({ session_id }: { session_id: string }): Promise<void> {
  try {
    const baseUrl = await resolveRuntimeUrl();
    await fetch(`${baseUrl}/api/console/chat/stop?chat_id=${encodeURIComponent(session_id)}`, {
      method: 'POST',
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[chat-adapter] cancel failed', err);
  }
}
