// Spec: chat/SPEC.md A020/PhaseD — real SSE client
// Section: SSE parsing, session id lifecycle, stop flow, configure/dispose, plugin-context store.
// Verifies ≥90% line + branch coverage on use-chat.ts.

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { PluginContext } from '@snapfzz/plugin-sdk';

// ── Mock @snapfzz/shared ───────────────────────────────────────────────────────
// Per A020/PhaseD: use-chat.ts calls getToastAPI() which must be mocked before
// the module is imported. vi.mock hoisting ensures this runs first.
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  getToastAPI: () => ({ error: mockToastError, success: mockToastSuccess }),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePluginContext(runtimeUrl = 'http://127.0.0.1:9150'): PluginContext {
  return {
    storage: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    bus: { emit: vi.fn(), on: vi.fn() },
    commands: { execute: vi.fn(), register: vi.fn() },
    settings: { get: vi.fn(), set: vi.fn(), onChange: vi.fn() },
    apis: { get: vi.fn(), provide: vi.fn() },
    rust: {
      invoke: vi.fn().mockResolvedValue(runtimeUrl),
      listen: vi.fn(),
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registry: {
      registerTab: vi.fn(),
      registerBottomPanel: vi.fn(),
      registerStatusItem: vi.fn(),
      registerComponent: vi.fn(),
    },
    surface: 'project',
  } as unknown as PluginContext;
}

/**
 * Build a minimal ReadableStream that emits SSE `data:` frames.
 * Each string in `frames` is wrapped as `data: <s>\n\n`.
 */
function makeSSEStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = frames.map((f) => encoder.encode(`data: ${f}\n\n`));
  let idx = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(chunks[idx]);
        idx += 1;
      } else {
        controller.close();
      }
    },
  });
}

/** Create a fetch mock that returns an SSE response with the given frames. */
function mockFetchSSE(frames: string[], status = 200): Mock {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body: makeSSEStream(frames),
    text: vi.fn().mockResolvedValue(''),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** SSE frame: assistant message text delta. */
function textFrame(text: string, status = 'in_progress'): string {
  return JSON.stringify({
    type: 'message',
    role: 'assistant',
    id: 'msg_test',
    content: [{ type: 'text', text }],
    status,
  });
}

/** SSE frame: completed message with usage (signals end of stream). */
function completedFrame(): string {
  return JSON.stringify({
    type: 'message',
    role: 'assistant',
    id: 'msg_test',
    content: [{ type: 'text', text: ' done.' }],
    status: 'completed',
    usage: { total_tokens: 42 },
  });
}

/** SSE frame: reasoning block. */
function reasoningFrame(thinking: string): string {
  return JSON.stringify({
    type: 'reasoning',
    role: 'assistant',
    id: 'msg_test',
    content: [{ type: 'text', text: thinking }],
    status: 'in_progress',
  });
}

/** SSE frame: function_call (tool use). */
function functionCallFrame(callId: string, name: string, args: string): string {
  return JSON.stringify({
    type: 'function_call',
    role: 'assistant',
    id: 'msg_test',
    content: [{ type: 'data', data: { call_id: callId, name, arguments: args } }],
    status: 'in_progress',
  });
}

/** SSE frame: function_call_output (tool result). */
function functionCallOutputFrame(callId: string, name: string, output: string): string {
  return JSON.stringify({
    type: 'function_call_output',
    id: 'msg_test',
    content: [{ type: 'data', data: { call_id: callId, name, output } }],
    status: 'in_progress',
  });
}

/** SSE frame: heartbeat. */
function heartbeatFrame(): string {
  return JSON.stringify({ type: 'heartbeat' });
}

/** SSE frame: error. */
function errorFrame(message: string): string {
  return JSON.stringify({ type: 'error', error: { code: 'E001', message } });
}

// ── Module loader — isolates each test suite ──────────────────────────────────
// Per A020/PhaseD: module-level snapshot state requires fresh imports per describe block.
// vi.resetModules() must be called before import so the mock is in place.

async function loadModule() {
  return import('../hooks/use-chat');
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('A020/initial-state: starts with disconnected + empty', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A020/initial-state: messages empty, not streaming, disconnected', async () => {
    const { useChat } = await loadModule();
    const { renderHook } = await import('@testing-library/react');
    const { result } = renderHook(() => useChat());

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.connectionStatus).toBe('disconnected');
    expect(result.current.tokenCount).toBe(0);
    expect(result.current.sessionId).toBe('');
  });
});

