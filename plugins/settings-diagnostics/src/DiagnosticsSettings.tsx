import React, { useCallback, useEffect, useState } from 'react';
import { Descriptions, List, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { createTauriBridge, SettingsHeader, AppButton } from '@snapfzz/shared';

const { Text } = Typography;
const bridge = createTauriBridge();

type HardwareInfo = {
  cores: number;
  ramGb: number;
  onBattery: boolean;
};

type ComponentInfo = {
  id: string;
  name: string;
  version: string;
  platform: string;
  platformDisplay: string;
  isInstalled: boolean;
};

export default function DiagnosticsSettings(): React.ReactElement {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [h, c] = await Promise.all([
        bridge.invoke<HardwareInfo>('get_hardware_info'),
        bridge.invoke<ComponentInfo[]>('component_list'),
      ]);
      setHardware(h);
      setComponents(c);
    } catch {
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
              <Text strong>System Components</Text>
              <AppButton icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
                Re-check
              </AppButton>
            </div>
            <List
              size="small"
              bordered
              loading={loading}
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
                    description={[comp.version, comp.platformDisplay].filter(Boolean).join(' — ') || comp.id}
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
        </Space>
      </div>
    </div>
  );
}
