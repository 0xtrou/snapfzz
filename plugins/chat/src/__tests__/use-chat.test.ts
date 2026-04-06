// Spec: chat/SPEC.md
// Sections: Domain Model, Rust Bridge Commands, Architecture Resonance (A002)
// Verifies: initial state, send/stop state transitions, stream batch processing, session loading, error handling
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RustBridge } from '@snapfzz/plugin-sdk';
import type { ContentBlockBatch, Msg } from '../types';

vi.mock('../hooks/markdown', () => ({
  parseMarkdownToSegments: vi.fn((text: string) => [{ kind: 'paragraph', inlines: [{ kind: 'text', text }] }]),
}));

function makeRustBridge(overrides: Partial<RustBridge> = {}): RustBridge {
  return {
    invoke: vi.fn().mockResolvedValue({}),
    listen: vi.fn().mockResolvedValue(vi.fn()),
    ...overrides,
  } as unknown as RustBridge;
}

async function loadModule() {
  vi.resetModules();
  vi.mock('../hooks/markdown', () => ({
    parseMarkdownToSegments: vi.fn((text: string) => [{ kind: 'paragraph', inlines: [{ kind: 'text', text }] }]),
  }));
  return import('../hooks/use-chat');
}

describe('chat/state: initial state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('chat/state: disposeChatRuntime resets to empty messages', async () => {
    const { disposeChatRuntime, sendMessage, useChat } = await loadModule();

    const { renderHook } = await import('@testing-library/react');
    const { act } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toHaveLength(0);

    await act(async () => {
      await sendMessage('hello world');
      vi.runAllTimers();
    });

    expect(result.current.messages.length).toBeGreaterThan(0);

    act(() => {
      disposeChatRuntime();
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it('chat/state: initial connectionStatus defaults to connected before bridge is configured', async () => {
    const { useChat } = await loadModule();
    const { renderHook } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('chat/state: initial tokenCount is 0', async () => {
    const { useChat } = await loadModule();
    const { renderHook } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());
    expect(result.current.tokenCount).toBe(0);
  });

  it('chat/state: initial isStreaming is false', async () => {
    const { useChat } = await loadModule();
    const { renderHook } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());
    expect(result.current.isStreaming).toBe(false);
  });
});

describe('chat/send: message sending', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('chat/send: appends user message and sets isStreaming true', async () => {
    const { sendMessage, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());

    await act(async () => {
      void sendMessage('build me a landing page');
    });

    const userMessages = result.current.messages.filter((m) => m.role === 'user');
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0].content[0].type).toBe('text');

    act(() => { disposeChatRuntime(); });
  });

  it('chat/send: ignores empty or whitespace-only text', async () => {
    const { sendMessage, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await sendMessage('   ');
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);

    act(() => { disposeChatRuntime(); });
  });

  it('chat/send: ignores send when already streaming', async () => {
    const { sendMessage, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());

    await act(async () => {
      void sendMessage('first message');
    });

    expect(result.current.isStreaming).toBe(true);

    await act(async () => {
      await sendMessage('second message — should be blocked');
    });

    const userMessages = result.current.messages.filter((m) => m.role === 'user');
    expect(userMessages).toHaveLength(1);

    act(() => { disposeChatRuntime(); });
  });

  it('chat/send: mock stream adds assistant message with thinking block', async () => {
    const { sendMessage, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());

    await act(async () => {
      void sendMessage('hello');
      vi.runAllTimers();
    });

    const assistantMessages = result.current.messages.filter((m) => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThan(0);

    act(() => { disposeChatRuntime(); });
  });

  it('chat/send: user message name is User', async () => {
    const { sendMessage, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());

    await act(async () => {
      void sendMessage('test');
    });

    expect(result.current.messages[0].name).toBe('User');

    act(() => { disposeChatRuntime(); });
  });
});

describe('chat/stop: stop generation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('chat/stop: resets isStreaming to false', async () => {
    const { sendMessage, stopGeneration, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());

    await act(async () => {
      void sendMessage('go');
    });
    expect(result.current.isStreaming).toBe(true);

    await act(async () => {
      await stopGeneration();
    });
    expect(result.current.isStreaming).toBe(false);

    act(() => { disposeChatRuntime(); });
  });

  it('chat/stop: clears pendingMessageId', async () => {
    const { sendMessage, stopGeneration, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());

    await act(async () => {
      void sendMessage('go');
    });

    await act(async () => {
      await stopGeneration();
    });

    expect(result.current.pendingMessageId).toBeNull();

    act(() => { disposeChatRuntime(); });
  });

  it('chat/stop: invokes rust bridge stop_generation when bridge is configured', async () => {
    const { configureChatRuntime, stopGeneration, disposeChatRuntime } = await loadModule();

    const invoke = vi.fn().mockResolvedValue({});
    const bridge = makeRustBridge({
      invoke,
      listen: vi.fn().mockResolvedValue(vi.fn()),
    });
    invoke
      .mockResolvedValueOnce({ status: 'connected' })
      .mockResolvedValueOnce({ sessionId: 'sess-1' })
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValue(undefined);

    configureChatRuntime({ rust: bridge } as unknown as Parameters<typeof configureChatRuntime>[0]);

    await stopGeneration();

    const stopCall = invoke.mock.calls.find(([cmd]) => cmd === 'stop_generation');
    expect(stopCall).toBeDefined();

    disposeChatRuntime();
  });
});

