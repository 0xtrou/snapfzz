// Per A013/ModelPicker + project/SparkDesignFirst: capability icons — maps boolean flags
// to @ant-design/icons (which resolves to the monorepo-wide Spark icon override).
// Per hard-rules: no emoji, no hardcoded colors.

import { EyeOutlined, ToolOutlined, BulbOutlined } from '@ant-design/icons';
import type { ModelCapabilities } from '../contracts';

interface CapabilityIconsProps {
  readonly capabilities: ModelCapabilities;
}

const iconStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  marginRight: 4,
};

export function CapabilityIcons({ capabilities }: CapabilityIconsProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {capabilities.vision && (
        <EyeOutlined
          style={iconStyle}
          aria-label="vision"
          title="Supports vision"
        />
      )}
      {capabilities.tools && (
        <ToolOutlined
          style={iconStyle}
          aria-label="tools"
          title="Supports tool use"
        />
      )}
      {capabilities.reasoning && (
        <BulbOutlined
          style={iconStyle}
          aria-label="reasoning"
          title="Supports reasoning"
        />
      )}
    </span>
  );
}

export default CapabilityIcons;
