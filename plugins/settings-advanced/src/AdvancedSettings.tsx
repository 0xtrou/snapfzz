import React, { useEffect, useState } from 'react';
import { Button, Checkbox, Input, Modal, Select, Space, Typography } from 'antd';

const { Title, Text } = Typography;

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

interface AdvancedState {
  dataDir: string;
  fpsCounter: boolean;
  logLevel: LogLevel;
}

function tauriInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const w = window as unknown as Record<string, unknown>;
  const tauri = w.__TAURI_INTERNALS__ as
    | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
    | undefined;
  if (!tauri) return Promise.reject('Tauri not available');
  return tauri.invoke(cmd, args);
}

const LOG_LEVEL_OPTIONS: { value: LogLevel; label: string }[] = [
  { value: 'error', label: 'Error' },
  { value: 'warn', label: 'Warn' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug' },
  { value: 'trace', label: 'Trace' },
];

export default function AdvancedSettings(): React.ReactElement {
  const [state, setState] = useState<AdvancedState>({
    dataDir: '',
    fpsCounter: false,
    logLevel: 'info',
  });

  useEffect(() => {
    Promise.all([
      tauriInvoke('get_data_dir'),
      tauriInvoke('get_advanced_settings'),
    ])
      .then(([dir, settings]) => {
        const s = settings as Partial<AdvancedState>;
        setState({
          dataDir: (dir as string) ?? '',
          fpsCounter: s.fpsCounter ?? false,
          logLevel: s.logLevel ?? 'info',
        });
      })
      .catch(() => {});
  }, []);

  function handleFpsChange(checked: boolean): void {
    setState((prev) => ({ ...prev, fpsCounter: checked }));
    tauriInvoke('set_advanced_setting', { key: 'fpsCounter', value: checked }).catch(() => {});
  }

  function handleLogLevelChange(logLevel: LogLevel): void {
    setState((prev) => ({ ...prev, logLevel }));
    tauriInvoke('set_advanced_setting', { key: 'logLevel', value: logLevel }).catch(() => {});
  }

  function confirmReset(): void {
    Modal.confirm({
      title: 'Reset all settings?',
      content:
        'This will restore every setting to its factory default. Your projects and data are not affected.',
      okText: 'Reset',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk() {
        tauriInvoke('reset_all_settings').catch(() => {});
      },
    });
  }

  return (
    <div style={{ padding: 'var(--spacing-6, 24px)', maxWidth: 560 }}>
      <Title level={3} style={{ marginBottom: 'var(--spacing-6, 24px)' }}>
        Advanced
      </Title>

      <Space direction="vertical" size={32} style={{ width: '100%' }}>
        <section>
          <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
            Data directory
          </Text>
          <Input
            value={state.dataDir}
            readOnly
            style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
          />
          <Text type="secondary" style={{ fontSize: 12, marginTop: 'var(--spacing-2, 8px)', display: 'block' }}>
            Projects, logs, and workspace metadata are stored here.
          </Text>
        </section>

        <section>
          <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
            Performance
          </Text>
          <Checkbox
            checked={state.fpsCounter}
            onChange={(e) => handleFpsChange(e.target.checked)}
          >
            Show FPS counter overlay
          </Checkbox>
        </section>

        <section>
          <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
            Log level
          </Text>
          <Select<LogLevel>
            value={state.logLevel}
            onChange={handleLogLevelChange}
            options={LOG_LEVEL_OPTIONS}
            style={{ width: 160 }}
          />
        </section>

        <section>
          <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
            Reset
          </Text>
          <Button danger onClick={confirmReset}>
            Reset all settings to defaults
          </Button>
          <Text type="secondary" style={{ fontSize: 12, marginTop: 'var(--spacing-2, 8px)', display: 'block' }}>
            Projects and data are not deleted.
          </Text>
        </section>
      </Space>
    </div>
  );
}
