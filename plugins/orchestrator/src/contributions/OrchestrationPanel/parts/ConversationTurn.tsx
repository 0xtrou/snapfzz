// Per feedback/small-components: one timeline row, presentational only.
// Renders turns as bubbles (user → right-aligned, assistant → left-aligned)
// matching the main ChatPanel's visual vocabulary. Tool/reasoning turns keep
// the compact chip + collapse row since they are machine-noise, not prose.
//
// Collapse behavior: text turns are expanded by default and rendered as full
// bubbles. Reasoning/tool_call/tool_result/media are collapsed to a single
// summary chip row; clicking the header toggles them open. The caller owns
// expansion state so PretextList can recompute virtualised row heights.
import { Markdown } from '@agentscope-ai/chat';
import type { ConversationTurn } from '../contracts';
import { formatClock } from '../data';

interface Props {
  readonly turn: ConversationTurn;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

// ─── Bubble styles (text turns) ───────────────────────────────────────────

const bubbleRow = (isUser: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: isUser ? 'flex-end' : 'flex-start',
  gap: 3,
  height: '100%',
  boxSizing: 'border-box',
  overflow: 'hidden',
  padding: '6px 12px',
});

const metaLine = (isUser: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 10,
  color: 'var(--text-muted)',
  flexDirection: isUser ? 'row-reverse' : 'row',
});

const bubble = (isUser: boolean): React.CSSProperties => ({
  maxWidth: '80%',
  padding: '8px 12px',
  borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
  background: isUser ? 'var(--bg-tertiary)' : 'var(--bg-subtle)',
  color: 'var(--text-primary)',
  fontSize: 13,
  lineHeight: 1.55,
  overflow: 'hidden',
  // Markdown resets margin on its root <p>; ensure the bubble wraps tightly.
  wordBreak: 'break-word',
});

// ─── Compact chip row styles (tool / reasoning turns) ─────────────────────

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '6px 12px',
  borderBottom: '1px solid var(--border-subtle)',
  height: '100%',
  boxSizing: 'border-box',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  userSelect: 'none',
  minHeight: 20,
};

const caretStyle: React.CSSProperties = {
  fontSize: 9,
  color: 'var(--text-muted)',
  width: 10,
  display: 'inline-flex',
  justifyContent: 'center',
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
  overflow: 'hidden',
});

const previewStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 11,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function kindLabel(kind: ConversationTurn['kind']): string {
  switch (kind) {
    case 'reasoning':   return 'thinking';
    case 'tool_call':   return 'tool';
    case 'tool_result': return 'result';
    case 'media':       return 'media';
    case 'text':
    default:            return 'msg';
  }
}

/** First ~80 chars of the first non-empty line; markdown fences stripped. */
function previewText(text: string): string {
  const stripped = text.replace(/```[a-z]*\n?/gi, '').replace(/\n+/g, ' ').trim();
  if (stripped.length === 0) return '—';
  return stripped.length > 80 ? stripped.slice(0, 80) + '…' : stripped;
}

// ─── Component ────────────────────────────────────────────────────────────

export function ConversationTurnItem({ turn, expanded, onToggle }: Props) {
  const isText = turn.kind === 'text';
  const isUser = turn.role === 'user';

  // Text turns render as chat bubbles — aligned by role, no chip clutter.
  if (isText) {
    return (
      <div style={bubbleRow(isUser)} data-testid={`turn-${turn.id}`}>
        <div style={metaLine(isUser)}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{turn.agentId}</span>
          <span>·</span>
          <span>{formatClock(turn.ts)}</span>
        </div>
        {expanded ? (
          <div style={bubble(isUser)}>
            <Markdown content={turn.text} />
          </div>
        ) : (
          // Collapsed text turn: show bubble-shaped preview row, still clickable.
          <div
            style={{ ...bubble(isUser), cursor: 'pointer', userSelect: 'none' }}
            onClick={onToggle}
            role="button"
            aria-expanded={false}
          >
            <span style={previewStyle}>{previewText(turn.text)}</span>
          </div>
        )}
      </div>
    );
  }

  // Non-text turns (reasoning, tool_call, tool_result, media) keep the
  // compact chip + caret row with collapse/expand.
  return (
    <div style={chipRowStyle} data-testid={`turn-${turn.id}`}>
      <div style={headerStyle} onClick={onToggle} role="button" aria-expanded={expanded}>
        <span style={caretStyle}>{expanded ? '▾' : '▸'}</span>
        <span style={chipStyle(turn.kind)}>{kindLabel(turn.kind)}</span>
        <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{turn.agentId}</span>
        <span>·</span>
        <span>{formatClock(turn.ts)}</span>
        {!expanded && <span style={previewStyle}>{previewText(turn.text)}</span>}
      </div>
      {expanded && (
        <div style={bodyWrap(turn.kind)}>
          <Markdown content={turn.text} />
        </div>
      )}
    </div>
  );
}

export default ConversationTurnItem;
