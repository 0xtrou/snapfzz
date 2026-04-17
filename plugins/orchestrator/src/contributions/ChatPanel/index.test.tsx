// @vitest-environment jsdom
// Spec: chat/SPEC.md
// Section: ChatPanel integration — composes layers + hands props to the layout.
// Verifies: index.tsx correctly pipes observation/events into ChatPanelLayout.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const useChatMock = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/use-chat', () => ({
  useChat: useChatMock,
  // Per A013/ModelPicker: getPluginContext is used by PluginRuntimeProvider. Return null in tests.
  getPluginContext: vi.fn(() => null),
}));

// Per A013/ModelPicker: mock ModelPicker to isolate ChatPanel composition from picker internals.
vi.mock('../ModelPicker', () => ({
  ModelPicker: () => <div data-testid="model-picker-stub" />,
}));

// Per A013/Composer: mock ComposerActions too — it carries a hidden file input + popover
// that would otherwise pull Spark Popover into this integration test.
vi.mock('../ComposerActions', () => ({
  ComposerActions: () => <div data-testid="composer-actions-stub" />,
}));

vi.mock('./layout', () => ({
  ChatPanelLayout: (props: {
    observation: { isEmpty: boolean; isStreaming: boolean; messages: Array<{ id: string }> };
    events: { onSubmit: (t: string) => void; onCancel: () => void; onPick: (p: string) => void };
    suggestions: readonly { value: string }[];
  }) => (
    <div
      data-testid="layout"
      data-empty={String(props.observation.isEmpty)}
      data-streaming={String(props.observation.isStreaming)}
      data-suggestions={props.suggestions.map((s) => s.value).join(',')}
    >
      <button type="button" onClick={() => props.events.onSubmit('from test')}>submit</button>
      <button type="button" onClick={() => props.events.onPick('pick-me')}>pick</button>
      <button type="button" onClick={props.events.onCancel}>cancel</button>
    </div>
  ),
}));

import { ChatPanel } from './index';

function snapshot(overrides: Partial<ReturnType<typeof useChatMock>> = {}) {
  return {
    messages: [],
    isStreaming: false,
    pendingMessageId: null,
    send: vi.fn(),
    stop: vi.fn(),
    clearConversation: vi.fn(),
    connectionStatus: 'connected' as const,
    tokenCount: 0,
    sessionId: 's',
    ...overrides,
  };
}

describe('chat/ChatPanel/index: composition', () => {
  it('chat/index: propagates empty + non-streaming observation to the layout', () => {
    useChatMock.mockReturnValue(snapshot());

    render(<ChatPanel />);

    const layout = screen.getByTestId('layout');
    expect(layout.getAttribute('data-empty')).toBe('true');
    expect(layout.getAttribute('data-streaming')).toBe('false');
    expect(layout.getAttribute('data-suggestions')).toContain('a lofi habit tracker with streaks');
  });

  it('chat/index: forwards submit through events into useChat.send', () => {
    const send = vi.fn();
    useChatMock.mockReturnValue(snapshot({ send }));

    render(<ChatPanel />);
    fireEvent.click(screen.getByText('submit'));

    expect(send).toHaveBeenCalledWith('from test');
  });

  it('chat/index: forwards pick through events into useChat.send', () => {
    const send = vi.fn();
    useChatMock.mockReturnValue(snapshot({ send }));

    render(<ChatPanel />);
    fireEvent.click(screen.getByText('pick'));

    expect(send).toHaveBeenCalledWith('pick-me');
  });

  it('chat/index: cancel button dispatches useChat.stop', () => {
    const stop = vi.fn();
    useChatMock.mockReturnValue(snapshot({ stop }));

    render(<ChatPanel />);
    fireEvent.click(screen.getByText('cancel'));

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('chat/index: suppresses submit while streaming (events layer guard)', () => {
    const send = vi.fn();
    useChatMock.mockReturnValue(snapshot({ send, isStreaming: true }));

    render(<ChatPanel />);
    fireEvent.click(screen.getByText('submit'));

    expect(send).not.toHaveBeenCalled();
  });
});
