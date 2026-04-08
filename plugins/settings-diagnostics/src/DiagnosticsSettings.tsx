import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Descriptions, List, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
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
  preset?: string;
  onBattery: boolean;
};

type ComponentInfo = {
  id: string;
  name: string;
  version: string;
  platformDisplay: string;
  isInstalled: boolean;
};

type BudgetSnapshot = {
  presetName?: string;
};

type PhaseIndicator = {
  icon: React.ReactElement;
  color: 'success' | 'warning' | 'error';
  label: string;
  message?: string;
};

function phaseLabel(name: string): string {
  if (name.length === 0) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function phaseIndicator(phase: PhaseTimingDto): PhaseIndicator {
  const normalizedStatus = phase.status.toLowerCase();
  if (normalizedStatus === 'ok') {
    return {
      icon: <CheckCircleOutlined />,
      color: 'success',
      label: 'Ok',
    };
  }

  if (normalizedStatus === 'degraded') {
    return {
      icon: <WarningOutlined />,
      color: 'warning',
      label: 'Degraded',
      message: phase.detail ?? 'Some checks need attention.',
    };
  }

  return {
    icon: <CloseCircleOutlined />,
    color: 'error',
    label: 'Failed',
    message: phase.detail ?? 'Unable to complete this check.',
  };
}

export default function DiagnosticsSettings(): React.ReactElement {
  const [phases, setPhases] = useState<PhaseTimingDto[]>([]);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [preset, setPreset] = useState<string>('Performance');
  const [platform, setPlatform] = useState<string>('macOS (Apple Silicon)');
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);

    const [preflightResult, hardwareResult, snapshotResult, componentsResult] = await Promise.allSettled([
      bridge.invoke<PhaseTimingDto[]>('preflight_status'),
      bridge.invoke<HardwareInfo>('get_hardware_info'),
      bridge.invoke<BudgetSnapshot>('budget_snapshot'),
      bridge.invoke<ComponentInfo[]>('component_list'),
    ]);

    if (preflightResult.status === 'fulfilled') {
      setPhases(preflightResult.value);
      setPreflightError(null);
    } else {
      setPhases([]);
      setPreflightError('Unable to load preflight status.');
    }

    if (hardwareResult.status === 'fulfilled') {
      setHardware(hardwareResult.value);
      if (hardwareResult.value.preset) {
        setPreset(hardwareResult.value.preset);
      }
    } else {
      setHardware(null);
    }

    if (snapshotResult.status === 'fulfilled' && snapshotResult.value.presetName) {
      setPreset(phaseLabel(snapshotResult.value.presetName));
    }

    if (componentsResult.status === 'fulfilled') {
      setComponents(componentsResult.value);
      const cef = componentsResult.value.find((component) => component.id === 'cef');
      if (cef?.platformDisplay) {
        setPlatform(cef.platformDisplay);
      }
    } else {
      setComponents([]);
    }

    setRefreshing(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const cefRuntime = useMemo(
    () => components.find((component) => component.id === 'cef'),
    [components],
  );

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <SettingsHeader title="Diagnostics" />
      <div style={{ padding: '16px 32px', maxWidth: 760 }}>
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text strong>Preflight Status</Text>
              <AppButton onClick={refresh} loading={refreshing}>
                Re-run checks
              </AppButton>
            </div>
            <List
              size="small"
              bordered
              locale={{ emptyText: 'No preflight data available.' }}
              dataSource={phases}
              renderItem={(phase) => {
                const indicator = phaseIndicator(phase);
                return (
                  <List.Item key={phase.phase}>
                    <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                      <Text>{`Phase ${phase.phase}: ${phaseLabel(phase.name)}`}</Text>
                      <Space size={12} align="center">
                        <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {`${phase.durationMs}ms`}
                        </Text>
                        <Tag color={indicator.color} icon={indicator.icon}>
                          {indicator.label}
                        </Tag>
                      </Space>
                    </div>
                    {indicator.message && (
                      <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
                        {indicator.message}
                      </Text>
                    )}
                  </List.Item>
                );
              }}
            />
            {preflightError && (
              <Text type="danger" style={{ marginTop: 8, display: 'block' }}>
                {preflightError}
              </Text>
            )}
          </section>

          <section>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>Hardware</Text>
            <Descriptions
              size="small"
              bordered
              column={1}
              items={[
                { key: 'cores', label: 'CPU Cores', children: hardware?.cores ?? '—' },
                { key: 'ram', label: 'RAM', children: hardware ? `${hardware.ramGb} GB` : '—' },
                { key: 'preset', label: 'Preset', children: preset },
                { key: 'platform', label: 'Platform', children: platform },
              ]}
            />
          </section>

          <section>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>System Packs</Text>
            <List
              size="small"
              bordered
              dataSource={cefRuntime ? [cefRuntime] : []}
              locale={{ emptyText: 'No system packs detected.' }}
              renderItem={(component) => (
                <List.Item key={component.id}>
                  <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <Text>CEF Runtime</Text>
                    <Space size={12} align="center">
                      <Tag color={component.isInstalled ? 'success' : 'error'} icon={component.isInstalled ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
                        {component.isInstalled ? 'Installed' : 'Missing'}
                      </Tag>
                      <Text type="secondary">{component.version || '—'}</Text>
                    </Space>
                  </div>
                </List.Item>
              )}
            />
          </section>
        </Space>
      </div>
    </div>
  );
}
