// @vitest-environment jsdom
// Spec: chat/SPEC.md — virtualized list wraps PretextList and forwards message identity.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ChatMessage } from '../../../types';

vi.mock('@snapfzz/shared', () => ({
  PretextList: ({
    items,
    renderItem,
    keyExtractor,
  }: {
    items: ChatMessage[];
    renderItem: (m: ChatMessage) => React.ReactNode;
    keyExtractor: (m: ChatMessage) => string;
  }) => (
    <div data-testid="pretext-list">
      {items.map((m) => (
        <div key={keyExtractor(m)} data-testid="row">
          {renderItem(m)}
        </div>
      ))}
    </div>
  ),
  prepare: vi.fn(() => ({ length: 1 })),
  layout: vi.fn(() => ({ height: 22, lineCount: 1 })),
}));

vi.mock('./MessageRow', () => ({
  MessageRow: ({ message, isPending }: { message: ChatMessage; isPending: boolean }) => (
    <div data-testid={`row-${message.id}`} data-pending={String(isPending)}>
      {message.id}
    </div>
  ),
}));

import { MessageList } from './MessageList';

function makeMessage(id: string): ChatMessage {
  return {
    id,
    name: 'User',
    role: 'user',
    content: [{ type: 'text', text: id }],
    metadata: {},
    timestamp: '2026-04-17T10:00:00Z',
    timestampLabel: '10:00',
    groupedWithPrevious: false,
  } as ChatMessage;
}

describe('chat/ChatPanel/parts/MessageList', () => {
  it('renders one MessageRow per message and marks the pending one', () => {
    render(<MessageList messages={[makeMessage('a'), makeMessage('b')]} pendingMessageId="b" />);

    expect(screen.getByTestId('row-a').getAttribute('data-pending')).toBe('false');
    expect(screen.getByTestId('row-b').getAttribute('data-pending')).toBe('true');
  });

  it('marks no row as pending when pendingMessageId is null', () => {
    render(<MessageList messages={[makeMessage('a')]} pendingMessageId={null} />);
    expect(screen.getByTestId('row-a').getAttribute('data-pending')).toBe('false');
  });
});