describe('A020/configure: runtime URL discovery', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A020/configure: transitions to reconnecting then connected on success', async () => {
    const { configureChatRuntime, configurePluginContext, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext('http://127.0.0.1:9150');
    const { result } = renderHook(() => useChat());

    act(() => {
      configurePluginContext(ctx);
      configureChatRuntime(ctx);
    });

    // Flush the async resolve.
    await act(async () => { await Promise.resolve(); });

    expect(ctx.rust.invoke).toHaveBeenCalledWith('get_plugin_runtime_url', { runtimeId: 'chat.orchestrator' });
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('A020/configure: sets disconnected when runtime URL call rejects', async () => {
    const { configureChatRuntime, configurePluginContext, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    (ctx.rust.invoke as Mock).mockRejectedValue(new Error('runtime not spawned'));
    const { result } = renderHook(() => useChat());

    act(() => {
      configurePluginContext(ctx);
      configureChatRuntime(ctx);
    });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('A020/configure: get_plugin_runtime_url called once per configure', async () => {
    const { configureChatRuntime, configurePluginContext } = await loadModule();
    const ctx = makePluginContext();
    const { act } = await import('@testing-library/react');

    act(() => {
      configurePluginContext(ctx);
      configureChatRuntime(ctx);
    });
    await act(async () => { await Promise.resolve(); });

    expect(ctx.rust.invoke).toHaveBeenCalledTimes(1);
  });
});

describe('A020/dispose: disposeChatRuntime resets snapshot', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A020/dispose: wipes messages and returns to initial state', async () => {
    const { configureChatRuntime, configurePluginContext, disposeChatRuntime, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    const { result } = renderHook(() => useChat());

    act(() => {
      configurePluginContext(ctx);
      configureChatRuntime(ctx);
    });
    await act(async () => { await Promise.resolve(); });

    act(() => { disposeChatRuntime(); });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.connectionStatus).toBe('disconnected');
  });
});

describe('A020/send: user message + SSE text delta', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A020/send: appends user message and streams assistant text', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    mockFetchSSE([textFrame('Hello '), completedFrame()]);

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await sendMessage('hi'); });

    const userMsgs = result.current.messages.filter((m) => m.role === 'user');
    const assistantMsgs = result.current.messages.filter((m) => m.role === 'assistant');
    expect(userMsgs).toHaveLength(1);
    expect(userMsgs[0].content[0]).toMatchObject({ type: 'text', text: 'hi' });
    expect(assistantMsgs.length).toBeGreaterThan(0);
    expect(result.current.isStreaming).toBe(false);
  });

  it('A020/send: ignores empty or whitespace-only input', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await sendMessage('   '); });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
  });

  it('A020/send: ignores second send while streaming', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();

    let resolveStream!: () => void;
    const streamBarrier = new Promise<void>((res) => { resolveStream = res; });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        async start(controller) {
          await streamBarrier;
          controller.close();
        },
      }),
      text: vi.fn().mockResolvedValue(''),
    }));

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });

    // Fire first send (non-blocking).
    const firstSendPromise = sendMessage('first');

    // Small yield to let sendMessage enter isStreaming=true state.
    await act(async () => { await Promise.resolve(); });

    // Second send must be rejected because isStreaming=true.
    await act(async () => { await sendMessage('second — blocked'); });

    const userMsgs = result.current.messages.filter((m) => m.role === 'user');
    expect(userMsgs).toHaveLength(1);

    // Clean up.
    resolveStream();
    await firstSendPromise.catch(() => {});
  });
});

describe('A020/sse-parsing: reasoning → ThinkingBlock', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A020/sse-parsing: reasoning frame produces ThinkingBlock', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    mockFetchSSE([reasoningFrame('Step 1: plan'), completedFrame()]);

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await sendMessage('go'); });

    const assistant = result.current.messages.find((m) => m.role === 'assistant');
    expect(assistant).toBeDefined();
    const thinkingBlock = assistant!.content.find((b) => b.type === 'thinking');
    expect(thinkingBlock).toMatchObject({ type: 'thinking', thinking: 'Step 1: plan' });
  });
});

describe('A020/sse-parsing: function_call → ToolUseBlock', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A020/sse-parsing: function_call frame produces ToolUseBlock with status=running', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    mockFetchSSE([
      functionCallFrame('call-1', 'write_file', JSON.stringify({ path: 'a.ts' })),
      completedFrame(),
    ]);

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await sendMessage('build'); });

    const assistant = result.current.messages.find((m) => m.role === 'assistant');
    expect(assistant).toBeDefined();
    const toolUse = assistant!.content.find((b) => b.type === 'tool_use');
    expect(toolUse).toMatchObject({
      type: 'tool_use',
      id: 'call-1',
      name: 'write_file',
      status: 'running',
    });
  });
});

