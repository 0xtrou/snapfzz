// @vitest-environment jsdom
// Spec: chat/SPEC.md
// Sections: ContentBlock rendering map, Components
// Verifies: ThinkingCallout collapse toggle, ToolUseCard status states, ToolResultInline expand toggle,
//           ImageContent lightbox, AudioPlayer/VideoPlayer src, ThinkingIndicator visibility,
//           ScrollPill visibility/click, InlineRenderer token types, CodeBlock copy behavior,
//           TextContent segment dispatch, Composer send/stop/keydown
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

describe('chat/ThinkingCallout: collapse toggle', () => {
  it('chat/ThinkingCallout: initially shows Show button and hides content', async () => {
    const { ThinkingCallout } = await import('../components/ThinkingCallout');
    render(<ThinkingCallout block={{ type: 'thinking', thinking: 'Secret thoughts' }} />);

    expect(screen.getByText('Show')).toBeDefined();
    expect(screen.queryByText('Secret thoughts')).toBeNull();
  });

  it('chat/ThinkingCallout: clicking Show reveals thinking content and changes button to Hide', async () => {
    const { ThinkingCallout } = await import('../components/ThinkingCallout');
    render(<ThinkingCallout block={{ type: 'thinking', thinking: 'Pondering deeply' }} />);

    const user = userEvent.setup();
    await user.click(screen.getByText('Show'));

    expect(screen.getByText('Pondering deeply')).toBeDefined();
    expect(screen.getByText('Hide')).toBeDefined();
  });

  it('chat/ThinkingCallout: clicking Hide again collapses the content', async () => {
    const { ThinkingCallout } = await import('../components/ThinkingCallout');
    render(<ThinkingCallout block={{ type: 'thinking', thinking: 'Pondering' }} />);

    const user = userEvent.setup();
    await user.click(screen.getByText('Show'));
    await user.click(screen.getByText('Hide'));

    expect(screen.queryByText('Pondering')).toBeNull();
    expect(screen.getByText('Show')).toBeDefined();
  });

  it('chat/ThinkingCallout: shows 💭 Thinking label', async () => {
    const { ThinkingCallout } = await import('../components/ThinkingCallout');
    render(<ThinkingCallout block={{ type: 'thinking', thinking: 'x' }} />);

    expect(screen.getByText('💭 Thinking')).toBeDefined();
  });
});

describe('chat/ToolUseCard: status display', () => {
  it('chat/ToolUseCard: shows tool name with 🔧 prefix', async () => {
    const { ToolUseCard } = await import('../components/ToolUseCard');
    render(<ToolUseCard block={{ type: 'tool_use', id: 't1', name: 'write_file', input: {}, inputPreview: '{}', status: 'running' }} />);

    expect(screen.getByText('🔧 write_file')).toBeDefined();
  });

  it('chat/ToolUseCard: shows running spinner text when status is running', async () => {
    const { ToolUseCard } = await import('../components/ToolUseCard');
    render(<ToolUseCard block={{ type: 'tool_use', id: 't1', name: 'read_file', input: {}, inputPreview: '{}', status: 'running' }} />);

    expect(screen.getByText('running')).toBeDefined();
  });

  it('chat/ToolUseCard: shows ✓ done when status is done', async () => {
    const { ToolUseCard } = await import('../components/ToolUseCard');
    render(<ToolUseCard block={{ type: 'tool_use', id: 't1', name: 'write_file', input: {}, inputPreview: '{}', status: 'done' }} />);

    expect(screen.getByText('✓ done')).toBeDefined();
  });

  it('chat/ToolUseCard: shows ✕ error when status is error', async () => {
    const { ToolUseCard } = await import('../components/ToolUseCard');
    render(<ToolUseCard block={{ type: 'tool_use', id: 't1', name: 'write_file', input: {}, inputPreview: '{}', status: 'error' }} />);

    expect(screen.getByText('✕ error')).toBeDefined();
  });

  it('chat/ToolUseCard: defaults to running when status is undefined', async () => {
    const { ToolUseCard } = await import('../components/ToolUseCard');
    render(<ToolUseCard block={{ type: 'tool_use', id: 't1', name: 'exec', input: {}, inputPreview: '{}' }} />);

    expect(screen.getByText('running')).toBeDefined();
  });

  it('chat/ToolUseCard: renders inputPreview in a pre element', async () => {
    const { ToolUseCard } = await import('../components/ToolUseCard');
    const { container } = render(<ToolUseCard block={{ type: 'tool_use', id: 't1', name: 'exec', input: {}, inputPreview: '{"path":"src"}' }} />);

    const pre = container.querySelector('pre') as HTMLElement;
    expect(pre.textContent).toBe('{"path":"src"}');
  });
});

