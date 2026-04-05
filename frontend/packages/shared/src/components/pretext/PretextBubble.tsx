import { type CSSProperties, type ReactNode } from 'react';

interface PretextBubbleProps {
  variant?: 'user' | 'assistant' | 'system';
  grouped?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const VARIANT_STYLES: Record<string, CSSProperties> = {
  user: { background: 'var(--bg-default)' },
  assistant: { background: 'var(--bg-subtle)' },
  system: { background: 'var(--bg-subtle)', opacity: 0.8 },
};

export function PretextBubble({
  variant = 'assistant',
  grouped = false,
  children,
  className,
  style,
}: PretextBubbleProps) {
  return (
    <article
      className={className}
      style={{
        marginTop: grouped ? 6 : 14,
        padding: '12px 14px',
        border: '1px solid var(--border-default)',
        borderRadius: 10,
        display: 'grid',
        gap: 10,
        contentVisibility: 'auto',
        containIntrinsicBlockSize: '80px',
        ...VARIANT_STYLES[variant],
        ...style,
      }}
    >
      {children}
    </article>
  );
}
