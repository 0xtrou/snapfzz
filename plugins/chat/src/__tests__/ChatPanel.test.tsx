// @vitest-environment jsdom
// Spec: chat/SPEC.md
// Sections: ChatPanel component, Composer, U009 design system
// Verifies: empty state, message rendering, send/stop button states, composer placeholder
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

vi.mock('../hooks/use-chat', () => ({
  useChat: vi.fn(() => ({
    messages: [],
    isStreaming: false,
    pendingMessageId: null,
    tokenCount: 0,
    connectionStatus: 'connected' as const,
    sessionId: 'mock-session',
    send: vi.fn(),
    stop: vi.fn(),
    clearConversation: vi.fn(),
  })),
}));

vi.mock('@snapfzz/shared', () => ({
  PretextList: ({
    items,
    renderItem,
    keyExtractor,
    estimateHeight,
    onAtBottomChange,
  }: {
    items: unknown[];
    renderItem: (item: unknown) => React.ReactNode;
    keyExtractor: (item: unknown) => string;
    estimateHeight?: (item: unknown) => number;
    onAtBottomChange?: (atBottom: boolean) => void;
  }) => (
    <div data-testid="pretext-list">
      <button data-testid="simulate-not-at-bottom" onClick={() => onAtBottomChange?.(false)} type="button">
        simulate
      </button>
      {items.map((item, i) => (
        <div key={keyExtractor(item, i)}>
          <span data-testid="estimated-height">{estimateHeight?.(item) ?? 0}</span>
          {renderItem(item, i)}
        </div>
      ))}
    </div>
  ),
  PretextBubble: ({ children, variant }: { children: React.ReactNode; variant?: string }) =>
    <article data-testid="pretext-bubble" data-variant={variant}>{children}</article>,
  PretextMarkdown: ({ text }: { text: string }) =>
    <div data-testid="pretext-markdown">{text}</div>,
  PretextInput: ({ value, onChange, onSubmit, placeholder, disabled }: {
    value: string;
    onChange: (v: string) => void;
    onSubmit?: () => void;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <textarea
      data-testid="pretext-input"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) onSubmit?.(); }}
    />
  ),
  prepare: vi.fn(() => ({})),
  layout: vi.fn(() => ({ height: 80, lineCount: 2 })),
}));

vi.mock('../components/ThinkingCallout', () => ({
  ThinkingCallout: ({ block }: { block: { thinking: string } }) =>
    <div data-testid="thinking-callout">{block.thinking}</div>,
}));
vi.mock('../components/ToolUseCard', () => ({
  ToolUseCard: ({ block }: { block: { name: string } }) =>
    <div data-testid="tool-use-card">{block.name}</div>,
}));
vi.mock('../components/ToolResultInline', () => ({
  ToolResultInline: ({ block }: { block: { name?: string } }) =>
    <div data-testid="tool-result-inline">{block.name}</div>,
}));
vi.mock('../components/ImageContent', () => ({
  ImageContent: () => <div data-testid="image-content" />,
}));
vi.mock('../components/AudioPlayer', () => ({
  AudioPlayer: () => <div data-testid="audio-player" />,
}));
vi.mock('../components/VideoPlayer', () => ({
  VideoPlayer: () => <div data-testid="video-player" />,
}));
vi.mock('../components/ThinkingIndicator', () => ({
  ThinkingIndicator: ({ visible }: { visible: boolean }) =>
    <div data-testid="thinking-indicator" data-visible={visible} />,
}));
vi.mock('../components/ScrollPill', () => ({
  ScrollPill: ({ visible }: { visible: boolean }) =>
    <div data-testid="scroll-pill" data-visible={visible} />,
}));

async function renderChatPanel() {
  const { default: ChatPanel } = await import('../contributions/ChatPanel');
  return render(<ChatPanel />);
}

