import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, Modal, Space, Typography } from 'antd';
import { createTauriBridge, SettingsHeader, ConfirmAction } from '@snapfzz/shared';

const { Text } = Typography;

const bridge = createTauriBridge();

export default function AdvancedSettings(): React.ReactElement {
  const [dataDir, setDataDir] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const dir = await bridge.invoke<string>('get_data_dir');
      setDataDir(dir ?? '');
    } catch {
      // First launch — defaults apply
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleReset(): Promise<void> {
    try {
      await bridge.invoke<void>('save_settings', {
        settings: {
          apiKey: '',
          model: 'gpt-4o',
          apiUrl: 'https://api.openai.com/v1',
          theme: 'system',
          openLastProject: true,
          language: 'en',
          fontFamily: 'Inter',
          fontSize: '13',
          preset: 'auto',
          agentscopeHost: '127.0.0.1',
          agentscopePort: '8090',
        },
      });
      window.dispatchEvent(new CustomEvent('snapfzz:settings-changed'));
    } catch {
      void 0;
    }
  }

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <SettingsHeader title="Advanced" />
      <div style={{ padding: '16px 32px', maxWidth: 560 }}>
        <Space direction="vertical" size={32} style={{ width: '100%' }}>
          <section>
            <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
              Data directory
            </Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={dataDir}
                readOnly
                style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
              />
              <Button onClick={async () => {
                try {
                  const selected = await bridge.invoke<string | null>('pick_folder', { defaultPath: dataDir });
                  if (selected) {
                    await bridge.invoke<void>('set_data_dir', { newPath: selected });
                    setDataDir(selected);
                    Modal.info({
                      title: 'Restart Required',
                      content: 'Data directory changed. Please restart for changes to take effect.',
                    });
                  }
                } catch { void 0; }
              }}>
                Browse...
              </Button>
            </Space.Compact>
            <Text type="secondary" style={{ fontSize: 12, marginTop: 'var(--spacing-2, 8px)', display: 'block' }}>
              Projects, logs, and workspace metadata are stored here. Changing this requires a restart.
            </Text>
          </section>

          <section>
            <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
              Reset
            </Text>
            <ConfirmAction
              title="Reset all settings to defaults?"
              description="All API keys, theme preferences, and font settings will be cleared. Projects and data are not affected."
              onConfirm={handleReset}
              okText="Reset Everything"
              danger
            >
              <Button danger>
                Reset all settings to defaults
              </Button>
            </ConfirmAction>
            <Text type="secondary" style={{ fontSize: 12, marginTop: 'var(--spacing-2, 8px)', display: 'block' }}>
              Projects and data are not deleted.
            </Text>
          </section>
        </Space>
      </div>
    </div>
  );
}
