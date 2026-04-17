// Spec: chat/SPEC.md
// Section: Domain Model + Runtime State Machine (post Phase A — Rust chat bridge removed)
// Verifies: initial state, mock-stream append/stop/clear transitions, plugin-context store.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginContext } from '@snapfzz/plugin-sdk';

function makePluginContext(): PluginContext {
  return {
    storage: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    bus: { emit: vi.fn(), on: vi.fn() },
    commands: { execute: vi.fn(), register: vi.fn() },
    settings: { get: vi.fn(), set: vi.fn(), onChange: vi.fn() },
    apis: { get: vi.fn(), provide: vi.fn() },
    rust: { invoke: vi.fn(), listen: vi.fn() },
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

async function loadModule() {
  vi.resetModules();
  return import('../hooks/use-chat');
}

describe('chat/state: initial snapshot', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('chat/state: starts with empty messages, not streaming, connected', async () => {
    const { useChat } = await loadModule();
    const { renderHook } = await import('@testing-library/react');
    const { result } = renderHook(() => useChat());

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.connectionStatus).toBe('connected');
    expect(result.current.tokenCount).toBe(0);
  });
});

describe('chat/runtime: configure + dispose', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('chat/runtime: configureChatRuntime is a no-op during Phase A (connection stays connected)', async () => {
    const { configureChatRuntime, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useChat());

    act(() => { configureChatRuntime(makePluginContext()); });
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('chat/runtime: disposeChatRuntime resets the snapshot to initial', async () => {
    const { sendMessage, disposeChatRuntime, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useChat());

    await act(async () => {
      void sendMessage('populate the state');
    });
    expect(result.current.messages.length).toBeGreaterThan(0);

    act(() => { disposeChatRuntime(); });
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
  });
});

describe('chat/send: mock-stream behavior', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

  it('chat/send: appends the user message and starts streaming', async () => {
    const { sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useChat());

    await act(async () => { void sendMessage('hello'); });

    const userMessages = result.current.messages.filter((m) => m.role === 'user');
    expect(userMessages).toHaveLength(1);
    expect(result.current.isStreaming).toBe(true);
  });

  it('chat/send: ignores empty or whitespace-only input', async () => {
    const { sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useChat());

    await act(async () => { await sendMessage('   '); });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
  });

  it('chat/send: ignores a second send while the first is still streaming', async () => {
    const { sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useChat());

    await act(async () => { void sendMessage('first'); });
    await act(async () => { await sendMessage('second — should be blocked'); });

    const userMessages = result.current.messages.filter((m) => m.role === 'user');
    expect(userMessages).toHaveLength(1);
  });

  it('chat/send: mock stream eventually adds an assistant message', async () => {
    const { sendMessage, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useChat());

    await act(async () => {
      void sendMessage('ping');
      vi.runAllTimers();
    });

    const assistants = result.current.messages.filter((m) => m.role === 'assistant');
    expect(assistants.length).toBeGreaterThan(0);
  });
});

describe('chat/stop: stopGeneration clears the stream', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

  it('chat/stop: resets isStreaming and pendingMessageId', async () => {
    const { sendMessage, stopGeneration, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useChat());

    await act(async () => { void sendMessage('go'); });
    expect(result.current.isStreaming).toBe(true);

    await act(async () => { await stopGeneration(); });
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.pendingMessageId).toBeNull();
  });
});

describe('chat/clear: clearConversationSession resets everything', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

  it('chat/clear: wipes messages and timers', async () => {
    const { sendMessage, clearConversationSession, useChat } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useChat());

    await act(async () => { void sendMessage('anything'); });
    expect(result.current.messages.length).toBeGreaterThan(0);

    await act(async () => { await clearConversationSession(); });
    expect(result.current.messages).toHaveLength(0);
  });
});

describe('chat/pluginContext: module-level ctx store', () => {
  beforeEach(() => { vi.resetModules(); });

  it('chat/pluginContext: getPluginContext returns null before configure', async () => {
    const { getPluginContext } = await loadModule();
    expect(getPluginContext()).toBeNull();
  });

  it('chat/pluginContext: configurePluginContext stores, dispose clears', async () => {
    const { configurePluginContext, disposePluginContext, getPluginContext } = await loadModule();
    const ctx = makePluginContext();

    configurePluginContext(ctx);
    expect(getPluginContext()).toBe(ctx);

    disposePluginContext();
    expect(getPluginContext()).toBeNull();
  });
});
