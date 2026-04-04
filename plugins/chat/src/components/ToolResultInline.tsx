import { useState } from 'react';
import type { RenderableToolResultBlock } from '../types';

interface ToolResultInlineProps {
  block: RenderableToolResultBlock;
}

export function ToolResultInline({ block }: ToolResultInlineProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        borderLeft: '2px solid var(--border-strong)',
        paddingLeft: 10,
        display: 'grid',
        gap: 6,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--text-secondary)',
          padding: 0,
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        {expanded ? '▼' : '▶'} {block.name ?? 'tool result'}
      </button>
      {expanded ? (
        <pre
          style={{
            margin: 0,
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            background: 'var(--bg-subtle)',
            padding: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {block.outputPreview}
        </pre>
      ) : null}
    </div>
  );
}