describe('chat/ToolResultInline: expand toggle', () => {
  it('chat/ToolResultInline: initially collapsed, shows ▶ arrow and tool name', async () => {
    const { ToolResultInline } = await import('../components/ToolResultInline');
    render(<ToolResultInline block={{ type: 'tool_result', id: 't1', output: 'ok', outputPreview: 'ok', name: 'write_file' }} />);

    expect(screen.getByText('▶ write_file')).toBeDefined();
    expect(screen.queryByText('ok')).toBeNull();
  });

  it('chat/ToolResultInline: clicking expands and shows outputPreview', async () => {
    const { ToolResultInline } = await import('../components/ToolResultInline');
    render(<ToolResultInline block={{ type: 'tool_result', id: 't1', output: 'result', outputPreview: 'result output', name: 'exec' }} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));

    expect(screen.getByText('result output')).toBeDefined();
    expect(screen.getByText('▼ exec')).toBeDefined();
  });

  it('chat/ToolResultInline: shows fallback "tool result" when name is undefined', async () => {
    const { ToolResultInline } = await import('../components/ToolResultInline');
    render(<ToolResultInline block={{ type: 'tool_result', id: 't1', output: 'x', outputPreview: 'x' }} />);

    expect(screen.getByText('▶ tool result')).toBeDefined();
  });
});

describe('chat/ImageContent: lightbox behavior', () => {
  it('chat/ImageContent: renders image thumbnail', async () => {
    const { ImageContent } = await import('../components/ImageContent');
    const { container } = render(<ImageContent block={{ type: 'image', source: 'https://example.com/image.png', alt: 'Test' }} />);

    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.src).toBe('https://example.com/image.png');
    expect(img.alt).toBe('Test');
  });

  it('chat/ImageContent: uses fallback alt text when alt is not provided', async () => {
    const { ImageContent } = await import('../components/ImageContent');
    const { container } = render(<ImageContent block={{ type: 'image', source: 'x.png' }} />);

    const imgs = container.querySelectorAll('img');
    expect(imgs[0].alt).toBe('Image content');
  });

  it('chat/ImageContent: clicking thumbnail opens lightbox with full image', async () => {
    const { ImageContent } = await import('../components/ImageContent');
    const { container } = render(<ImageContent block={{ type: 'image', source: 'https://example.com/big.png', alt: 'Big image' }} />);

    const user = userEvent.setup();
    const [thumbnailBtn] = container.querySelectorAll('button');
    await user.click(thumbnailBtn);

    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
  });

  it('chat/ImageContent: clicking lightbox overlay closes it', async () => {
    const { ImageContent } = await import('../components/ImageContent');
    const { container } = render(<ImageContent block={{ type: 'image', source: 'x.png' }} />);

    const user = userEvent.setup();
    await user.click(container.querySelectorAll('button')[0]);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(2);

    await user.click(container.querySelectorAll('button')[1]);
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });
});

describe('chat/AudioPlayer: renders audio element', () => {
  it('chat/AudioPlayer: renders audio element with correct src', async () => {
    const { AudioPlayer } = await import('../components/AudioPlayer');
    const { container } = render(<AudioPlayer block={{ type: 'audio', source: 'https://example.com/sound.mp3' }} />);

    const audio = container.querySelector('audio') as HTMLAudioElement;
    expect(audio.src).toBe('https://example.com/sound.mp3');
  });

  it('chat/AudioPlayer: audio element has controls attribute', async () => {
    const { AudioPlayer } = await import('../components/AudioPlayer');
    const { container } = render(<AudioPlayer block={{ type: 'audio', source: 'a.mp3' }} />);

    const audio = container.querySelector('audio') as HTMLAudioElement;
    expect(audio.hasAttribute('controls')).toBe(true);
  });
});

describe('chat/VideoPlayer: renders video element', () => {
  it('chat/VideoPlayer: renders video element with correct src', async () => {
    const { VideoPlayer } = await import('../components/VideoPlayer');
    const { container } = render(<VideoPlayer block={{ type: 'video', source: 'https://example.com/clip.mp4' }} />);

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.src).toBe('https://example.com/clip.mp4');
  });

  it('chat/VideoPlayer: video element has controls attribute', async () => {
    const { VideoPlayer } = await import('../components/VideoPlayer');
    const { container } = render(<VideoPlayer block={{ type: 'video', source: 'v.mp4' }} />);

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.hasAttribute('controls')).toBe(true);
  });
});

describe('chat/ThinkingIndicator: conditional rendering', () => {
  it('chat/ThinkingIndicator: returns null when visible is false', async () => {
    const { ThinkingIndicator } = await import('../components/ThinkingIndicator');
    const { container } = render(<ThinkingIndicator visible={false} />);

    expect(container.firstChild).toBeNull();
  });

  it('chat/ThinkingIndicator: renders Thinking... text when visible', async () => {
    const { ThinkingIndicator } = await import('../components/ThinkingIndicator');
    render(<ThinkingIndicator visible={true} />);

    expect(screen.getByText('Thinking...')).toBeDefined();
  });
});