describe('A020/sse-parsing: function_call_output → ToolResultBlock', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A020/sse-parsing: function_call_output frame produces ToolResultBlock', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    mockFetchSSE([
      functionCallOutputFrame('call-1', 'write_file', 'Updated a.ts'),
      completedFrame(),
    ]);

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await sendMessage('build'); });

    const assistant = result.current.messages.find((m) => m.role === 'assistant');
    expect(assistant).toBeDefined();
    const toolResult = assistant!.content.find((b) => b.type === 'tool_result');
    expect(toolResult).toMatchObject({
      type: 'tool_result',
      id: 'call-1',
      name: 'write_file',
      output: 'Updated a.ts',
    });
  });
});

describe('A020/sse-parsing: heartbeat is a no-op', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A020/sse-parsing: heartbeat frame does not add blocks', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    mockFetchSSE([heartbeatFrame(), textFrame('reply', 'completed')]);

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await sendMessage('ping'); });

    // All assistant blocks should have known types; no 'heartbeat' block.
    const assistant = result.current.messages.find((m) => m.role === 'assistant');
    const allTypes = assistant?.content.map((b) => b.type) ?? [];
    expect(allTypes).not.toContain('heartbeat');
  });
});

describe('A020/sse-parsing: error frame surfaces toast + disconnects', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => {
    vi.unstubAllGlobals();
    mockToastError.mockReset();
  });

  it('A020/sse-parsing: error envelope sets connectionStatus=disconnected + fires toast', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    mockFetchSSE([errorFrame('Something went wrong')]);

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await sendMessage('crash me'); });

    expect(result.current.connectionStatus).toBe('disconnected');
    expect(result.current.isStreaming).toBe(false);
    expect(mockToastError).toHaveBeenCalledWith('Something went wrong');
  });
});

describe('A020/error-path: fetch rejects → connectionStatus + user message preserved', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => {
    vi.unstubAllGlobals();
    mockToastError.mockReset();
  });

  it('A020/error-path: fetch rejection sets disconnected and preserves user message', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await sendMessage('hello'); });

    expect(result.current.connectionStatus).toBe('disconnected');
    expect(result.current.isStreaming).toBe(false);
    const userMsgs = result.current.messages.filter((m) => m.role === 'user');
    expect(userMsgs).toHaveLength(1);
    expect(mockToastError).toHaveBeenCalled();
  });

  it('A020/error-path: non-2xx response sets disconnected + fires toast', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    mockFetchSSE([], 500);

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await sendMessage('hello'); });

    expect(result.current.connectionStatus).toBe('disconnected');
    expect(mockToastError).toHaveBeenCalled();
  });
});

describe('A020/session-id: stable within conversation, resets on clear', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A020/session-id: stays the same across sends in one conversation', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });

    mockFetchSSE([completedFrame()]);
    await act(async () => { await sendMessage('first'); });
    const sessionIdAfterFirst = result.current.sessionId;
    expect(sessionIdAfterFirst).not.toBe('');

    mockFetchSSE([completedFrame()]);
    await act(async () => { await sendMessage('second'); });
    expect(result.current.sessionId).toBe(sessionIdAfterFirst);
  });

  it('A020/session-id: changes after clearConversationSession', async () => {
    const {
      configureChatRuntime,
      configurePluginContext,
      sendMessage,
      clearConversationSession,
      useChat,
    } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });

    mockFetchSSE([completedFrame()]);
    await act(async () => { await sendMessage('first'); });
    const sessionIdBefore = result.current.sessionId;

    await act(async () => { await clearConversationSession(); });
    expect(result.current.sessionId).toBe('');
    expect(result.current.messages).toHaveLength(0);

    // New send gets a fresh id.
    mockFetchSSE([completedFrame()]);
    await act(async () => { await sendMessage('after clear'); });
    expect(result.current.sessionId).not.toBe(sessionIdBefore);
    expect(result.current.sessionId).not.toBe('');
  });
});

