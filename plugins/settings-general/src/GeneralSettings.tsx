import React, { useEffect, useState } from 'react';
import { Checkbox, Radio, Select, Space, Typography } from 'antd';
import { SettingsHeader } from '@snapfzz/shared';

const { Text } = Typography;

type Theme = 'light' | 'dark' | 'system';

interface GeneralState {
  theme: Theme;
  openLastProject: boolean;
  language: string;
}

function tauriInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const w = window as unknown as Record<string, unknown>;
  const tauri = w.__TAURI_INTERNALS__ as
    | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
    | undefined;
  if (!tauri) return Promise.reject('Tauri not available');
  return tauri.invoke(cmd, args);
}

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français (coming soon)', disabled: true },
  { value: 'de', label: 'Deutsch (coming soon)', disabled: true },
  { value: 'ja', label: '日本語 (coming soon)', disabled: true },
];

export default function GeneralSettings(): React.ReactElement {
  const [state, setState] = useState<GeneralState>({
    theme: 'system',
    openLastProject: true,
    language: 'en',
  });

  useEffect(() => {
    tauriInvoke('get_general_settings')
      .then((raw) => {
        const data = raw as Partial<GeneralState>;
        setState((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {});
  }, []);

  function handleThemeChange(theme: Theme): void {
    setState((prev) => ({ ...prev, theme }));
    tauriInvoke('set_general_setting', { key: 'theme', value: theme }).catch(() => {});
  }

  function handleOpenLastProjectChange(checked: boolean): void {
    setState((prev) => ({ ...prev, openLastProject: checked }));
    tauriInvoke('set_general_setting', { key: 'openLastProject', value: checked }).catch(() => {});
  }

  function handleLanguageChange(language: string): void {
    setState((prev) => ({ ...prev, language }));
    tauriInvoke('set_general_setting', { key: 'language', value: language }).catch(() => {});
  }

  return (
    <div>
      <SettingsHeader title="General" />
      <div style={{ padding: 16, maxWidth: 560 }}>
      <Space direction="vertical" size={32} style={{ width: '100%' }}>
        <section>
          <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
            Theme
          </Text>
          <Radio.Group
            value={state.theme}
            onChange={(e) => handleThemeChange(e.target.value as Theme)}
          >
            <Space direction="vertical" size={8}>
              <Radio value="light">Light</Radio>
              <Radio value="dark">Dark</Radio>
              <Radio value="system">System (follow OS)</Radio>
            </Space>
          </Radio.Group>
        </section>

        <section>
          <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
            Startup
          </Text>
          <Checkbox
            checked={state.openLastProject}
            onChange={(e) => handleOpenLastProjectChange(e.target.checked)}
          >
            Reopen last project on launch
          </Checkbox>
        </section>

        <section>
          <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
            Language
          </Text>
          <Select
            value={state.language}
            onChange={handleLanguageChange}
            options={LANGUAGE_OPTIONS}
            style={{ width: 240 }}
          />
          <br />
          <Text type="secondary" style={{ fontSize: 12, marginTop: 'var(--spacing-2, 8px)', display: 'block' }}>
            More languages are on the roadmap.
          </Text>
        </section>
      </Space>
      </div>
    </div>
  );
}
