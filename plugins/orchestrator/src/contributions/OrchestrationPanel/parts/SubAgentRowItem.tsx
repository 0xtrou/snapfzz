// Per feedback/small-components: single sub-agent row, presentational only.
import type { SubAgentRow } from '../contracts';
import { formatClock, statusDotColor } from '../data';

interface Props {
  readonly row: SubAgentRow;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
}

const rowStyle = (selected: boolean): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: '10px 1fr auto',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  cursor: 'pointer',
  background: selected ? 'var(--bg-subtle)' : 'transparent',
  borderLeft: `2px solid ${selected ? 'var(--color-info)' : 'transparent'}`,
  transition: 'background 0.1s',
});

const dotStyle = (color: string): React.CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: color,
  justifySelf: 'center',
});

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const metaStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const countStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  fontVariantNumeric: 'tabular-nums',
};

export function SubAgentRowItem({ row, selected, onSelect }: Props) {
  return (
    <div
      style={rowStyle(selected)}
      role="button"
      tabIndex={0}
      aria-selected={selected}
      onClick={() => onSelect(row.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(row.id); }}
      data-testid={`sub-agent-row-${row.id}`}
    >
      <span aria-hidden="true" style={dotStyle(statusDotColor(row.status))} />
      <div style={{ overflow: 'hidden' }}>
        <div style={titleStyle} title={row.name}>{row.name}</div>
        <div style={metaStyle}>
          {row.status} · {row.lastActivityAt ? formatClock(row.lastActivityAt) : 'no activity'}
        </div>
      </div>
      <span style={countStyle}>
        {row.turnCount} {row.turnCount === 1 ? 'chat' : 'chats'}
      </span>
    </div>
  );
}

export default SubAgentRowItem;