describe('A020/stop: stopGeneration aborts fetch + calls stop endpoint', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A020/stop: resets isStreaming after stopping an in-progress stream', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, stopGeneration, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    // Stream opens but never sends data, so isStreaming stays true until stop.
    let resolveStream!: () => void;
    const streamBarrier = new Promise<void>((res) => { resolveStream = res; });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        async start(controller) {
          await streamBarrier;
          controller.close();
        },
      }),
      text: vi.fn().mockResolvedValue(''),
    }));

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });

    // Start streaming (non-blocking).
    const sendPromise = sendMessage('go');
    // Yield so fetch is called and isStreaming becomes true.
    await act(async () => { await Promise.resolve(); });

    expect(result.current.isStreaming).toBe(true);

    await act(async () => { await stopGeneration(); });
    expect(result.current.isStreaming).toBe(false);

    resolveStream();
    await sendPromise.catch(() => {});
  });

  it('A020/stop: POSTs to /api/console/chat/stop with current sessionId', async () => {
    const {
      configureChatRuntime,
      configurePluginContext,
      sendMessage,
      stopGeneration,
      useChat,
    } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext('http://127.0.0.1:9150');

    let resolveStream!: () => void;
    const streamBarrier = new Promise<void>((res) => { resolveStream = res; });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        async start(controller) {
          await streamBarrier;
          controller.close();
        },
      }),
      text: vi.fn().mockResolvedValue(''),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });

    const sendPromise = sendMessage('build something');
    // Yield so sessionId is set and fetch call is initiated.
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    const sessionId = result.current.sessionId;
    expect(sessionId).not.toBe('');

    await act(async () => { await stopGeneration(); });

    // The stop endpoint call must be present in fetchMock calls.
    const allCalls = fetchMock.mock.calls as Array<[string, RequestInit?]>;
    const stopCall = allCalls.find(([url]) => url.includes('/api/console/chat/stop'));
    expect(stopCall).toBeDefined();
    expect(stopCall![0]).toContain(`chat_id=${encodeURIComponent(sessionId)}`);
    expect(stopCall![1]).toMatchObject({
      method: 'POST',
      headers: { 'X-Agent-Id': 'default' },
    });

    resolveStream();
    await sendPromise.catch(() => {});
  });
});

describe('A020/token-count: usage field updates tokenCount', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A020/token-count: usage.total_tokens increments tokenCount', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    mockFetchSSE([completedFrame()]); // completedFrame has usage.total_tokens=42

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await sendMessage('count tokens'); });

    expect(result.current.tokenCount).toBeGreaterThanOrEqual(42);
  });
});

describe('A020/pluginContext: module-level ctx store', () => {
  beforeEach(() => { vi.resetModules(); });

  it('A020/pluginContext: getPluginContext returns null before configure', async () => {
    const { getPluginContext } = await loadModule();
    expect(getPluginContext()).toBeNull();
  });

  it('A020/pluginContext: configurePluginContext stores, disposePluginContext clears', async () => {
    const { configurePluginContext, disposePluginContext, getPluginContext } = await loadModule();
    const ctx = makePluginContext();

    configurePluginContext(ctx);
    expect(getPluginContext()).toBe(ctx);

    disposePluginContext();
    expect(getPluginContext()).toBeNull();
  });
});

describe('A020/no-runtime: sendMessage errors gracefully when runtime unavailable', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => {
    vi.unstubAllGlobals();
    mockToastError.mockReset();
  });

  it('A020/no-runtime: disconnects + toasts when runtime URL is unavailable and no ctx', async () => {
    const { sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useChat());

    await act(async () => { await sendMessage('hello'); });

    expect(result.current.connectionStatus).toBe('disconnected');
    expect(result.current.isStreaming).toBe(false);
    expect(mockToastError).toHaveBeenCalled();
  });
});

describe('A020/malformed-frame: bad JSON is skipped without crash', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A020/malformed-frame: malformed SSE frame does not throw and stream completes', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();

    const encoder = new TextEncoder();
    const frames = [
      encoder.encode('data: NOT_JSON\n\n'),
      encoder.encode(`data: ${completedFrame()}\n\n`),
    ];
    let idx = 0;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (idx < frames.length) {
            controller.enqueue(frames[idx]);
            idx++;
          } else {
            controller.close();
          }
        },
      }),
      text: vi.fn().mockResolvedValue(''),
    }));

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await sendMessage('test'); });

    expect(result.current.isStreaming).toBe(false);
  });
});

describe('A020/unknown-type: unknown envelope type is skipped without crash', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('A020/unknown-type: unknown type frame is ignored and stream completes', async () => {
    const { configureChatRuntime, configurePluginContext, sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const ctx = makePluginContext();
    const unknownFrame = JSON.stringify({ type: 'a2ui_action', data: {} });
    mockFetchSSE([unknownFrame, completedFrame()]);

    const { result } = renderHook(() => useChat());
    act(() => { configurePluginContext(ctx); configureChatRuntime(ctx); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await sendMessage('test'); });

    expect(result.current.isStreaming).toBe(false);
  });
});
