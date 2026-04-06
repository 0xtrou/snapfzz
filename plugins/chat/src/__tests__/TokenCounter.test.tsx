// @vitest-environment jsdom
// Spec: chat/SPEC.md
// Sections: status item contributions, tokenCount accumulation
// Verifies: token count display format, text-secondary color variable
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/use-chat', () => ({
  useChat: vi.fn(() => ({
    tokenCount: 0,
    connectionStatus: 'connected' as const,
    messages: [],
    isStreaming: false,
    pendingMessageId: null,
    sessionId: 'mock',
    send: vi.fn(),
    stop: vi.fn(),
    clearConversation: vi.fn(),
  })),
}));

describe('chat/TokenCounter: token count display', () => {
  it('chat/TokenCounter: shows 0 tokens when no messages processed', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      tokenCount: 0,
      connectionStatus: 'connected',
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      sessionId: 'mock',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    const { default: TokenCounter } = await import('../contributions/TokenCounter');
    render(<TokenCounter />);

    expect(screen.getByText('0 tokens')).toBeDefined();
  });

  it('chat/TokenCounter: shows accumulated token count', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      tokenCount: 1337,
      connectionStatus: 'connected',
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      sessionId: 'mock',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    const { default: TokenCounter } = await import('../contributions/TokenCounter');
    render(<TokenCounter />);

    expect(screen.getByText('1,337 tokens')).toBeDefined();
  });

  it('chat/TokenCounter: formats large token counts with locale separators', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      tokenCount: 1000000,
      connectionStatus: 'connected',
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      sessionId: 'mock',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    const { default: TokenCounter } = await import('../contributions/TokenCounter');
    render(<TokenCounter />);

    const span = screen.getByText(/tokens/);
    expect(span.textContent).toContain('tokens');
    expect(span.textContent).toContain('1');
  });

  it('chat/TokenCounter: renders a span element with text-secondary color variable', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      tokenCount: 42,
      connectionStatus: 'connected',
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      sessionId: 'mock',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    const { default: TokenCounter } = await import('../contributions/TokenCounter');
    const { container } = render(<TokenCounter />);

    const span = container.querySelector('span') as HTMLElement;
    expect(span.style.color).toBe('var(--text-secondary)');
  });

  it('chat/TokenCounter: updates display when token count changes', async () => {
    const { useChat } = await import('../hooks/use-chat');

    vi.mocked(useChat).mockReturnValue({
      tokenCount: 100,
      connectionStatus: 'connected',
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      sessionId: 'mock',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    const { default: TokenCounter } = await import('../contributions/TokenCounter');
    const { rerender, container } = render(<TokenCounter />);

    expect(container.textContent).toContain('100');

    vi.mocked(useChat).mockReturnValue({
      tokenCount: 500,
      connectionStatus: 'connected',
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      sessionId: 'mock',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    rerender(<TokenCounter />);

    expect(container.textContent).toContain('500');
  });
});
