import { useCallback, useState } from 'react';

interface CodeBlockProps {
  code: string;
  language: string;
}

function normalizeLanguage(language: string): string {
  return language.trim().length > 0 ? language.trim() : 'text';
}

function tryCopy(code: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(code);
  }

  return Promise.reject(new Error('Clipboard API unavailable'));
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const normalizedLanguage = normalizeLanguage(language);

  const onCopy = useCallback(() => {
    void tryCopy(code)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {
        setCopied(false);
      });
  }, [code]);

  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        background: 'var(--bg-subtle)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-default)',
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ textTransform: 'lowercase', fontFamily: 'var(--font-mono)' }}>{normalizedLanguage}</span>
        <button
          type="button"
          onClick={onCopy}
          style={{
            border: '1px solid var(--border-default)',
            background: 'var(--bg-default)',
            color: 'var(--text-primary)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 12,
            cursor: 'pointer',
            transition: 'opacity 140ms ease, transform 140ms ease',
            transform: 'translateZ(0)',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: 12,
          overflowX: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--text-primary)',
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
