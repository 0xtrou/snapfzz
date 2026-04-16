import type { CSSProperties } from 'react';

interface ThinkingIndicatorProps {
  visible: boolean;
}

const dotStyle: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--text-muted)',
  animation: 'chat-thinking-pulse 1.2s ease-in-out infinite',
  transform: 'translateZ(0)',
};

export function ThinkingIndicator({ visible }: ThinkingIndicatorProps) {
  if (!visible) {
    return null;
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <span style={{ ...dotStyle, animationDelay: '0ms' }} />
        <span style={{ ...dotStyle, animationDelay: '150ms' }} />
        <span style={{ ...dotStyle, animationDelay: '300ms' }} />
      </span>
      <span>Thinking...</span>
      <style>{'@keyframes chat-thinking-pulse { 0%, 100% { opacity: 0.35; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }'}</style>
    </div>
  );
}
