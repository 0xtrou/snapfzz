// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PretextMarkdown } from './PretextMarkdown';

describe('PretextMarkdown', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(),
      },
    });
  });

  it('renders headings, paragraphs, inline markdown, links, and list blocks', () => {
    const markdown = [
      '# Heading 1',
      'Paragraph with **bold** and *italic* and `code` and [docs](https://example.com).',
      '',
      '- item one',
      '- item two',
    ].join('\n');

    render(<PretextMarkdown text={markdown} />);

    expect(screen.getByText('Heading 1')).toBeTruthy();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
    expect(screen.getByText('code').tagName).toBe('CODE');
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://example.com');
    expect(screen.getByText('item one')).toBeTruthy();
    expect(screen.getByText('item two')).toBeTruthy();
  });

  it('renders blockquote and fenced code block with copy action', () => {
    const markdown = [
      '> quoted line one',
      '> quoted line two',
      '',
      '```ts',
      'const x = 1;',
      '```',
    ].join('\n');

    render(<PretextMarkdown text={markdown} />);

    expect(screen.getByText('quoted line one quoted line two')).toBeTruthy();
    expect(screen.getByText('ts')).toBeTruthy();
    expect(screen.getByText('const x = 1;')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const x = 1;');
  });

  it('supports custom font and lineHeight styling', () => {
    render(<PretextMarkdown text="Simple text" font="16px Inter" lineHeight={28} codeFont="15px Fira Code" />);

    const textNode = screen.getByText('Simple text');
    expect((textNode as HTMLElement).style.font).toContain('16px');
    expect((textNode as HTMLElement).style.lineHeight).toBe('28px');
  });

  it('handles ordered lists, deeper headings, empty fenced language fallback, and class/style passthrough', () => {
    const markdown = [
      '###### Tiny heading',
      '',
      '1. first ordered',
      '2. second ordered',
      '',
      '```',
      'console.log("x")',
      '```',
    ].join('\n');

    const { container } = render(
      <PretextMarkdown text={markdown} className="md-root" style={{ marginTop: 7 }} />,
    );

    const root = container.querySelector('.md-root') as HTMLDivElement;
    expect(root).toBeTruthy();
    expect(root.style.marginTop).toBe('7px');

    const heading = screen.getByText('Tiny heading') as HTMLElement;
    expect(heading.style.font).toContain('14px');

    expect(screen.getByText('first ordered').tagName).toBe('LI');
    expect(screen.getByText('second ordered').tagName).toBe('LI');
    expect(screen.getByText('code')).toBeTruthy();
    expect(screen.getByText('console.log("x")')).toBeTruthy();
  });
});
