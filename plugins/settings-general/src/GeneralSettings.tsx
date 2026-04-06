// A007/SettingsSections: General settings form — preferences surface only.
// A008/BudgetRegistry: All Tauri invokes go through __TAURI_INTERNALS__ for cross-origin preferences window.
import React, { useCallback, useEffect } from 'react';
import { Checkbox, Form, Input, Radio, Select, Space, Typography } from 'antd';
import { SettingsHeader } from '@snapfzz/shared';
import { useState } from 'react';

const { Text } = Typography;

type Theme = 'light' | 'dark' | 'system';

interface GeneralFormValues {
  theme: Theme;
  openLastProject: boolean;
  language: string;
  fontFamily: string;
  fontSize: string;
}

interface FullSettings extends GeneralFormValues {
  [key: string]: unknown;
}

// A007/TauriIPC: Preferences window loads from an external URL; __TAURI_INTERNALS__
// provides invoke() without requiring @tauri-apps/api to be bundled.
function tauriInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const w = window as unknown as Record<string, unknown>;
  const tauri = w.__TAURI_INTERNALS__ as
    | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
    | undefined;
  if (!tauri) {
    console.error('[settings-general] __TAURI_INTERNALS__ not available');
    return Promise.reject(new Error('Tauri not available'));
  }
  return tauri.invoke(cmd, args);
}

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français (coming soon)', disabled: true },
  { value: 'de', label: 'Deutsch (coming soon)', disabled: true },
  { value: 'ja', label: '日本語 (coming soon)', disabled: true },
];

const FONT_FAMILY_PRESETS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'System', label: 'System Default' },
  { value: 'SF Pro', label: 'SF Pro' },
  { value: 'Helvetica Neue', label: 'Helvetica Neue' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono' },
];

const FONT_SIZE_OPTIONS = [
  { value: '12', label: '12px' },
  { value: '13', label: '13px' },
  { value: '14', label: '14px (default)' },
  { value: '15', label: '15px' },
  { value: '16', label: '16px' },
  { value: '18', label: '18px' },
];

// A007/settingsSections: Default export required — preferences shell uses dynamic import().
export default function GeneralSettings(): React.ReactElement {
  const [form] = Form.useForm<GeneralFormValues>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const loadingRef = React.useRef(false);

  const loadSettings = useCallback(async () => {
    loadingRef.current = true;
    try {
      const settings = await tauriInvoke('get_settings') as FullSettings;
      form.setFieldsValue({
        theme: (settings.theme as Theme) ?? 'system',
        openLastProject: settings.openLastProject ?? true,
        language: settings.language ?? 'en',
        fontFamily: (settings.fontFamily as string) ?? 'Inter',
        fontSize: (settings.fontSize as string) ?? '14',
      });
    } catch {
      // First launch — defaults apply
    }
    setTimeout(() => { loadingRef.current = false; }, 100);
  }, [form]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setSaveSuccess(false);
    let values: GeneralFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const current = await tauriInvoke('get_settings') as Record<string, unknown>;
      const merged = {
        ...current,
        theme: values.theme,
        openLastProject: values.openLastProject,
        language: values.language,
        fontFamily: values.fontFamily,
        fontSize: values.fontSize,
      };
      await tauriInvoke('save_settings', { settings: merged });
      setIsDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }, [form]);

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <SettingsHeader
        title="General"
        isDirty={isDirty}
        saving={saving}
        saveSuccess={saveSuccess}
        saveError={saveError}
        onSave={handleSave}
        onDiscard={() => { void loadSettings(); setIsDirty(false); }}
      />
      <div style={{ padding: 16, maxWidth: 560 }}>
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ theme: 'system', openLastProject: true, language: 'en', fontFamily: 'Inter', fontSize: '14' }}
          onValuesChange={() => { if (!loadingRef.current) setIsDirty(true); }}
        >
          <Space direction="vertical" size={32} style={{ width: '100%' }}>
            <section>
              <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
                Theme
              </Text>
              <Form.Item name="theme" style={{ marginBottom: 0 }}>
                <Radio.Group>
                  <Space direction="vertical" size={8}>
                    <Radio value="light">Light</Radio>
                    <Radio value="dark">Dark</Radio>
                    <Radio value="system">System (follow OS)</Radio>
                  </Space>
                </Radio.Group>
              </Form.Item>
            </section>

            <section>
              <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
                Startup
              </Text>
              <Form.Item name="openLastProject" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Checkbox>Reopen last project on launch</Checkbox>
              </Form.Item>
            </section>

            <section>
              <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
                Font Family
              </Text>
              <Form.Item name="fontFamily" style={{ marginBottom: 8 }}>
                <Select options={FONT_FAMILY_PRESETS} style={{ width: 240 }} />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Input
                  placeholder="Or type a custom font name..."
                  onChange={(e) => {
                    if (e.target.value) form.setFieldsValue({ fontFamily: e.target.value });
                  }}
                  style={{ width: 240 }}
                />
              </Form.Item>
            </section>

            <section>
              <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
                Font Size
              </Text>
              <Form.Item name="fontSize" style={{ marginBottom: 8 }}>
                <Select options={FONT_SIZE_OPTIONS} style={{ width: 240 }} />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Input
                  placeholder="Or type a custom size (e.g. 17)..."
                  onChange={(e) => {
                    if (e.target.value) form.setFieldsValue({ fontSize: e.target.value });
                  }}
                  style={{ width: 240 }}
                  suffix="px"
                />
              </Form.Item>
            </section>

            <section>
              <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
                Language
              </Text>
              <Form.Item name="language" style={{ marginBottom: 0 }}>
                <Select
                  options={LANGUAGE_OPTIONS}
                  style={{ width: 240 }}
                />
              </Form.Item>
              <Text type="secondary" style={{ fontSize: 12, marginTop: 'var(--spacing-2, 8px)', display: 'block' }}>
                More languages are on the roadmap.
              </Text>
            </section>
          </Space>
        </Form>
      </div>
    </div>
  );
}
