// @vitest-environment jsdom
// Spec: chat/SPEC.md
// Section: ChatPanel layout (empty-state hero vs populated list vs composer)
// Verifies: layout.tsx is pure presentational — renders correct parts for each state,
//           forwards callbacks to the right part, and never reads external state.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ChatPanelEventHandlers, ChatPanelObservation, SuggestionPrompt } from './contracts';

vi.mock('./parts/EmptyHero', () => ({
  EmptyHero: ({ onPick, suggestions, disabled }: { onPick: (p: string) => void; suggestions: readonly SuggestionPrompt[]; disabled?: boolean }) => (
    <div data-testid="empty-hero" data-disabled={String(Boolean(disabled))}>
      {suggestions.map((s) => (
        <button key={s.value} type="button" onClick={() => onPick(s.value)}>
          {s.value}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./parts/MessageList', () => ({
  MessageList: ({
    messages,
    pendingMessageId,
  }: {
    messages: Array<{ id: string }>;
    pendingMessageId: string | null;
  }) => (
    <div data-testid="message-list" data-pending={pendingMessageId ?? ''}>
      <ul>
        {messages.map((m) => (
          <li key={m.id}>{m.id}</li>
        ))}
      </ul>
    </div>
  ),
}));

vi.mock('./parts/ChatComposer', () => ({
  ChatComposer: ({
    loading,
    onSubmit,
    onCancel,
    prefix,
  }: {
    loading: boolean;
    onSubmit: (t: string) => void;
    onCancel: () => void;
    prefix?: React.ReactNode;
  }) => (
    <div data-testid="chat-composer" data-loading={String(loading)}>
      {prefix && <div data-testid="composer-prefix">{prefix}</div>}
      <button type="button" onClick={() => onSubmit('hi from layout test')}>
        submit
      </button>
      <button type="button" onClick={onCancel}>
        cancel
      </button>
    </div>
  ),
}));

import { ChatPanelLayout } from './layout';

function buildProps(overrides: Partial<{
  observation: ChatPanelObservation;
  events: ChatPanelEventHandlers;
  suggestions: readonly SuggestionPrompt[];
  composerPrefix: React.ReactNode;
}> = {}) {
  const events: ChatPanelEventHandlers = {
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onPick: vi.fn(),
    ...(overrides.events ?? {}),
  } as ChatPanelEventHandlers;

  const observation: ChatPanelObservation = {
    messages: [],
    isStreaming: false,
    pendingMessageId: null,
    isEmpty: true,
    ...(overrides.observation ?? {}),
  };

  const suggestions: readonly SuggestionPrompt[] = overrides.suggestions ?? [
    { value: 'one' },
    { value: 'two' },
  ];

  const composerPrefix = overrides.composerPrefix;

  return { observation, events, suggestions, composerPrefix };
}

describe('chat/ChatPanel/layout: empty vs populated', () => {
  it('chat/layout: renders EmptyHero when there are no messages', () => {
    render(<ChatPanelLayout {...buildProps()} />);

    expect(screen.getByTestId('empty-hero')).toBeTruthy();
    expect(screen.queryByTestId('message-list')).toBeNull();
  });

  it('chat/layout: renders MessageList when messages exist', () => {
    render(
      <ChatPanelLayout
        {...buildProps({
          observation: {
            messages: [{ id: 'a' } as never, { id: 'b' } as never],
            isStreaming: false,
            pendingMessageId: 'a',
            isEmpty: false,
          },
        })}
      />,
    );

    expect(screen.getByTestId('message-list').getAttribute('data-pending')).toBe('a');
    expect(screen.queryByTestId('empty-hero')).toBeNull();
  });
});

describe('chat/ChatPanel/layout: callback wiring', () => {
  it('chat/layout: EmptyHero onPick forwards to events.onPick', () => {
    const onPick = vi.fn();
    render(<ChatPanelLayout {...buildProps({ events: { onSubmit: vi.fn(), onCancel: vi.fn(), onPick } })} />);

    fireEvent.click(screen.getByText('one'));
    expect(onPick).toHaveBeenCalledWith('one');
  });

  it('chat/layout: ChatComposer submit calls events.onSubmit', () => {
    const onSubmit = vi.fn();
    render(<ChatPanelLayout {...buildProps({ events: { onSubmit, onCancel: vi.fn(), onPick: vi.fn() } })} />);

    fireEvent.click(screen.getByText('submit'));
    expect(onSubmit).toHaveBeenCalledWith('hi from layout test');
  });

  it('chat/layout: ChatComposer cancel calls events.onCancel', () => {
    const onCancel = vi.fn();
    render(<ChatPanelLayout {...buildProps({ events: { onSubmit: vi.fn(), onCancel, onPick: vi.fn() } })} />);

    fireEvent.click(screen.getByText('cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('chat/ChatPanel/layout: composer loading propagation', () => {
  it('chat/layout: passes isStreaming through to ChatComposer loading', () => {
    render(
      <ChatPanelLayout
        {...buildProps({
          observation: {
            messages: [],
            isStreaming: true,
            pendingMessageId: null,
            isEmpty: true,
          },
        })}
      />,
    );

    expect(screen.getByTestId('chat-composer').getAttribute('data-loading')).toBe('true');
  });
});

describe('chat/ChatPanel/layout: composerPrefix threading', () => {
  it('A013/layout: forwards composerPrefix to ChatComposer prefix slot', () => {
    const prefix = <span data-testid="model-chip-mock">ModelPicker</span>;
    render(<ChatPanelLayout {...buildProps({ composerPrefix: prefix })} />);
    expect(screen.getByTestId('composer-prefix')).toBeTruthy();
    expect(screen.getByTestId('model-chip-mock')).toBeTruthy();
  });

  it('A013/layout: no prefix slot when composerPrefix is undefined', () => {
    render(<ChatPanelLayout {...buildProps()} />);
    expect(screen.queryByTestId('composer-prefix')).toBeNull();
  });
});
