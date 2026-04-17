// Spec: chat/SPEC.md
// Section: ChatPanel events (submit, cancel, pick suggestion)
// Verifies: trim+skip-empty, skip-while-streaming, onCancel dispatches stop().

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChatPanelEvents, type ChatRuntimeHandle } from './events';

function makeRuntime(overrides: Partial<ChatRuntimeHandle> = {}): ChatRuntimeHandle {
  return {
    isStreaming: false,
    send: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
}

describe('chat/ChatPanel/events: useChatPanelEvents', () => {
  it('chat/events: onSubmit sends trimmed non-empty text', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useChatPanelEvents(makeRuntime({ send })));

    result.current.onSubmit('  hello world  ');
    expect(send).toHaveBeenCalledWith('hello world');
  });

  it('chat/events: onSubmit skips empty or whitespace-only text', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useChatPanelEvents(makeRuntime({ send })));

    result.current.onSubmit('');
    result.current.onSubmit('   ');
    expect(send).not.toHaveBeenCalled();
  });

  it('chat/events: onSubmit is a no-op while streaming', () => {
    const send = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelEvents(makeRuntime({ send, isStreaming: true })),
    );

    result.current.onSubmit('hello');
    expect(send).not.toHaveBeenCalled();
  });

  it('chat/events: onCancel dispatches stop()', () => {
    const stop = vi.fn();
    const { result } = renderHook(() => useChatPanelEvents(makeRuntime({ stop })));

    result.current.onCancel();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('chat/events: onPick forwards the prompt to send()', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useChatPanelEvents(makeRuntime({ send })));

    result.current.onPick('a kanban board');
    expect(send).toHaveBeenCalledWith('a kanban board');
  });

  it('chat/events: onPick is suppressed while streaming', () => {
    const send = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelEvents(makeRuntime({ send, isStreaming: true })),
    );

    result.current.onPick('ignored');
    expect(send).not.toHaveBeenCalled();
  });
});
