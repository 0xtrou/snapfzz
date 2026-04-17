// Per A013/ModelPicker + project/SparkDesignFirst: composer chip that triggers the model
// picker popover. Uses Spark Button from @agentscope-ai/design.
// Per hard-rules: no hardcoded colors, only CSS variables.

import { ThunderboltOutlined, DownOutlined } from '@ant-design/icons';
// Per project/SparkDesignFirst: Button from @agentscope-ai/design — Spark component first.
import { Button } from '@agentscope-ai/design';

interface ModelChipProps {
  readonly label: string;
  readonly onClick: () => void;
}

// Height matches PlusButton + Spark Sender's internal mic/send (32px) so every
// composer-action control reads as a single consistent strip.
const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12,
  height: 32,
  padding: '0 10px',
  color: 'var(--text-secondary)',
};

export function ModelChip({ label, onClick }: ModelChipProps) {
  return (
    // Per project/SparkDesignFirst: Spark Button with text variant for compact chip appearance.
    <Button
      type="text"
      size="small"
      style={chipStyle}
      onClick={onClick}
      aria-label={`Model: ${label}. Click to change`}
      data-testid="model-chip"
    >
      <ThunderboltOutlined aria-hidden="true" />
      <span style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <DownOutlined aria-hidden="true" style={{ fontSize: 9 }} />
    </Button>
  );
}

export default ModelChip;
