// @vitest-environment jsdom
// Spec: chat/SPEC.md
// Sections: status item contributions, Rust Bridge Commands (agent_health)
// Verifies: connected/reconnecting/disconnected label text and color CSS variables
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/use-chat', () => ({
  useChat: vi.fn(() => ({
    connectionStatus: 'connected' as const,
    messages: [],
    isStreaming: false,
    pendingMessageId: null,
    tokenCount: 0,
    sessionId: 'mock',
    send: vi.fn(),
    stop: vi.fn(),
    clearConversation: vi.fn(),
  })),
}));

describe('chat/ConnectionStatus: status label text', () => {
  it('chat/ConnectionStatus: shows Connected when status is connected', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      connectionStatus: 'connected',
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      sessionId: 'mock',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    const { default: ConnectionStatus } = await import('../contributions/ConnectionStatus');
    render(<ConnectionStatus />);

    expect(screen.getByText('Connected')).toBeDefined();
  });

  it('chat/ConnectionStatus: shows Reconnecting... when status is reconnecting', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      connectionStatus: 'reconnecting',
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      sessionId: 'mock',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    const { default: ConnectionStatus } = await import('../contributions/ConnectionStatus');
    render(<ConnectionStatus />);

    expect(screen.getByText('Reconnecting...')).toBeDefined();
  });

  it('chat/ConnectionStatus: shows Disconnected when status is disconnected', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      connectionStatus: 'disconnected',
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      sessionId: 'mock',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    const { default: ConnectionStatus } = await import('../contributions/ConnectionStatus');
    render(<ConnectionStatus />);

    expect(screen.getByText('Disconnected')).toBeDefined();
  });
});

describe('chat/ConnectionStatus: status color', () => {
  it('chat/ConnectionStatus: applies success color variable when connected', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      connectionStatus: 'connected',
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      sessionId: 'mock',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    const { default: ConnectionStatus } = await import('../contributions/ConnectionStatus');
    const { container } = render(<ConnectionStatus />);

    const span = container.querySelector('span') as HTMLElement;
    expect(span.style.color).toBe('var(--color-success)');
  });

  it('chat/ConnectionStatus: applies warning color variable when reconnecting', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      connectionStatus: 'reconnecting',
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      sessionId: 'mock',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    const { default: ConnectionStatus } = await import('../contributions/ConnectionStatus');
    const { container } = render(<ConnectionStatus />);

    const span = container.querySelector('span') as HTMLElement;
    expect(span.style.color).toBe('var(--color-warning)');
  });

  it('chat/ConnectionStatus: applies error color variable when disconnected', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      connectionStatus: 'disconnected',
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      sessionId: 'mock',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    const { default: ConnectionStatus } = await import('../contributions/ConnectionStatus');
    const { container } = render(<ConnectionStatus />);

    const span = container.querySelector('span') as HTMLElement;
    expect(span.style.color).toBe('var(--color-error)');
  });
});
