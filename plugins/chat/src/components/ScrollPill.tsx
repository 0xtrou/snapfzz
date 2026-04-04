interface ScrollPillProps {
  visible: boolean;
  onClick: () => void;
}

export function ScrollPill({ visible, onClick }: ScrollPillProps) {
  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 14,
        transform: 'translate3d(-50%, 0, 0)',
        border: '1px solid var(--border-default)',
        background: 'var(--bg-default)',
        color: 'var(--text-primary)',
        borderRadius: 999,
        padding: '8px 12px',
        boxShadow: 'var(--shadow-sm)',
        cursor: 'pointer',
        fontSize: 13,
        transition: 'opacity 140ms ease, transform 140ms ease',
        opacity: 1,
        zIndex: 2,
      }}
    >
      ↓ New messages
    </button>
  );
}