describe('chat/ChatPanel: empty state', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('chat/ChatPanel: shows empty state prompt when no messages', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    expect(screen.getByText('Ask the orchestrator anything to start.')).toBeDefined();
  });

  it('chat/ChatPanel: PretextList is not rendered when messages array is empty', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    expect(screen.queryByTestId('pretext-list')).toBeNull();
  });
});

describe('chat/ChatPanel: message rendering', () => {
  it('chat/ChatPanel: hides header name/timestamp when groupedWithPrevious is true', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [
        {
          id: 'msg-grouped',
          name: 'Orchestrator',
          role: 'assistant',
          content: [{ type: 'text' as const, text: 'Grouped message', segments: [] }],
          metadata: {},
          timestamp: '2026-04-06T10:00:00Z',
          timestampLabel: '10:00',
          groupedWithPrevious: true,
        },
      ],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    expect(screen.queryByText('Orchestrator')).toBeNull();
    expect(screen.queryByText('10:00')).toBeNull();
  });

  it('chat/ChatPanel: renders PretextList when messages exist', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [
        {
          id: 'msg-1',
          name: 'User',
          role: 'user',
          content: [{ type: 'text' as const, text: 'Hello', segments: [] }],
          metadata: {},
          timestamp: '2026-04-06T10:00:00Z',
          timestampLabel: '10:00',
          groupedWithPrevious: false,
        },
      ],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    expect(screen.getByTestId('pretext-list')).toBeDefined();
  });

  it('chat/ChatPanel: renders PretextBubble with user variant for user messages', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [
        {
          id: 'msg-user',
          name: 'User',
          role: 'user',
          content: [{ type: 'text' as const, text: 'My message', segments: [] }],
          metadata: {},
          timestamp: '2026-04-06T10:00:00Z',
          timestampLabel: '10:00',
          groupedWithPrevious: false,
        },
      ],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    const bubble = screen.getByTestId('pretext-bubble');
    expect(bubble.getAttribute('data-variant')).toBe('user');
  });

  it('chat/ChatPanel: renders PretextMarkdown for text blocks', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [
        {
          id: 'msg-text',
          name: 'Orchestrator',
          role: 'assistant',
          content: [{ type: 'text' as const, text: 'Hello world', segments: [] }],
          metadata: {},
          timestamp: '2026-04-06T10:00:00Z',
          timestampLabel: '10:00',
          groupedWithPrevious: false,
        },
      ],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    expect(screen.getByTestId('pretext-markdown')).toBeDefined();
    expect(screen.getByTestId('pretext-markdown').textContent).toBe('Hello world');
  });

  it('chat/ChatPanel: renders ThinkingCallout for thinking blocks', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [
        {
          id: 'msg-think',
          name: 'Orchestrator',
          role: 'assistant',
          content: [{ type: 'thinking' as const, thinking: 'Pondering...' }],
          metadata: {},
          timestamp: '2026-04-06T10:00:00Z',
          timestampLabel: '10:00',
          groupedWithPrevious: false,
        },
      ],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    expect(screen.getByTestId('thinking-callout')).toBeDefined();
    expect(screen.getByTestId('thinking-callout').textContent).toBe('Pondering...');
  });

  it('chat/ChatPanel: renders ToolUseCard for tool_use blocks', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [
        {
          id: 'msg-tool',
          name: 'Orchestrator',
          role: 'assistant',
          content: [{ type: 'tool_use' as const, id: 't1', name: 'write_file', input: {}, inputPreview: '{}' }],
          metadata: {},
          timestamp: '2026-04-06T10:00:00Z',
          timestampLabel: '10:00',
          groupedWithPrevious: false,
        },
      ],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    expect(screen.getByTestId('tool-use-card')).toBeDefined();
    expect(screen.getByTestId('tool-use-card').textContent).toBe('write_file');
  });
});

