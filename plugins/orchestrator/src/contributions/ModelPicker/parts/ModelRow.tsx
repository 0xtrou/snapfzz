// Per A013/ModelPicker + feedback/small-components: single model row. Shows name,
// context-window badge, capability badges, price badge, pin. Provider string is kept in
// the descriptor for sorting but not rendered — redundant with the namespaced model id.
// Per hard-rules: no hardcoded colors, only CSS variables.

import { PushpinFilled } from '@ant-design/icons';
import { CapabilityIcons } from './CapabilityIcons';
import { formatCost, formatTokenCount } from '../data';
import type { ModelDescriptor } from '../contracts';

interface ModelRowProps {
  readonly model: ModelDescriptor;
  readonly selected: boolean;
  readonly pinned: boolean;
  readonly onSelect: (id: string) => void;
  readonly onPin: (id: string) => void;
}

const rowStyle = (selected: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  cursor: 'pointer',
  background: selected ? 'var(--bg-subtle)' : 'transparent',
  borderRadius: 4,
});

const nameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// Small token/price chip — same shape for both so the row reads as a row of badges.
const badgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  background: 'var(--bg-subtle)',
  borderRadius: 3,
  padding: '1px 5px',
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
};

const pinStyle = (pinned: boolean): React.CSSProperties => ({
  fontSize: 11,
  color: pinned ? 'var(--color-warning)' : 'var(--border-strong)',
  flexShrink: 0,
  cursor: 'pointer',
});

export function ModelRow({ model, selected, pinned, onSelect, onPin }: ModelRowProps) {
  const cost = formatCost(model.inputCostPer1M, model.outputCostPer1M);
  const context = formatTokenCount(model.contextWindow);

  return (
    <div
      style={rowStyle(selected)}
      role="option"
      aria-selected={selected}
      data-testid="model-row"
      data-model-id={model.id}
      onClick={() => onSelect(model.id)}
    >
      <span style={nameStyle} title={model.displayName}>
        {model.displayName}
      </span>

      {context && (
        <span style={badgeStyle} data-testid="model-row-context" title={`${model.contextWindow} tokens context`}>
          {context}
        </span>
      )}

      <CapabilityIcons capabilities={model.capabilities} />

      {cost && (
        <span style={badgeStyle} data-testid="model-row-cost" title="Input / output cost per 1M tokens (USD)">
          {cost}
        </span>
      )}

      <PushpinFilled
        style={pinStyle(pinned)}
        aria-label={pinned ? 'Unpin model' : 'Pin model'}
        title={pinned ? 'Unpin' : 'Pin'}
        onClick={(e) => {
          e.stopPropagation();
          onPin(model.id);
        }}
      />
    </div>
  );
}

export default ModelRow;
