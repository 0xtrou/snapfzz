import { useState } from 'react';
import type { ImageBlock } from '../types';

interface ImageContentProps {
  block: ImageBlock;
}

export function ImageContent({ block }: ImageContentProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          border: '1px solid var(--border-default)',
          background: 'var(--bg-subtle)',
          borderRadius: 8,
          padding: 0,
          display: 'block',
          maxWidth: 420,
          overflow: 'hidden',
          cursor: 'pointer',
        }}
      >
        <img src={block.source} alt={block.alt ?? 'Image content'} style={{ display: 'block', width: '100%', height: 'auto' }} />
      </button>
      {isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--color-overlay)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 24,
            cursor: 'zoom-out',
          }}
        >
          <img
            src={block.source}
            alt={block.alt ?? 'Image content'}
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, border: '1px solid var(--border-default)' }}
          />
        </button>
      ) : null}
    </>
  );
}
