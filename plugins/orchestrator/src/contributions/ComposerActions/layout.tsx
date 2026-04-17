// Per feedback/five-layer: presentational shell. Receives state + callbacks as props.
// Per project/SparkDesignFirst: Popover from @agentscope-ai/design.

// Per project/SparkDesignFirst: Spark Popover.
import { Popover } from '@agentscope-ai/design';
import { COMPOSER_ACTIONS } from './data';
import { PlusButton } from './parts/PlusButton';
import { ActionRow } from './parts/ActionRow';
import type { ComposerActionId } from './contracts';

interface ComposerActionsLayoutProps {
  readonly isOpen: boolean;
  readonly onToggleOpen: (next: boolean) => void;
  readonly onSelect: (id: ComposerActionId) => void;
}

// Per A013/Composer: chrome lives on antd's `.ant-popover-inner` so there's a single
// visible panel instead of a doubled inner+outer pair.
const popoverInnerStyle: React.CSSProperties = {
  background: 'var(--bg-default)',
  border: '1px solid var(--border-default)',
  borderRadius: 8,
  padding: 0,
};

const popoverContentStyle: React.CSSProperties = {
  width: 260,
  padding: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  boxSizing: 'border-box',
};

export function ComposerActionsLayout({ isOpen, onToggleOpen, onSelect }: ComposerActionsLayoutProps) {
  return (
    <Popover
      open={isOpen}
      onOpenChange={onToggleOpen}
      placement="topLeft"
      trigger="click"
      overlayInnerStyle={popoverInnerStyle}
      content={
        <div style={popoverContentStyle} role="menu" data-testid="composer-actions-popover">
          {COMPOSER_ACTIONS.map((action) => (
            <ActionRow key={action.id} action={action} onSelect={onSelect} />
          ))}
        </div>
      }
    >
      <span style={{ display: 'inline-flex' }}>
        <PlusButton open={isOpen} onClick={() => onToggleOpen(!isOpen)} />
      </span>
    </Popover>
  );
}

export default ComposerActionsLayout;