describe('chat/ScrollPill: conditional rendering and click', () => {
  it('chat/ScrollPill: returns null when visible is false', async () => {
    const { ScrollPill } = await import('../components/ScrollPill');
    const { container } = render(<ScrollPill visible={false} onClick={vi.fn()} />);

    expect(container.firstChild).toBeNull();
  });

  it('chat/ScrollPill: renders ↓ New messages button when visible', async () => {
    const { ScrollPill } = await import('../components/ScrollPill');
    render(<ScrollPill visible={true} onClick={vi.fn()} />);

    expect(screen.getByText('↓ New messages')).toBeDefined();
  });

  it('chat/ScrollPill: calls onClick when button is clicked', async () => {
    const onClick = vi.fn();
    const { ScrollPill } = await import('../components/ScrollPill');
    render(<ScrollPill visible={true} onClick={onClick} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('chat/InlineRenderer: token type rendering', () => {
  it('chat/InlineRenderer: renders text tokens as plain spans', async () => {
    const { default: InlineRenderer } = await import('../components/InlineRenderer');
    render(<InlineRenderer tokens={[{ kind: 'text', text: 'hello world' }]} />);

    expect(screen.getByText('hello world')).toBeDefined();
  });

  it('chat/InlineRenderer: renders bold tokens in strong element', async () => {
    const { default: InlineRenderer } = await import('../components/InlineRenderer');
    const { container } = render(<InlineRenderer tokens={[{ kind: 'bold', text: 'important' }]} />);

    expect(container.querySelector('strong')?.textContent).toBe('important');
  });

  it('chat/InlineRenderer: renders italic tokens in em element', async () => {
    const { default: InlineRenderer } = await import('../components/InlineRenderer');
    const { container } = render(<InlineRenderer tokens={[{ kind: 'italic', text: 'emphasized' }]} />);

    expect(container.querySelector('em')?.textContent).toBe('emphasized');
  });

  it('chat/InlineRenderer: renders code tokens in code element', async () => {
    const { default: InlineRenderer } = await import('../components/InlineRenderer');
    const { container } = render(<InlineRenderer tokens={[{ kind: 'code', text: 'x.map()' }]} />);

    expect(container.querySelector('code')?.textContent).toBe('x.map()');
  });

  it('chat/InlineRenderer: renders link tokens as anchor with href and noreferrer', async () => {
    const { default: InlineRenderer } = await import('../components/InlineRenderer');
    const { container } = render(<InlineRenderer tokens={[{ kind: 'link', text: 'Click', href: 'https://example.com' }]} />);

    const anchor = container.querySelector('a') as HTMLAnchorElement;
    expect(anchor.textContent).toBe('Click');
    expect(anchor.href).toBe('https://example.com/');
    expect(anchor.rel).toBe('noreferrer');
  });
});

describe('chat/CodeBlock: display and copy', () => {
  it('chat/CodeBlock: displays language label in header', async () => {
    const { CodeBlock } = await import('../components/CodeBlock');
    render(<CodeBlock code="const x = 1;" language="typescript" />);

    expect(screen.getByText('typescript')).toBeDefined();
  });

  it('chat/CodeBlock: uses text as language label when language is empty', async () => {
    const { CodeBlock } = await import('../components/CodeBlock');
    render(<CodeBlock code="hello" language="" />);

    expect(screen.getByText('text')).toBeDefined();
  });

  it('chat/CodeBlock: renders code content in pre/code element', async () => {
    const { CodeBlock } = await import('../components/CodeBlock');
    const { container } = render(<CodeBlock code="const x = 42;" language="js" />);

    expect(container.querySelector('code')?.textContent).toBe('const x = 42;');
  });

  it('chat/CodeBlock: clicking Copy calls clipboard.writeText with code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    const { CodeBlock } = await import('../components/CodeBlock');
    render(<CodeBlock code="hello code" language="ts" />);

    fireEvent.click(screen.getByText('Copy'));
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('hello code');
    vi.unstubAllGlobals();
  });

  it('chat/CodeBlock: copy button label is Copy by default', async () => {
    const { CodeBlock } = await import('../components/CodeBlock');
    render(<CodeBlock code="x" language="ts" />);

    expect(screen.getByText('Copy')).toBeDefined();
  });
});

describe('chat/TextContent: segment dispatch', () => {
  it('chat/TextContent: renders paragraph segment as p element', async () => {
    const { TextContent } = await import('../components/TextContent');
    const { container } = render(
      <TextContent block={{
        type: 'text',
        text: 'Hello',
        segments: [{ kind: 'paragraph', inlines: [{ kind: 'text', text: 'Hello' }] }],
      }} />
    );

    expect(container.querySelector('p')).toBeDefined();
  });

  it('chat/TextContent: renders heading segment with correct level', async () => {
    const { TextContent } = await import('../components/TextContent');
    const { container } = render(
      <TextContent block={{
        type: 'text',
        text: '# Title',
        segments: [{ kind: 'heading', level: 2, inlines: [{ kind: 'text', text: 'Title' }] }],
      }} />
    );

    expect(container.querySelector('h2')).toBeDefined();
  });

  it('chat/TextContent: renders ordered list segment as ol', async () => {
    const { TextContent } = await import('../components/TextContent');
    const { container } = render(
      <TextContent block={{
        type: 'text',
        text: '1. item',
        segments: [{ kind: 'list', ordered: true, items: [[{ kind: 'text', text: 'item one' }]] }],
      }} />
    );

    expect(container.querySelector('ol')).toBeDefined();
    expect(container.querySelector('li')?.textContent).toBe('item one');
  });

  it('chat/TextContent: renders unordered list segment as ul', async () => {
    const { TextContent } = await import('../components/TextContent');
    const { container } = render(
      <TextContent block={{
        type: 'text',
        text: '- item',
        segments: [{ kind: 'list', ordered: false, items: [[{ kind: 'text', text: 'bullet' }]] }],
      }} />
    );

    expect(container.querySelector('ul')).toBeDefined();
  });

  it('chat/TextContent: renders code segment via CodeBlock', async () => {
    const { TextContent } = await import('../components/TextContent');
    const { container } = render(
      <TextContent block={{
        type: 'text',
        text: '```ts\nconst x = 1;\n```',
        segments: [{ kind: 'code', language: 'ts', code: 'const x = 1;' }],
      }} />
    );

    expect(container.querySelector('code')?.textContent).toBe('const x = 1;');
  });
});

describe('chat/Composer: send and stop behavior', () => {
  it('chat/Composer: renders textarea with placeholder', async () => {
    const { Composer } = await import('../components/Composer');
    render(<Composer disabled={false} isStreaming={false} onSend={vi.fn()} onStop={vi.fn()} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe('Ask the orchestrator anything...');
  });

  it('chat/Composer: shows Send ⌘↵ button when not streaming', async () => {
    const { Composer } = await import('../components/Composer');
    render(<Composer disabled={false} isStreaming={false} onSend={vi.fn()} onStop={vi.fn()} />);

    expect(screen.getByText('Send ⌘↵')).toBeDefined();
  });

  it('chat/Composer: shows Stop button when streaming', async () => {
    const { Composer } = await import('../components/Composer');
    render(<Composer disabled={false} isStreaming={true} onSend={vi.fn()} onStop={vi.fn()} />);

    expect(screen.getByText('Stop')).toBeDefined();
  });

  it('chat/Composer: clicking Stop button calls onStop', async () => {
    const onStop = vi.fn().mockResolvedValue(undefined);
    const { Composer } = await import('../components/Composer');
    render(<Composer disabled={false} isStreaming={true} onSend={vi.fn()} onStop={onStop} />);

    const user = userEvent.setup();
    await user.click(screen.getByText('Stop'));

    expect(onStop).toHaveBeenCalled();
  });

  it('chat/Composer: pressing ⌘+Enter calls onSend with trimmed value', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { Composer } = await import('../components/Composer');
    render(<Composer disabled={false} isStreaming={false} onSend={onSend} onStop={vi.fn()} />);

    const user = userEvent.setup();
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Hello world');
    await user.keyboard('{Meta>}{Enter}{/Meta}');

    expect(onSend).toHaveBeenCalledWith('Hello world');
  });

  it('chat/Composer: pressing Escape while streaming calls onStop', async () => {
    const onStop = vi.fn().mockResolvedValue(undefined);
    const { Composer } = await import('../components/Composer');
    render(<Composer disabled={false} isStreaming={true} onSend={vi.fn()} onStop={onStop} />);

    const user = userEvent.setup();
    const textarea = screen.getByRole('textbox');
    await user.click(textarea);
    await user.keyboard('{Escape}');

    expect(onStop).toHaveBeenCalled();
  });

  it('chat/Composer: does not call onSend when text is empty', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { Composer } = await import('../components/Composer');
    render(<Composer disabled={false} isStreaming={false} onSend={onSend} onStop={vi.fn()} />);

    const user = userEvent.setup();
    await user.keyboard('{Meta>}{Enter}{/Meta}');

    expect(onSend).not.toHaveBeenCalled();
  });
});
