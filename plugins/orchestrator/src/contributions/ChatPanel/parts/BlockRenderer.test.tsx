// @vitest-environment jsdom
// Spec: chat/SPEC.md — ContentBlock rendering map.
// Verifies: BlockRenderer dispatches each block type to its Spark primitive.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@agentscope-ai/chat', () => ({
  Markdown: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
  DeepThinking: ({ title, content }: { title?: string; content?: string }) => (
    <div data-testid="deep-thinking" data-title={title}>{content}</div>
  ),
  OperateCard: ({
    header,
    body,
  }: {
    header: { title: React.ReactNode; description?: React.ReactNode };
    body?: { children?: React.ReactNode };
  }) => (
    <div data-testid="operate-card">
      <div data-testid="operate-title">{header.title}</div>
      <div data-testid="operate-status">{header.description}</div>
      <div data-testid="operate-body">{body?.children}</div>
    </div>
  ),
  StatusCard: ({
    title,
    status,
    description,
  }: {
    title: React.ReactNode;
    status: string;
    description?: string;
  }) => (
    <div data-testid="status-card" data-status={status}>
      <div data-testid="status-title">{title}</div>
      <div data-testid="status-description">{description}</div>
    </div>
  ),
}));

vi.mock('@agentscope-ai/design', () => ({
  Audio: (props: React.AudioHTMLAttributes<HTMLAudioElement>) => <audio data-testid="audio" {...props} />,
  Video: (props: React.VideoHTMLAttributes<HTMLVideoElement>) => <video data-testid="video" {...props} />,
  Image: ({ src, alt }: { src?: string; alt?: string }) => <img data-testid="image" src={src} alt={alt} />,
}));

import { BlockRenderer } from './BlockRenderer';

describe('chat/ChatPanel/parts/BlockRenderer: dispatch', () => {
  it('renders Markdown for text blocks', () => {
    render(<BlockRenderer block={{ type: 'text', text: 'hello' }} />);
    expect(screen.getByTestId('md').textContent).toBe('hello');
  });

  it('renders DeepThinking for thinking blocks', () => {
    render(<BlockRenderer block={{ type: 'thinking', thinking: 'thinking hard' }} />);
    const el = screen.getByTestId('deep-thinking');
    expect(el.textContent).toBe('thinking hard');
    expect(el.getAttribute('data-title')).toBe('Thinking');
  });

  it('renders OperateCard for tool_use with status label', () => {
    render(
      <BlockRenderer
        block={{ type: 'tool_use', id: 't', name: 'write_file', input: { path: 'a.ts' }, status: 'done' }}
      />,
    );
    expect(screen.getByTestId('operate-title').textContent).toBe('write_file');
    expect(screen.getByTestId('operate-status').textContent).toBe('done');
    expect(screen.getByTestId('operate-body').textContent).toContain('"path"');
  });

  it('renders OperateCard with status=running when block.status is undefined', () => {
    render(<BlockRenderer block={{ type: 'tool_use', id: 't', name: 'exec', input: 'ls' }} />);
    expect(screen.getByTestId('operate-status').textContent).toBe('running');
    expect(screen.getByTestId('operate-body').textContent).toBe('ls');
  });

  it('renders StatusCard with success status by default for tool_result', () => {
    render(
      <BlockRenderer block={{ type: 'tool_result', id: 'r', output: 'ok', name: 'write_file' }} />,
    );
    const el = screen.getByTestId('status-card');
    expect(el.getAttribute('data-status')).toBe('success');
    expect(screen.getByTestId('status-title').textContent).toBe('write_file');
    expect(screen.getByTestId('status-description').textContent).toBe('ok');
  });

  it('renders StatusCard with error status when tool_result.isError', () => {
    render(
      <BlockRenderer block={{ type: 'tool_result', id: 'r', output: { error: 'boom' }, name: 'x', isError: true }} />,
    );
    const el = screen.getByTestId('status-card');
    expect(el.getAttribute('data-status')).toBe('error');
    expect(screen.getByTestId('status-description').textContent).toContain('boom');
  });

  it('falls back to "tool result" when tool_result has no name', () => {
    render(<BlockRenderer block={{ type: 'tool_result', id: 'r', output: 'x' }} />);
    expect(screen.getByTestId('status-title').textContent).toBe('tool result');
  });

  it('renders Spark Image for image blocks', () => {
    render(<BlockRenderer block={{ type: 'image', source: 'x.png', alt: 'pic' }} />);
    const el = screen.getByTestId('image') as HTMLImageElement;
    expect(el.getAttribute('src')).toBe('x.png');
    expect(el.getAttribute('alt')).toBe('pic');
  });

  it('renders Spark Audio for audio blocks', () => {
    render(<BlockRenderer block={{ type: 'audio', source: 'a.mp3' }} />);
    expect(screen.getByTestId('audio').getAttribute('src')).toBe('a.mp3');
  });

  it('renders Spark Video for video blocks', () => {
    render(<BlockRenderer block={{ type: 'video', source: 'v.mp4' }} />);
    expect(screen.getByTestId('video').getAttribute('src')).toBe('v.mp4');
  });
});