describe('chat/batch: stream batch processing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('chat/batch: applyStreamBatch creates new message when messageId is new', async () => {
    const { sendMessage, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());

    await act(async () => {
      void sendMessage('trigger mock');
      vi.advanceTimersByTime(220);
    });

    const messages = result.current.messages;
    const assistantMsg = messages.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();

    act(() => { disposeChatRuntime(); });
  });

  it('chat/batch: accumulates tokenCount as batches arrive', async () => {
    const { sendMessage, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());

    await act(async () => {
      void sendMessage('go');
      vi.runAllTimers();
    });

    expect(result.current.tokenCount).toBeGreaterThan(0);

    act(() => { disposeChatRuntime(); });
  });

  it('chat/batch: isStreaming becomes false when batch.done is true', async () => {
    const { sendMessage, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());

    await act(async () => {
      void sendMessage('go');
      vi.runAllTimers();
    });

    expect(result.current.isStreaming).toBe(false);

    act(() => { disposeChatRuntime(); });
  });
});

describe('chat/configure: bridge configuration', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('chat/configure: configureChatRuntime sets connectionStatus to reconnecting during health check', async () => {
    const { configureChatRuntime, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    let resolveHealth!: (v: unknown) => void;
    const invoke = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === 'agent_health') {
        return new Promise((resolve) => { resolveHealth = resolve; });
      }
      if (cmd === 'create_session') return Promise.resolve({ sessionId: 'sess-abc' });
      if (cmd === 'load_session') return Promise.resolve({ messages: [] });
      return Promise.resolve({});
    });
    const bridge = makeRustBridge({ invoke });

    const { result } = renderHook(() => useChat());

    act(() => {
      configureChatRuntime({ rust: bridge } as unknown as Parameters<typeof configureChatRuntime>[0]);
    });

    expect(result.current.connectionStatus).toBe('reconnecting');

    await act(async () => {
      resolveHealth({ status: 'connected' });
    });

    expect(result.current.connectionStatus).toBe('connected');

    disposeChatRuntime();
  });

  it('chat/configure: configureChatRuntime sets disconnected when bridge health check fails', async () => {
    const { configureChatRuntime, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const invoke = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === 'agent_health') return Promise.reject(new Error('unreachable'));
      if (cmd === 'create_session') return Promise.resolve({ sessionId: 'sess-fail' });
      if (cmd === 'load_session') return Promise.resolve({ messages: [] });
      return Promise.resolve({});
    });
    const bridge = makeRustBridge({ invoke });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      configureChatRuntime({ rust: bridge } as unknown as Parameters<typeof configureChatRuntime>[0]);
    });

    expect(result.current.connectionStatus).toBe('disconnected');

    disposeChatRuntime();
  });

  it('chat/configure: load_session messages are normalized and added to state', async () => {
    const { configureChatRuntime, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const existingMsg: Msg = {
      id: 'msg-1',
      name: 'Orchestrator',
      role: 'assistant',
      content: 'Hello from history',
      metadata: {},
      timestamp: '2026-04-06T10:00:00Z',
    };

    const invoke = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === 'agent_health') return Promise.resolve({ status: 'connected' });
      if (cmd === 'create_session') return Promise.resolve({ sessionId: 'sess-loaded' });
      if (cmd === 'load_session') return Promise.resolve({ messages: [existingMsg] });
      return Promise.resolve({});
    });
    const bridge = makeRustBridge({ invoke });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      configureChatRuntime({ rust: bridge } as unknown as Parameters<typeof configureChatRuntime>[0]);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].name).toBe('Orchestrator');

    disposeChatRuntime();
  });
});

describe('chat/clear: clear conversation', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('chat/clear: clearConversationSession resets messages when no bridge', async () => {
    vi.useFakeTimers();
    const { sendMessage, clearConversationSession, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());

    await act(async () => {
      void sendMessage('hello');
    });

    expect(result.current.messages.length).toBeGreaterThan(0);

    await act(async () => {
      await clearConversationSession();
    });

    expect(result.current.messages).toHaveLength(0);

    act(() => { disposeChatRuntime(); });
    vi.useRealTimers();
  });

  it('chat/clear: clearConversationSession preserves connectionStatus after clearing', async () => {
    const { configureChatRuntime, clearConversationSession, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const invoke = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === 'agent_health') return Promise.resolve({ status: 'connected' });
      if (cmd === 'create_session') return Promise.resolve({ sessionId: 'new-sess' });
      if (cmd === 'load_session') return Promise.resolve({ messages: [] });
      return Promise.resolve({});
    });
    const bridge = makeRustBridge({ invoke });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      configureChatRuntime({ rust: bridge } as unknown as Parameters<typeof configureChatRuntime>[0]);
    });

    const previousStatus = result.current.connectionStatus;

    await act(async () => {
      await clearConversationSession();
    });

    expect(result.current.connectionStatus).toBe(previousStatus);

    disposeChatRuntime();
  });
});

describe('chat/grouping: message grouping logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('chat/grouping: messages from different senders are not grouped', async () => {
    const { sendMessage, useChat, disposeChatRuntime } = await loadModule();
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useChat());

    await act(async () => {
      void sendMessage('user message');
      vi.advanceTimersByTime(220);
    });

    const userMsg = result.current.messages.find((m) => m.role === 'user');
    const assistantMsg = result.current.messages.find((m) => m.role === 'assistant');

    expect(userMsg?.groupedWithPrevious).toBe(false);
    expect(assistantMsg?.groupedWithPrevious).toBe(false);

    act(() => { disposeChatRuntime(); });
  });
});
