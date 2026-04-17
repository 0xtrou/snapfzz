// @vitest-environment jsdom
// Spec: chat/SPEC.md — MessageContent stacks BlockRenderer results per block.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ChatMessage } from '../../../types';

vi.mock('./BlockRenderer', () => ({
  BlockRenderer: ({ block }: { block: { type: string } }) => (
    <div data-testid={`block-${block.type}`} />
  ),
}));

import { MessageContent } from './MessageContent';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm',
    name: 'User',
    role: 'user',
    content: [],
    metadata: {},
    timestamp: '2026-04-17T10:00:00Z',
    timestampLabel: '10:00',
    groupedWithPrevious: false,
    ...overrides,
  } as ChatMessage;
}

describe('chat/ChatPanel/parts/MessageContent: stack', () => {
  it('renders one BlockRenderer per content block', () => {
    render(
      <MessageContent
        message={makeMessage({
          content: [
            { type: 'text', text: 'a' },
            { type: 'thinking', thinking: 'b' },
            { type: 'image', source: 'c.png' },
          ],
        })}
      />,
    );

    expect(screen.getByTestId('block-text')).toBeTruthy();
    expect(screen.getByTestId('block-thinking')).toBeTruthy();
    expect(screen.getByTestId('block-image')).toBeTruthy();
  });

  it('renders nothing when content is empty', () => {
    const { container } = render(<MessageContent message={makeMessage()} />);
    expect(container.querySelectorAll('[data-testid^="block-"]')).toHaveLength(0);
  });
});
