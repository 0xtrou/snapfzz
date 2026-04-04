import type { RenderableToolUseBlock } from '../types';

interface ToolUseCardProps {
  block: RenderableToolUseBlock;
}

function ToolStatus({ status }: { status: 'running' | 'done' | 'error' }) {
  if (status === 'done') {
    return <span style={{ color: 'var(--color-success)' }}>✓ done</span>;
  }

  if (status === 'error') {
    return <span style={{ color: 'var(--color-error)' }}>✕ error</span>;
  }

  return (
    <span style={{ color: 'var(--color-warning)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          border: '2px solid var(--border-strong)',
          borderTopColor: 'var(--accent)',
          animation: 'chat-tool-spin 900ms linear infinite',
          transform: 'translateZ(0)',
        }}
      />
      running
    </span>
  );
}

export function ToolUseCard({ block }: ToolUseCardProps) {
  const status = block.status ?? 'running';

  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: 10,
        background: 'var(--bg-subtle)',
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>🔧 {block.name}</strong>
        <ToolStatus status={status} />
      </div>
      <pre
        style={{
          margin: 0,
          border: '1px solid var(--border-default)',
          borderRadius: 6,
          padding: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
          background: 'var(--bg-default)',
          whiteSpace: 'pre-wrap',
          overflowX: 'auto',
        }}
      >
        {block.inputPreview}
      </pre>
      <style>{'@keyframes chat-tool-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
