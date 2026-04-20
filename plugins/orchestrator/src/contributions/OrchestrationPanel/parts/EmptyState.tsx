// Per feedback/small-components: presentational empty state for the panel.
// Shown on both halves when no sub-agent has been spawned yet, or when the
// selected agent has no chats.

interface Props {
  readonly title: string;
  readonly description?: string;
}

const rootStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  color: 'var(--text-muted)',
  textAlign: 'center',
};

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 6,
};

const descStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  maxWidth: 320,
};

export function EmptyState({ title, description }: Props) {
  return (
    <div style={rootStyle} data-testid="orchestration-empty-state">
      <div style={titleStyle}>{title}</div>
      {description && <div style={descStyle}>{description}</div>}
    </div>
  );
}

export default EmptyState;
