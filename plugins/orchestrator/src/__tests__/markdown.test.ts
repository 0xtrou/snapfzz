// Spec: chat/SPEC.md
// Sections: Domain Model — TextBlock, PretextMarkdown rendering
// Verifies: parseMarkdownToSegments correctly identifies headings, paragraphs, lists, code fences, and inline tokens
import { describe, it, expect } from 'vitest';
import { parseMarkdownToSegments } from '../hooks/markdown';

describe('chat/markdown: heading parsing', () => {
  it('chat/markdown: parses h1 heading', () => {
    const segments = parseMarkdownToSegments('# Hello');
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('heading');
    if (segments[0].kind === 'heading') {
      expect(segments[0].level).toBe(1);
      expect(segments[0].inlines[0].text).toBe('Hello');
    }
  });

  it('chat/markdown: parses h3 heading', () => {
    const segments = parseMarkdownToSegments('### Section Title');
    expect(segments[0].kind).toBe('heading');
    if (segments[0].kind === 'heading') {
      expect(segments[0].level).toBe(3);
    }
  });

  it('chat/markdown: parses h6 heading', () => {
    const segments = parseMarkdownToSegments('###### Tiny heading');
    expect(segments[0].kind).toBe('heading');
    if (segments[0].kind === 'heading') {
      expect(segments[0].level).toBe(6);
    }
  });
});

describe('chat/markdown: paragraph parsing', () => {
  it('chat/markdown: parses plain text as paragraph', () => {
    const segments = parseMarkdownToSegments('This is a paragraph');
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('paragraph');
  });

  it('chat/markdown: skips blank lines between paragraphs', () => {
    const segments = parseMarkdownToSegments('First\n\nSecond');
    expect(segments).toHaveLength(2);
    expect(segments[0].kind).toBe('paragraph');
    expect(segments[1].kind).toBe('paragraph');
  });

  it('chat/markdown: returns empty array for blank input', () => {
    const segments = parseMarkdownToSegments('');
    expect(segments).toHaveLength(0);
  });

  it('chat/markdown: returns empty array for whitespace-only input', () => {
    const segments = parseMarkdownToSegments('   \n   \n');
    expect(segments).toHaveLength(0);
  });
});

describe('chat/markdown: code fence parsing', () => {
  it('chat/markdown: parses fenced code block with language', () => {
    const segments = parseMarkdownToSegments('```typescript\nconst x = 1;\n```');
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('code');
    if (segments[0].kind === 'code') {
      expect(segments[0].language).toBe('typescript');
      expect(segments[0].code).toBe('const x = 1;');
    }
  });

  it('chat/markdown: parses code block without language', () => {
    const segments = parseMarkdownToSegments('```\nhello world\n```');
    expect(segments[0].kind).toBe('code');
    if (segments[0].kind === 'code') {
      expect(segments[0].language).toBe('');
      expect(segments[0].code).toBe('hello world');
    }
  });

  it('chat/markdown: parses multiline code block', () => {
    const segments = parseMarkdownToSegments('```js\nline one\nline two\n```');
    expect(segments[0].kind).toBe('code');
    if (segments[0].kind === 'code') {
      expect(segments[0].code).toBe('line one\nline two');
    }
  });
});

describe('chat/markdown: list parsing', () => {
  it('chat/markdown: parses bullet list with - prefix', () => {
    const segments = parseMarkdownToSegments('- first\n- second\n- third');
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('list');
    if (segments[0].kind === 'list') {
      expect(segments[0].ordered).toBe(false);
      expect(segments[0].items).toHaveLength(3);
    }
  });

  it('chat/markdown: parses bullet list with * prefix', () => {
    const segments = parseMarkdownToSegments('* alpha\n* beta');
    expect(segments[0].kind).toBe('list');
    if (segments[0].kind === 'list') {
      expect(segments[0].ordered).toBe(false);
    }
  });

  it('chat/markdown: parses ordered list', () => {
    const segments = parseMarkdownToSegments('1. one\n2. two');
    expect(segments[0].kind).toBe('list');
    if (segments[0].kind === 'list') {
      expect(segments[0].ordered).toBe(true);
      expect(segments[0].items).toHaveLength(2);
    }
  });
});

describe('chat/markdown: inline token parsing', () => {
  it('chat/markdown: parses bold inline token', () => {
    const segments = parseMarkdownToSegments('Hello **world** today');
    expect(segments[0].kind).toBe('paragraph');
    if (segments[0].kind === 'paragraph') {
      const boldToken = segments[0].inlines.find((t) => t.kind === 'bold');
      expect(boldToken?.text).toBe('world');
    }
  });

  it('chat/markdown: parses italic inline token', () => {
    const segments = parseMarkdownToSegments('Hello *world* today');
    if (segments[0].kind === 'paragraph') {
      const italicToken = segments[0].inlines.find((t) => t.kind === 'italic');
      expect(italicToken?.text).toBe('world');
    }
  });

  it('chat/markdown: parses inline code token', () => {
    const segments = parseMarkdownToSegments('Use `console.log` for debugging');
    if (segments[0].kind === 'paragraph') {
      const codeToken = segments[0].inlines.find((t) => t.kind === 'code');
      expect(codeToken?.text).toBe('console.log');
    }
  });

  it('chat/markdown: parses link inline token', () => {
    const segments = parseMarkdownToSegments('Visit [Snapfzz](https://snapfzz.dev) today');
    if (segments[0].kind === 'paragraph') {
      const linkToken = segments[0].inlines.find((t) => t.kind === 'link');
      expect(linkToken?.text).toBe('Snapfzz');
      expect(linkToken?.href).toBe('https://snapfzz.dev');
    }
  });

  it('chat/markdown: parses plain text inline token', () => {
    const segments = parseMarkdownToSegments('Just plain text');
    if (segments[0].kind === 'paragraph') {
      const textToken = segments[0].inlines.find((t) => t.kind === 'text');
      expect(textToken?.text).toBe('Just plain text');
    }
  });
});

describe('chat/markdown: mixed content', () => {
  it('chat/markdown: parses heading followed by paragraph', () => {
    const segments = parseMarkdownToSegments('# Title\n\nSome paragraph text');
    expect(segments).toHaveLength(2);
    expect(segments[0].kind).toBe('heading');
    expect(segments[1].kind).toBe('paragraph');
  });

  it('chat/markdown: parses text followed by code block', () => {
    const segments = parseMarkdownToSegments('Here is code:\n```ts\nconst x = 1;\n```');
    expect(segments).toHaveLength(2);
    expect(segments[0].kind).toBe('paragraph');
    expect(segments[1].kind).toBe('code');
  });

  it('chat/markdown: handles Windows line endings CRLF', () => {
    const segments = parseMarkdownToSegments('Line 1\r\nLine 2');
    expect(segments.length).toBeGreaterThan(0);
  });
});
