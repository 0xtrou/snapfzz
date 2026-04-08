import React, { useCallback, useEffect, useState } from 'react';
import { Descriptions, List, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { createTauriBridge, SettingsHeader, AppButton } from '@snapfzz/shared';

const { Text } = Typography;
const bridge = createTauriBridge();

type PhaseTimingDto = {
  phase: number;
  name: string;
  durationMs: number;
  status: string;
  detail: string | null;
};

type HardwareInfo = {
  cores: number;
  ramGb: number;
  onBattery: boolean;
};

type ComponentInfo = {
  id: string;
  name: string;
  version: string;
  isInstalled: boolean;
};

function statusTag(status: string): React.ReactElement {
  if (status === 'ok') {
    return <Tag color="success" icon={<CheckCircleOutlined />}>Ok</Tag>;
  }
  if (status.startsWith('degraded')) {
    return <Tag color="warning" icon={<WarningOutlined />}>Degraded</Tag>;
  }
  return <Tag color="error" icon={<CloseCircleOutlined />}>Failed</Tag>;
}

export default function DiagnosticsSettings(): React.ReactElement {
  const [phases, setPhases] = useState<PhaseTimingDto[]>([]);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [p, h, c] = await Promise.all([
        bridge.invoke<PhaseTimingDto[]>('preflight_status'),
        bridge.invoke<HardwareInfo>('get_hardware_info'),
        bridge.invoke<ComponentInfo[]>('component_list'),
      ]);
      setPhases(p);
      setHardware(h);
      setComponents(c);
    } catch {
      setPhases([]);
      setHardware(null);
      setComponents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <SettingsHeader title="Diagnostics" />
      <div style={{ padding: '16px 32px', maxWidth: 720 }}>
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text strong>Preflight Status</Text>
              <AppButton icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
                Re-run checks
              </AppButton>
            </div>
            <List
              size="small"
              bordered
              loading={loading}
              dataSource={phases}
              renderItem={(phase) => (
                <List.Item
                  key={phase.phase}
                  actions={[statusTag(phase.status)]}
                >
                  <List.Item.Meta
                    title={`Phase ${phase.phase}: ${phase.name}`}
                    description={phase.detail ?? `${phase.durationMs}ms`}
                  />
                </List.Item>
              )}
            />
          </section>

          {hardware && (
            <section>
              <Text strong style={{ display: 'block', marginBottom: 12 }}>Hardware</Text>
              <Descriptions
                size="small"
                bordered
                column={1}
                items={[
                  { key: 'cores', label: 'CPU Cores', children: hardware.cores },
                  { key: 'ram', label: 'RAM', children: `${hardware.ramGb} GB` },
                  { key: 'battery', label: 'On Battery', children: hardware.onBattery ? 'Yes' : 'No' },
                ]}
              />
            </section>
          )}

          {components.length > 0 && (
            <section>
              <Text strong style={{ display: 'block', marginBottom: 12 }}>System Packs</Text>
              <List
                size="small"
                bordered
                dataSource={components}
                renderItem={(comp) => (
                  <List.Item
                    key={comp.id}
                    actions={[
                      comp.isInstalled
                        ? <Tag color="success" icon={<CheckCircleOutlined />}>Installed</Tag>
                        : <Tag icon={<CloseCircleOutlined />}>Not Installed</Tag>,
                    ]}
                  >
                    <List.Item.Meta
                      title={comp.name}
                      description={comp.version || comp.id}
                    />
                  </List.Item>
                )}
              />
            </section>
          )}
        </Space>
      </div>
    </div>
  );
}
