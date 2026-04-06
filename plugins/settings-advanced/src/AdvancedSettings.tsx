// A007/SettingsSections: Advanced settings form — preferences surface only.
// A008/BudgetRegistry: All Tauri invokes go through __TAURI_INTERNALS__ for cross-origin preferences window.
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, Form, Input, Modal, Select, Space, Typography } from 'antd';
import { SettingsHeader } from '@snapfzz/shared';

const { Text } = Typography;

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

interface AdvancedFormValues {
  fpsCounter: boolean;
  logLevel: LogLevel;
}

// A007/TauriIPC: Preferences window loads from an external URL; __TAURI_INTERNALS__
// provides invoke() without requiring @tauri-apps/api to be bundled.
function tauriInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const w = window as unknown as Record<string, unknown>;
  const tauri = w.__TAURI_INTERNALS__ as
    | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
    | undefined;
  if (!tauri) {
    console.error('[settings-advanced] __TAURI_INTERNALS__ not available');
    return Promise.reject(new Error('Tauri not available'));
  }
  return tauri.invoke(cmd, args);
}

const LOG_LEVEL_OPTIONS: { value: LogLevel; label: string }[] = [
  { value: 'error', label: 'Error' },
  { value: 'warn', label: 'Warn' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug' },
  { value: 'trace', label: 'Trace' },
];

// A007/settingsSections: Default export required — preferences shell uses dynamic import().
export default function AdvancedSettings(): React.ReactElement {
  const [form] = Form.useForm<AdvancedFormValues>();
  const [dataDir, setDataDir] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const loadingRef = React.useRef(false);

  const loadSettings = useCallback(async () => {
    loadingRef.current = true;
    try {
      const [dir, settings] = await Promise.all([
        tauriInvoke('get_data_dir') as Promise<string>,
        tauriInvoke('get_settings') as Promise<Record<string, unknown>>,
      ]);
      setDataDir(dir ?? '');
      form.setFieldsValue({
        fpsCounter: (settings.fpsCounter as boolean) ?? true,
        logLevel: (settings.logLevel as LogLevel) ?? 'info',
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
    let values: AdvancedFormValues;
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
        fpsCounter: values.fpsCounter,
        logLevel: values.logLevel,
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

  const [modal, contextHolder] = Modal.useModal();

  function confirmReset(): void {
    modal.confirm({
      title: 'Reset all settings to defaults?',
      content:
        'This will restore every setting to its factory default. All API keys, theme preferences, and font settings will be cleared. Your projects and data are not affected.',
      okText: 'Reset Everything',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      async onOk() {
        try {
          await tauriInvoke('save_settings', {
            settings: {
              apiKey: '',
              model: 'gpt-4o',
              apiUrl: 'https://api.openai.com/v1',
              theme: 'system',
              openLastProject: true,
              language: 'en',
              fontFamily: 'Inter',
              fontSize: '14',
              fpsCounter: true,
              logLevel: 'info',
            },
          });
          await loadSettings();
          setIsDirty(false);
        } catch {
          // Reset failed silently
        }
      },
    });
  }

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      {contextHolder}
      <SettingsHeader
        title="Advanced"
        isDirty={isDirty}
        saving={saving}
        saveSuccess={saveSuccess}
        saveError={saveError}
        onSave={handleSave}
        onDiscard={() => { void loadSettings(); setIsDirty(false); }}
      />
      <div style={{ padding: "16px 32px", maxWidth: 560 }}>
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ fpsCounter: true, logLevel: 'info' }}
          onValuesChange={() => { if (!loadingRef.current) setIsDirty(true); }}
        >
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
                    const selected = await tauriInvoke('pick_folder', { defaultPath: dataDir }) as string | null;
                    if (selected) {
                      await tauriInvoke('set_data_dir', { newPath: selected });
                      setDataDir(selected);
                      Modal.info({
                        title: 'Restart Required',
                        content: 'Data directory changed. Please restart Snapfzz for changes to take effect.',
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
                Performance
              </Text>
              <Form.Item name="fpsCounter" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Checkbox>Show FPS counter overlay</Checkbox>
              </Form.Item>
            </section>

            <section>
              <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
                Log level
              </Text>
              <Form.Item name="logLevel" style={{ marginBottom: 0 }}>
                <Select<LogLevel>
                  options={LOG_LEVEL_OPTIONS}
                  style={{ width: 160 }}
                />
              </Form.Item>
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
        </Form>
      </div>
    </div>
  );
}
