// @vitest-environment jsdom
// Spec: chat/SPEC.md
// Sections: ContentBlock rendering map, MessageBubble dispatch logic
// Verifies: role-based styling, block type dispatch to correct sub-components, grouped/ungrouped header logic
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ChatMessage } from '../types';

vi.mock('./TextContent', () => ({
  TextContent: ({ block }: { block: { text: string } }) =>
    <div data-testid="text-content">{block.text}</div>,
}), { virtual: true });

vi.mock('../components/TextContent', () => ({
  TextContent: ({ block }: { block: { text: string } }) =>
    <div data-testid="text-content">{block.text}</div>,
}));
vi.mock('../components/ThinkingCallout', () => ({
  ThinkingCallout: ({ block }: { block: { thinking: string } }) =>
    <div data-testid="thinking-callout">{block.thinking}</div>,
}));
vi.mock('../components/ToolUseCard', () => ({
  ToolUseCard: ({ block }: { block: { name: string; inputPreview: string } }) =>
    <div data-testid="tool-use-card" data-name={block.name}>{block.inputPreview}</div>,
}));
vi.mock('../components/ToolResultInline', () => ({
  ToolResultInline: ({ block }: { block: { outputPreview: string } }) =>
    <div data-testid="tool-result-inline">{block.outputPreview}</div>,
}));
vi.mock('../components/ImageContent', () => ({
  ImageContent: ({ block }: { block: { source: string } }) =>
    <div data-testid="image-content" data-src={block.source} />,
}));
vi.mock('../components/AudioPlayer', () => ({
  AudioPlayer: ({ block }: { block: { source: string } }) =>
    <div data-testid="audio-player" data-src={block.source} />,
}));
vi.mock('../components/VideoPlayer', () => ({
  VideoPlayer: ({ block }: { block: { source: string } }) =>
    <div data-testid="video-player" data-src={block.source} />,
}));

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    name: 'Orchestrator',
    role: 'assistant',
    content: [],
    metadata: {},
    timestamp: '2026-04-06T10:00:00Z',
    timestampLabel: '10:00',
    groupedWithPrevious: false,
    ...overrides,
  };
}

describe('chat/MessageBubble: role-based styling', () => {
  it('chat/MessageBubble: user message renders article element', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({ role: 'user', name: 'User' });
    const { container } = render(<MessageBubble message={message} />);

    expect(container.querySelector('article')).toBeDefined();
  });

  it('chat/MessageBubble: assistant message renders article element', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({ role: 'assistant', name: 'Orchestrator' });
    const { container } = render(<MessageBubble message={message} />);

    expect(container.querySelector('article')).toBeDefined();
  });

  it('chat/MessageBubble: user bubble has bg-default background CSS variable', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({ role: 'user', name: 'User' });
    const { container } = render(<MessageBubble message={message} />);

    const article = container.querySelector('article') as HTMLElement;
    expect(article.style.background).toBe('var(--bg-default)');
  });

  it('chat/MessageBubble: assistant bubble has bg-subtle background CSS variable', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({ role: 'assistant' });
    const { container } = render(<MessageBubble message={message} />);

    const article = container.querySelector('article') as HTMLElement;
    expect(article.style.background).toBe('var(--bg-subtle)');
  });
});

describe('chat/MessageBubble: header rendering', () => {
  it('chat/MessageBubble: shows sender name when not grouped', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({ name: 'Orchestrator', groupedWithPrevious: false });
    render(<MessageBubble message={message} />);

    expect(screen.getByText('Orchestrator')).toBeDefined();
  });

  it('chat/MessageBubble: shows timestamp label when not grouped', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({ timestampLabel: '14:30', groupedWithPrevious: false });
    render(<MessageBubble message={message} />);

    expect(screen.getByText('14:30')).toBeDefined();
  });

  it('chat/MessageBubble: does not show header strong when grouped with previous', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({ name: 'Orchestrator', groupedWithPrevious: true });
    render(<MessageBubble message={message} />);

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText('Orchestrator')).toBeNull();
  });

  it('chat/MessageBubble: shows footer timestamp when grouped with previous', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({ timestampLabel: '14:31', groupedWithPrevious: true });
    render(<MessageBubble message={message} />);

    const footer = screen.getByText('14:31');
    expect(footer).toBeDefined();
  });
});

