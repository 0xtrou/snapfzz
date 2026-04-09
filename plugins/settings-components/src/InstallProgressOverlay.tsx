import React from 'react';
import { LoadingOutlined } from '@ant-design/icons';
import { Progress, Space, Typography } from 'antd';

const { Text } = Typography;

interface StepInfo {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done';
}

export interface InstallProgressOverlayProps {
  steps: StepInfo[];
  current: number;
  total: number;
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
  current,
  total,
}: InstallProgressOverlayProps): React.ReactElement {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

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
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text strong>Installing Python Packs</Text>
          <Text type="secondary">{percent}%</Text>
        </Space>

        <Progress
          percent={percent}
          status="active"
          strokeColor={{ '0%': '#1677ff', '100%': '#52c41a' }}
        />

        <Space direction="vertical" size={8} style={{ width: '100%' }}>
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
      </Space>
    </div>
  );
}
