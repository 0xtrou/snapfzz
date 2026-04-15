import React from 'react';
import { LoadingOutlined } from '@ant-design/icons';
import { Space, Typography } from 'antd';

const { Text } = Typography;

interface StepInfo {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done';
}

export interface InstallProgressOverlayProps {
  steps: StepInfo[];
}

function stepIcon(status: StepInfo['status']): React.ReactNode {
  switch (status) {
    case 'done': return <span style={{ fontSize: 10 }}>✅</span>;
    case 'running': return <LoadingOutlined style={{ color: 'var(--color-primary)', fontSize: 12 }} />;
    default: return <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>○</span>;
  }
}

export default function InstallProgressOverlay({
  steps,
}: InstallProgressOverlayProps): React.ReactElement {
  return (
    <div
      data-testid="install-progress-overlay"
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: 16,
        background: 'var(--bg-default)',
      }}
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Text strong style={{ fontSize: 12 }}>
          Installing Python Packs
        </Text>
        {steps.map((step) => (
          <Space key={step.id} size={8}>
            {stepIcon(step.status)}
            <Text
              type={step.status === 'done' ? 'success' : step.status === 'running' ? undefined : 'disabled'}
              style={{ fontSize: 12 }}
            >
              {step.label}
            </Text>
          </Space>
        ))}
      </Space>
    </div>
  );
}