describe('chat/MessageBubble: ContentBlock dispatch', () => {
  it('chat/MessageBubble: dispatches TextBlock to TextContent component', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({
      content: [{ type: 'text', text: 'Hello there', segments: [] }],
    });
    render(<MessageBubble message={message} />);

    expect(screen.getByTestId('text-content').textContent).toBe('Hello there');
  });

  it('chat/MessageBubble: dispatches ThinkingBlock to ThinkingCallout component', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({
      content: [{ type: 'thinking', thinking: 'Analyzing requirements...' }],
    });
    render(<MessageBubble message={message} />);

    expect(screen.getByTestId('thinking-callout').textContent).toBe('Analyzing requirements...');
  });

  it('chat/MessageBubble: dispatches ToolUseBlock to ToolUseCard component', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({
      content: [{
        type: 'tool_use',
        id: 'tool-1',
        name: 'read_file',
        input: { path: 'src/main.ts' },
        inputPreview: '{"path":"src/main.ts"}',
      }],
    });
    render(<MessageBubble message={message} />);

    const card = screen.getByTestId('tool-use-card');
    expect(card.getAttribute('data-name')).toBe('read_file');
  });

  it('chat/MessageBubble: dispatches ToolResultBlock to ToolResultInline component', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({
      content: [{
        type: 'tool_result',
        id: 'tool-1',
        output: 'file contents',
        outputPreview: 'file contents',
      }],
    });
    render(<MessageBubble message={message} />);

    expect(screen.getByTestId('tool-result-inline').textContent).toBe('file contents');
  });

  it('chat/MessageBubble: dispatches ImageBlock to ImageContent component', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({
      content: [{ type: 'image', source: 'https://example.com/img.png' }],
    });
    render(<MessageBubble message={message} />);

    const img = screen.getByTestId('image-content');
    expect(img.getAttribute('data-src')).toBe('https://example.com/img.png');
  });

  it('chat/MessageBubble: dispatches AudioBlock to AudioPlayer component', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({
      content: [{ type: 'audio', source: 'https://example.com/audio.mp3' }],
    });
    render(<MessageBubble message={message} />);

    const player = screen.getByTestId('audio-player');
    expect(player.getAttribute('data-src')).toBe('https://example.com/audio.mp3');
  });

  it('chat/MessageBubble: dispatches VideoBlock to VideoPlayer component', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({
      content: [{ type: 'video', source: 'https://example.com/video.mp4' }],
    });
    render(<MessageBubble message={message} />);

    const player = screen.getByTestId('video-player');
    expect(player.getAttribute('data-src')).toBe('https://example.com/video.mp4');
  });

  it('chat/MessageBubble: renders multiple content blocks in order', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const message = makeMessage({
      content: [
        { type: 'thinking', thinking: 'Thinking first' },
        { type: 'text', text: 'Then responding', segments: [] },
      ],
    });
    render(<MessageBubble message={message} />);

    expect(screen.getByTestId('thinking-callout')).toBeDefined();
    expect(screen.getByTestId('text-content')).toBeDefined();
  });
});

describe('chat/MessageBubble: margintop grouping', () => {
  it('chat/MessageBubble: applies smaller marginTop when grouped', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const grouped = makeMessage({ groupedWithPrevious: true });
    const { container } = render(<MessageBubble message={grouped} />);

    const article = container.querySelector('article') as HTMLElement;
    expect(article.style.marginTop).toBe('6px');
  });

  it('chat/MessageBubble: applies larger marginTop when not grouped', async () => {
    const { MessageBubble } = await import('../components/MessageBubble');

    const ungrouped = makeMessage({ groupedWithPrevious: false });
    const { container } = render(<MessageBubble message={ungrouped} />);

    const article = container.querySelector('article') as HTMLElement;
    expect(article.style.marginTop).toBe('14px');
  });
});