describe('chat/ChatPanel: composer behavior', () => {
  it('chat/ChatPanel: PretextInput has correct placeholder', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    const input = screen.getByTestId('pretext-input') as HTMLTextAreaElement;
    expect(input.placeholder).toBe('Ask the orchestrator anything...');
  });

  it('chat/ChatPanel: Send button shows Send text when idle', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    expect(screen.getByRole('button').textContent).toContain('Send');
  });

  it('chat/ChatPanel: button shows Stop text when streaming', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      isStreaming: true,
      pendingMessageId: 'pending-1',
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    expect(screen.getByRole('button').textContent).toContain('Stop');
  });

  it('chat/ChatPanel: PretextInput is disabled when streaming', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      isStreaming: true,
      pendingMessageId: 'pending-1',
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    const input = screen.getByTestId('pretext-input') as HTMLTextAreaElement;
    expect(input.disabled).toBe(true);
  });

  it('chat/ChatPanel: clicking Stop button calls stop()', async () => {
    const stop = vi.fn();
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      isStreaming: true,
      pendingMessageId: 'p1',
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop,
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));

    expect(stop).toHaveBeenCalled();
  });
});

describe('chat/ChatPanel: additional block types in renderBlock', () => {
  it('chat/ChatPanel: renders ToolResultInline for tool_result blocks', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [
        {
          id: 'msg-tr',
          name: 'Orchestrator',
          role: 'assistant',
          content: [{ type: 'tool_result' as const, id: 'r1', output: 'done', outputPreview: 'done result' }],
          metadata: {},
          timestamp: '2026-04-06T10:00:00Z',
          timestampLabel: '10:00',
          groupedWithPrevious: false,
        },
      ],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    expect(screen.getByTestId('tool-result-inline')).toBeDefined();
  });

  it('chat/ChatPanel: send button triggers send() with input text', async () => {
    const send = vi.fn();
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send,
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    const user = userEvent.setup();
    const textarea = screen.getByTestId('pretext-input');
    await user.type(textarea, 'Hello agent');
    await user.click(screen.getByRole('button'));

    expect(send).toHaveBeenCalledWith('Hello agent');
  });
});

describe('chat/ChatPanel: scroll pill and estimated height', () => {
  it('chat/ChatPanel: shows scroll pill when list reports user is not at bottom', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [
        {
          id: 'msg-scroll',
          name: 'User',
          role: 'user',
          content: [{ type: 'text' as const, text: 'Hello', segments: [] }],
          metadata: {},
          timestamp: '2026-04-06T10:00:00Z',
          timestampLabel: '10:00',
          groupedWithPrevious: false,
        },
      ],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('simulate-not-at-bottom'));

    expect(screen.getByTestId('scroll-pill').getAttribute('data-visible')).toBe('true');
  });

  it('chat/ChatPanel: estimateHeight returns fallback 100 for non-text messages', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [
        {
          id: 'msg-image',
          name: 'Orchestrator',
          role: 'assistant',
          content: [{ type: 'image' as const, source: 'https://example.com/image.png', alt: 'Preview' }],
          metadata: {},
          timestamp: '2026-04-06T10:00:00Z',
          timestampLabel: '10:00',
          groupedWithPrevious: false,
        },
      ],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    expect(screen.getByTestId('estimated-height').textContent).toBe('100');
  });
});

describe('chat/ChatPanel: ThinkingIndicator visibility', () => {
  it('chat/ChatPanel: ThinkingIndicator visible when streaming with pendingMessageId', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      isStreaming: true,
      pendingMessageId: 'pending-msg',
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    const indicator = screen.getByTestId('thinking-indicator');
    expect(indicator.getAttribute('data-visible')).toBe('true');
  });

  it('chat/ChatPanel: ThinkingIndicator not visible when idle', async () => {
    const { useChat } = await import('../hooks/use-chat');
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      isStreaming: false,
      pendingMessageId: null,
      tokenCount: 0,
      connectionStatus: 'connected',
      sessionId: 'mock-session',
      send: vi.fn(),
      stop: vi.fn(),
      clearConversation: vi.fn(),
    });

    await renderChatPanel();

    const indicator = screen.getByTestId('thinking-indicator');
    expect(indicator.getAttribute('data-visible')).toBe('false');
  });
});
