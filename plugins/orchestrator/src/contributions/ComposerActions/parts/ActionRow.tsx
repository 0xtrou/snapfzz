// Per A013/Composer + feedback/small-components: single menu row inside the composer
// actions popover. Presentational leaf — receives ComposerAction + onClick, no state.

import type { ComposerAction, ComposerActionId } from '../contracts';

interface ActionRowProps {
  readonly action: ComposerAction;
  readonly onSelect: (id: ComposerActionId) => void;
}

const rowStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  borderRadius: 4,
  background: 'transparent',
  border: 'none',
  width: '100%',
  textAlign: 'left',
  color: 'var(--text-primary)',
  fontSize: 13,
});

const iconStyle: React.CSSProperties = {
  fontSize: 16,
  color: 'var(--text-secondary)',
  flexShrink: 0,
};

const descriptionStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
};

export function ActionRow({ action, onSelect }: ActionRowProps) {
  const { id, label, description, Icon, disabled = false } = action;

  return (
    <button
      type="button"
      style={rowStyle(disabled)}
      onClick={() => { if (!disabled) onSelect(id); }}
      disabled={disabled}
      data-testid="composer-action-row"
      data-action-id={id}
    >
      <span style={iconStyle} aria-hidden="true">
        <Icon />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span>{label}</span>
        {description && <span style={descriptionStyle}>{description}</span>}
      </span>
    </button>
  );
}

export default ActionRow;
