import { type CSSProperties, useMemo } from 'react';
import { usePreparedText, usePretextLayout } from '../../lib/pretext';
import { useContainerWidth } from './use-container-width';

interface PretextMarkdownProps {
  text: string;
  font?: string;
  codeFont?: string;
  lineHeight?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_FONT = '14px Inter';
const DEFAULT_CODE_FONT = '13px "JetBrains Mono"';
const DEFAULT_LINE_HEIGHT = 22;

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'list'; items: string[] }
  | { type: 'blockquote'; text: string };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const langMatch = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', language: langMatch, code: codeLines.join('\n') });
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    if (line.match(/^[-*]\s/) || line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].match(/^[-*]\s/) || lines[i].match(/^\d+\.\s/))) {
        items.push(lines[i].replace(/^[-*\d.]+\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !lines[i].startsWith('> ')) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
    }
  }

  return blocks;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match = regex.exec(text);

  while (match !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const m = match[0];
    if (m.startsWith('`')) {
      nodes.push(<code key={match.index} style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--bg-subtle)', fontFamily: 'var(--font-mono)', fontSize: '0.9em' }}>{m.slice(1, -1)}</code>);
    } else if (m.startsWith('**')) {
      nodes.push(<strong key={match.index}>{m.slice(2, -2)}</strong>);
    } else if (m.startsWith('*')) {
      nodes.push(<em key={match.index}>{m.slice(1, -1)}</em>);
    } else if (m.startsWith('[')) {
      const linkMatch = m.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        nodes.push(<a key={match.index} href={linkMatch[2]} style={{ color: 'var(--accent)' }}>{linkMatch[1]}</a>);
      }
    }
    lastIndex = match.index + m.length;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function CodeBlockRenderer({ code, language, codeFont }: { code: string; language: string; codeFont: string }) {
  const copyToClipboard = () => { navigator.clipboard.writeText(code); };

  return (
    <div style={{ borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', borderBottom: '1px solid var(--border-default)', fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{language || 'code'}</span>
        <button type="button" onClick={copyToClipboard} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}>Copy</button>
      </div>
      <pre style={{ margin: 0, padding: '10px 12px', font: codeFont, overflowX: 'auto', lineHeight: '18px' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function PretextMarkdown({
  text,
  font = DEFAULT_FONT,
  codeFont = DEFAULT_CODE_FONT,
  lineHeight = DEFAULT_LINE_HEIGHT,
  className,
  style,
}: PretextMarkdownProps) {
  const [ref, width] = useContainerWidth();
  const blocks = useMemo(() => parseBlocks(text), [text]);

  const plainText = useMemo(() => {
    return blocks
      .filter((b): b is Block & { type: 'paragraph' } => b.type === 'paragraph')
      .map(b => b.text)
      .join('\n');
  }, [blocks]);

  const prepared = usePreparedText(plainText || ' ', font);
  const { height } = usePretextLayout(prepared, width, lineHeight);

  return (
    <div ref={ref} className={className} style={{ display: 'grid', gap: 10, ...style }}>
      {blocks.map((block) => {
        const blockKey = `${block.type}-${'text' in block ? block.text.slice(0, 32) : 'code' in block ? block.code.slice(0, 32) : 'list'}`;

        if (block.type === 'heading') {
          const fontSize = block.level <= 2 ? 18 : block.level <= 4 ? 15 : 14;
          return <div key={blockKey} style={{ font: `600 ${fontSize}px Inter`, lineHeight: `${fontSize + 8}px` }}>{renderInlineMarkdown(block.text)}</div>;
        }

        if (block.type === 'code') {
          return <CodeBlockRenderer key={blockKey} code={block.code} language={block.language} codeFont={codeFont} />;
        }

        if (block.type === 'blockquote') {
          return (
            <div key={blockKey} style={{ borderLeft: '3px solid var(--border-default)', paddingLeft: 12, color: 'var(--text-muted)', font, lineHeight: `${lineHeight}px` }}>
              {renderInlineMarkdown(block.text)}
            </div>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={blockKey} style={{ margin: 0, paddingLeft: 20, font, lineHeight: `${lineHeight}px` }}>
              {block.items.map((item) => <li key={item.slice(0, 32)}>{renderInlineMarkdown(item)}</li>)}
            </ul>
          );
        }

        return (
          <div key={blockKey} style={{ font, lineHeight: `${lineHeight}px`, overflowWrap: 'break-word' }}>
            {renderInlineMarkdown(block.text)}
          </div>
        );
      })}
    </div>
  );
}
