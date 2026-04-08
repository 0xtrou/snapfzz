import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Descriptions, List, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  PythonOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { createTauriBridge, SettingsHeader, AppButton } from '@snapfzz/shared';

const { Text } = Typography;
const bridge = createTauriBridge();

type CheckTimingDto = {
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

type CheckIndicator = {
  icon: React.ReactElement;
  color: 'success' | 'warning' | 'error';
  label: string;
  message?: string;
};

interface PythonRuntimeStatus {
  python_installed: boolean;
  python_version?: string;
  python_path?: string;
  uv_installed: boolean;
  uv_version?: string;
  installed_packages: string[];
}

function checkLabel(name: string): string {
  if (name.length === 0) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function checkIndicator(check: CheckTimingDto): CheckIndicator {
  const normalizedStatus = check.status.toLowerCase();
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
      message: check.detail ?? 'Some checks need attention.',
    };
  }

  return {
    icon: <CloseCircleOutlined />,
    color: 'error',
    label: 'Failed',
    message: check.detail ?? 'Unable to complete this check.',
  };
}

export default function DiagnosticsSettings(): React.ReactElement {
  const [checks, setChecks] = useState<CheckTimingDto[]>([]);
  const [systemStatusError, setSystemStatusError] = useState<string | null>(null);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [preset, setPreset] = useState<string>('Performance');
  const [platform, setPlatform] = useState<string>('macOS (Apple Silicon)');
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [pythonRuntime, setPythonRuntime] = useState<PythonRuntimeStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);

    const [systemStatusResult, hardwareResult, snapshotResult, componentsResult, pythonResult] = await Promise.allSettled([
      bridge.invoke<CheckTimingDto[]>('preflight_status'),
      bridge.invoke<HardwareInfo>('get_hardware_info'),
      bridge.invoke<BudgetSnapshot>('budget_snapshot'),
      bridge.invoke<ComponentInfo[]>('component_list'),
      bridge.invoke<PythonRuntimeStatus>('python_runtime_status').catch(() => null),
    ]);

    if (systemStatusResult.status === 'fulfilled') {
      setChecks(systemStatusResult.value);
      setSystemStatusError(null);
    } else {
      setChecks([]);
      setSystemStatusError('Unable to load system status.');
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
      setPreset(checkLabel(snapshotResult.value.presetName));
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

    if (pythonResult.status === 'fulfilled' && pythonResult.value) {
      setPythonRuntime(pythonResult.value);
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
              <Text strong>System Status</Text>
              <AppButton onClick={refresh} loading={refreshing}>
                Re-run
              </AppButton>
            </div>
            <List
              size="small"
              bordered
              locale={{ emptyText: 'No system status data available.' }}
              dataSource={checks}
              renderItem={(check) => {
                const indicator = checkIndicator(check);
                return (
                  <List.Item key={check.phase}>
                    <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                      <Text>{checkLabel(check.name)}</Text>
                      <Space size={12} align="center">
                        <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {`${check.durationMs}ms`}
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
            {systemStatusError && (
              <Text type="danger" style={{ marginTop: 8, display: 'block' }}>
                {systemStatusError}
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
            <Text strong style={{ display: 'block', marginBottom: 12 }}>Python Runtime</Text>
            {pythonRuntime ? (
              <Descriptions
                size="small"
                bordered
                column={1}
                style={{ maxWidth: 500 }}
                items={[
                  {
                    key: 'python',
                    label: 'Python',
                    children: pythonRuntime.python_installed ? (
                      <Tag color="success" icon={<CheckCircleOutlined />}>
                        {pythonRuntime.python_version ? `v${pythonRuntime.python_version}` : 'Installed'}
                      </Tag>
                    ) : (
                      <Tag color="error" icon={<CloseCircleOutlined />}>Not Installed</Tag>
                    ),
                  },
                  {
                    key: 'uv',
                    label: 'uv (Package Manager)',
                    children: pythonRuntime.uv_installed ? (
                      <Tag color="success" icon={<CheckCircleOutlined />}>
                        {pythonRuntime.uv_version ? `v${pythonRuntime.uv_version}` : 'Installed'}
                      </Tag>
                    ) : (
                      <Tag color="error" icon={<CloseCircleOutlined />}>Not Installed</Tag>
                    ),
                  },
                  pythonRuntime.python_path ? {
                    key: 'path',
                    label: 'Python Path',
                    children: <Text code style={{ fontSize: 11 }}>{pythonRuntime.python_path}</Text>,
                  } : null,
                  {
                    key: 'packages',
                    label: 'Installed Packages',
                    children: (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 400 }}>
                        {pythonRuntime.installed_packages
                          .filter(pkg => {
                            const name = pkg.split('=')[0].split('[')[0].toLowerCase();
                            return name.startsWith('agentscope') || name.startsWith('litellm');
                          })
                          .map((pkg) => (
                          <Tag key={pkg} color="blue">{pkg.split('=')[0]}</Tag>
                        ))}
                        {pythonRuntime.installed_packages.filter(pkg => {
                          const name = pkg.split('=')[0].split('[')[0].toLowerCase();
                          return name.startsWith('agentscope') || name.startsWith('litellm');
                        }).length === 0 && (
                          <Text type="secondary">No agent packages installed</Text>
                        )}
                      </div>
                    ),
                  },
                ].filter(Boolean)}
              />
            ) : (
              <Text type="secondary">Loading Python runtime status...</Text>
            )}
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
