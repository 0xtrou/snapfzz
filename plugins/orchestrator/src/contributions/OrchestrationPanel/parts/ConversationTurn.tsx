// Per feedback/small-components: one timeline row, presentational only.
// Renders text/reasoning/tool turns with a small "from" chip + Spark Markdown.
import { Markdown } from '@agentscope-ai/chat';
import type { ConversationTurn } from '../contracts';
import { formatClock } from '../data';

interface Props {
  readonly turn: ConversationTurn;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '8px 12px',
  borderBottom: '1px solid var(--border-subtle)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11,
  color: 'var(--text-muted)',
};

const chipStyle = (kind: ConversationTurn['kind']): React.CSSProperties => {
  const bg =
    kind === 'reasoning' ? 'var(--bg-subtle)'
    : kind === 'tool_call' ? 'var(--color-info-bg, var(--bg-subtle))'
    : kind === 'tool_result' ? 'var(--color-success-bg, var(--bg-subtle))'
    : 'var(--bg-subtle)';
  return {
    background: bg,
    color: 'var(--text-secondary)',
    fontSize: 10,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  };
};

const bodyWrap = (kind: ConversationTurn['kind']): React.CSSProperties => ({
  paddingLeft: 2,
  fontSize: 13,
  lineHeight: 1.5,
  color: kind === 'reasoning' ? 'var(--text-secondary)' : 'var(--text-primary)',
  fontStyle: kind === 'reasoning' ? 'italic' : 'normal',
});

function kindLabel(kind: ConversationTurn['kind']): string {
  switch (kind) {
    case 'reasoning':  return 'thinking';
    case 'tool_call':  return 'tool';
    case 'tool_result':return 'result';
    case 'media':      return 'media';
    case 'text':
    default:           return 'msg';
  }
}

export function ConversationTurnItem({ turn }: Props) {
  return (
    <div style={rowStyle} data-testid={`turn-${turn.id}`}>
      <div style={headerStyle}>
        <span style={chipStyle(turn.kind)}>{kindLabel(turn.kind)}</span>
        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{turn.agentId}</span>
        <span>·</span>
        <span>{formatClock(turn.ts)}</span>
      </div>
      <div style={bodyWrap(turn.kind)}>
        <Markdown content={turn.text} />
      </div>
    </div>
  );
}

export default ConversationTurnItem;
