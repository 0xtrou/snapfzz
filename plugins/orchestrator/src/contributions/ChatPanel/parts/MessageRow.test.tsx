// @vitest-environment jsdom
// Spec: chat/SPEC.md — MessageRow wraps a Bubble around MessageContent with correct msgStatus.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ChatMessage } from '../../../types';

vi.mock('@agentscope-ai/chat', () => ({
  Bubble: ({
    content,
    msgStatus,
    avatar,
  }: {
    content: React.ReactNode;
    msgStatus?: string;
    avatar?: { icon: React.ReactNode };
  }) => (
    <div data-testid="bubble" data-status={msgStatus ?? ''}>
      <span data-testid="avatar">{avatar?.icon}</span>
      <div data-testid="content">{content}</div>
    </div>
  ),
}));
vi.mock('./MessageContent', () => ({
  MessageContent: ({ message }: { message: ChatMessage }) => <div data-testid="content-body">{message.id}</div>,
}));

import { MessageRow } from './MessageRow';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    name: 'User',
    role: 'user',
    content: [{ type: 'text', text: 't' }],
    metadata: {},
    timestamp: '2026-04-17T10:00:00Z',
    timestampLabel: '10:00',
    groupedWithPrevious: false,
    ...overrides,
  } as ChatMessage;
}

describe('chat/ChatPanel/parts/MessageRow: bubble wrapper', () => {
  it('forwards msgStatus=generating when the row is pending', () => {
    render(<MessageRow message={makeMessage()} isPending={true} />);
    expect(screen.getByTestId('bubble').getAttribute('data-status')).toBe('generating');
  });

  it('forwards msgStatus=finished when the row is idle', () => {
    render(<MessageRow message={makeMessage()} isPending={false} />);
    expect(screen.getByTestId('bubble').getAttribute('data-status')).toBe('finished');
  });

  it('renders MessageContent inside the bubble', () => {
    render(<MessageRow message={makeMessage({ id: 'abc' })} isPending={false} />);
    expect(screen.getByTestId('content-body').textContent).toBe('abc');
  });
});
