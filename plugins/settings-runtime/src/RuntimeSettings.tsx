// A007/SettingsSections: Runtime settings form — preferences surface only.
// A008/BudgetRegistry: All Tauri invokes go through __TAURI_INTERNALS__ for cross-origin preferences window.
import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';

const { Title, Text } = Typography;

// A007/TauriIPC: Preferences window loads from an external URL; __TAURI_INTERNALS__
// provides invoke() without requiring @tauri-apps/api to be bundled.
function tauriInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const w = window as unknown as Record<string, unknown>;
  const tauri = w.__TAURI_INTERNALS__ as
    | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
    | undefined;
  if (!tauri) {
    console.error('[settings-runtime] __TAURI_INTERNALS__ not available');
    return Promise.reject(new Error('Tauri not available'));
  }
  console.log('[settings-runtime] invoke:', cmd, args);
  return tauri.invoke(cmd, args).then((result) => {
    console.log('[settings-runtime] result:', cmd, result);
    return result;
  }).catch((err) => {
    console.error('[settings-runtime] error:', cmd, err);
    throw err;
  });
}

interface AppSettings {
  apiKey: string;
  model: string;
  apiUrl: string;
}

interface AgentHealth {
  status: 'connected' | 'disconnected';
  pid?: number;
}

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'gpt-4o' },
  { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
  { value: 'gpt-4-turbo', label: 'gpt-4-turbo' },
  { value: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' },
];

// A007/settingsSections: Default export required — preferences shell uses dynamic import().
export default function RuntimeSettings() {
  const [form] = Form.useForm<AppSettings>();
  const [health, setHealth] = useState<AgentHealth>({ status: 'disconnected' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const loadingRef = React.useRef(false);

  const loadSettings = useCallback(async () => {
    loadingRef.current = true;
    try {
      const settings = await tauriInvoke('get_settings') as AppSettings;
      form.setFieldsValue({
        apiKey: settings.apiKey ?? '',
        model: settings.model ?? 'gpt-4o',
        apiUrl: settings.apiUrl ?? 'https://api.openai.com/v1',
      });
    } catch {
      // First launch — defaults apply
    }
    setTimeout(() => { loadingRef.current = false; }, 100);
  }, [form]);

  const pollHealth = useCallback(async () => {
    try {
      const h = await tauriInvoke('agent_health') as { status: string };
      setHealth({ status: h.status === 'connected' ? 'connected' : 'disconnected' });
    } catch {
      setHealth({ status: 'disconnected' });
    }
  }, []);

  useEffect(() => {
    loadSettings();
    pollHealth();
    const interval = setInterval(pollHealth, 5000);
    return () => clearInterval(interval);
  }, [loadSettings, pollHealth]);

  const handleSave = useCallback(async () => {
    console.log('[settings-runtime] handleSave clicked');
    setSaveError(null);
    setSaveSuccess(false);
    let values: AppSettings;
    try {
      values = await form.validateFields();
      console.log('[settings-runtime] validated:', values);
    } catch (validationErr) {
      console.error('[settings-runtime] validation failed:', validationErr);
      return;
    }
    setSaving(true);
    try {
      await tauriInvoke('save_settings', {
        settings: {
          apiKey: values.apiKey,
          model: values.model,
          apiUrl: values.apiUrl,
        },
      });
      setIsDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }, [form]);

  const isOnline = health.status === 'connected';

  return (
    <div style={{ padding: '24px 32px', maxWidth: 560, color: 'var(--text-primary)' }}>
      <Title level={4} style={{ color: 'var(--text-primary)', marginBottom: 24 }}>
        Runtime Settings
      </Title>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 28,
          padding: '12px 16px',
          background: 'var(--bg-subtle)',
          borderRadius: 8,
          border: '1px solid var(--border-default)',
        }}
      >
        <Text style={{ color: 'var(--text-secondary)', minWidth: 72 }}>Status</Text>
        <Tag
          color={isOnline ? 'success' : 'default'}
          style={{
            borderRadius: 12,
            fontWeight: 500,
            background: isOnline ? 'rgba(34,197,94,0.12)' : 'var(--bg-tertiary)',
            borderColor: isOnline ? 'var(--color-success)' : 'var(--border-strong)',
            color: isOnline ? 'var(--color-success)' : 'var(--text-muted)',
          }}
        >
          {isOnline ? '● Online' : '○ Disconnected'}
        </Tag>
      </div>

      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ model: 'gpt-4o', apiUrl: 'https://api.openai.com/v1' }}
        onValuesChange={() => { if (!loadingRef.current) setIsDirty(true); }}
      >
        <Text
          style={{
            display: 'block',
            color: 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          AgentScope
        </Text>

        <Space style={{ width: '100%', marginBottom: 20 }} direction="horizontal" size={12}>
          <Form.Item
            name="host"
            label={<span style={{ color: 'var(--text-secondary)' }}>Host</span>}
            style={{ marginBottom: 0, flex: 1 }}
          >
            <Input
              placeholder="127.0.0.1"
              disabled
              style={{
                background: 'var(--bg-input)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-muted)',
              }}
            />
          </Form.Item>
          <Form.Item
            name="port"
            label={<span style={{ color: 'var(--text-secondary)' }}>Port</span>}
            style={{ marginBottom: 0, width: 100 }}
          >
            <Input
              placeholder="8090"
              disabled
              style={{
                background: 'var(--bg-input)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-muted)',
              }}
            />
          </Form.Item>
        </Space>

        <Text
          style={{
            display: 'block',
            color: 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 12,
            marginTop: 8,
          }}
        >
          Model Configuration
        </Text>

        <Form.Item
          name="apiKey"
          label={<span style={{ color: 'var(--text-secondary)' }}>API Key</span>}
          rules={[{ required: true, message: 'API key is required' }]}
        >
          {/* A003/Spec: API key masked by default; show/hide toggle exposes plain text. */}
          <Input.Password
            placeholder="sk-..."
            style={{
              background: 'var(--bg-input)',
              borderColor: 'var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
        </Form.Item>

        <Form.Item
          name="model"
          label={<span style={{ color: 'var(--text-secondary)' }}>Model</span>}
        >
          <Select
            options={MODEL_OPTIONS}
            style={{ background: 'var(--bg-input)' }}
            classNames={{ popup: { root: 'runtime-settings-model-popup' } }}
          />
        </Form.Item>

        <Form.Item
          name="apiUrl"
          label={<span style={{ color: 'var(--text-secondary)' }}>API URL</span>}
        >
          <Input
            placeholder="https://api.openai.com/v1"
            style={{
              background: 'var(--bg-input)',
              borderColor: 'var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
        </Form.Item>

      </Form>

      <div style={{
        marginTop: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 0',
        borderTop: '1px solid var(--border-default)',
      }}>
        {isDirty && (
          <>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Unsaved changes</span>
            <button
              type="button"
              onClick={() => { loadSettings(); setIsDirty(false); }}
              style={{
                padding: '6px 16px',
                background: 'none',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Discard
            </button>
          </>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          style={{
            padding: '6px 16px',
            background: isDirty ? 'var(--accent)' : 'var(--bg-subtle)',
            color: isDirty ? 'var(--bg-primary)' : 'var(--text-muted)',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            cursor: isDirty && !saving ? 'pointer' : 'default',
          }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {saveSuccess && (
          <span style={{ color: 'var(--color-success)', fontSize: 13 }}>Saved</span>
        )}
        {saveError && (
          <span style={{ color: 'var(--color-error)', fontSize: 13 }}>{saveError}</span>
        )}
      </div>
    </div>
  );
}
