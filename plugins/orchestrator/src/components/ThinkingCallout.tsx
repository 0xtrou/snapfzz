import { useState } from 'react';
import { BulbOutlined } from '@ant-design/icons';
import type { ThinkingBlock } from '../types';

interface ThinkingCalloutProps {
  block: ThinkingBlock;
}

export function ThinkingCallout({ block }: ThinkingCalloutProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        background: 'var(--bg-subtle)',
        borderRadius: 8,
        padding: 10,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{
          width: '100%',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 0,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        <span><BulbOutlined /> Thinking</span>
        <span>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? (
        <p
          style={{
            margin: '8px 0 0',
            color: 'var(--text-muted)',
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {block.thinking}
        </p>
      ) : null}
    </div>
  );
}
