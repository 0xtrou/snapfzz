// Per A013/Composer + feedback/small-components: round "+" trigger for the composer actions
// popover. Uses Spark Button (icon variant). No hardcoded colors.

import { PlusOutlined } from '@ant-design/icons';
// Per project/SparkDesignFirst: Spark Button first.
import { Button } from '@agentscope-ai/design';

interface PlusButtonProps {
  readonly onClick: () => void;
  readonly open: boolean;
}

// Height matches Spark Sender's internal mic/send buttons (32px) so the composer action
// row reads as a single consistent strip instead of a mismatch of sizes.
const buttonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
};

export function PlusButton({ onClick, open }: PlusButtonProps) {
  return (
    <Button
      type="text"
      size="small"
      style={buttonStyle}
      onClick={onClick}
      aria-label="Composer actions"
      aria-expanded={open}
      data-testid="composer-plus-button"
    >
      <PlusOutlined aria-hidden="true" />
    </Button>
  );
}

export default PlusButton;
