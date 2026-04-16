import type { MarkdownInlineToken } from '../types';

interface InlineRendererProps {
  tokens: MarkdownInlineToken[];
}

function InlineRenderer({ tokens }: InlineRendererProps) {
  return (
    <>
      {tokens.map((token, index) => {
        const key = `${token.kind}-${index}-${token.text.slice(0, 8)}`;

        if (token.kind === 'bold') {
          return <strong key={key}>{token.text}</strong>;
        }

        if (token.kind === 'italic') {
          return <em key={key}>{token.text}</em>;
        }

        if (token.kind === 'code') {
          return (
            <code
              key={key}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-default)',
                borderRadius: 4,
                padding: '1px 4px',
              }}
            >
              {token.text}
            </code>
          );
        }

        if (token.kind === 'link' && token.href) {
          return (
            <a
              key={key}
              href={token.href}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'underline' }}
            >
              {token.text}
            </a>
          );
        }

        return <span key={key}>{token.text}</span>;
      })}
    </>
  );
}

export default InlineRenderer;
