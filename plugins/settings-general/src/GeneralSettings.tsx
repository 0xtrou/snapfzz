// A007/SettingsSections: General settings form — preferences surface only.
// A008/BudgetRegistry: All Tauri invokes go through __TAURI_INTERNALS__ for cross-origin preferences window.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Form, Input, Modal, Radio, Select, Space, Tag, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { SettingsHeader } from '@snapfzz/shared';

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

// Per A007/MultiLayout: notify same-window useAppSettings listener immediately after save.
// Cross-window delivery is handled by Rust save_settings which emits to all webviews.
function emitSettingsChanged(): void {
  window.dispatchEvent(new CustomEvent('snapfzz:settings-changed'));
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
  { value: 'JetBrains Mono', label: 'JetBrains Mono' },
];

const FONT_SIZE_OPTIONS = [
  { value: '12', label: '12px (default)' },
  { value: '13', label: '13px' },
  { value: '14', label: '14px' },
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

  const [installedFonts, setInstalledFonts] = useState<string[]>([]);
  const [fontUrl, setFontUrl] = useState('');
  const [fontUrlName, setFontUrlName] = useState('');
  const [fontUrlInstalling, setFontUrlInstalling] = useState(false);
  const [fontUrlError, setFontUrlError] = useState<string | null>(null);
  const [fileInstalling, setFileInstalling] = useState(false);
  const [fileInstallError, setFileInstallError] = useState<string | null>(null);
  const [fontToRemove, setFontToRemove] = useState<string | null>(null);
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false);

  const loadingRef = useRef(false);

  const loadInstalledFonts = useCallback(async () => {
    try {
      const names = (await tauriInvoke('list_installed_fonts')) as string[];
      setInstalledFonts(Array.isArray(names) ? names : []);
    } catch {
      setInstalledFonts([]);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    loadingRef.current = true;
    try {
      const settings = await tauriInvoke('get_settings') as FullSettings;
      form.setFieldsValue({
        theme: (settings.theme as Theme) ?? 'system',
        openLastProject: settings.openLastProject ?? true,
        language: settings.language ?? 'en',
        fontFamily: (settings.fontFamily as string) ?? 'Inter',
        fontSize: (settings.fontSize as string) ?? '12',
      });
    } catch {
      // First launch — defaults apply
    }
    setTimeout(() => { loadingRef.current = false; }, 100);
  }, [form]);

  useEffect(() => {
    void loadSettings();
    void loadInstalledFonts();
  }, [loadSettings, loadInstalledFonts]);

  const allFontOptions = [
    ...FONT_FAMILY_PRESETS,
    ...installedFonts
      .filter((name) => !FONT_FAMILY_PRESETS.some((p) => p.value === name))
      .map((name) => ({ value: name, label: name })),
  ];

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
      // Per A007/PreferencesLayout: broadcast settings writes so every window re-applies persisted appearance state.
      emitSettingsChanged();
      setIsDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError('Unable to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [form]);

  const handleInstallFromUrl = useCallback(async () => {
    setFontUrlError(null);
    if (!fontUrl.trim() || !fontUrlName.trim()) {
      setFontUrlError('Enter both a font URL and a name.');
      return;
    }
    setFontUrlInstalling(true);
    try {
      await tauriInvoke('install_font_from_url', { url: fontUrl.trim(), name: fontUrlName.trim() });
      setFontUrl('');
      setFontUrlName('');
      await loadInstalledFonts();
    } catch (err) {
      setFontUrlError(String(err));
    } finally {
      setFontUrlInstalling(false);
    }
  }, [fontUrl, fontUrlName, loadInstalledFonts]);

  const handleInstallFromFile = useCallback(async (file: UploadFile) => {
    setFileInstallError(null);
    const name = (file.name ?? '').replace(/\.[^.]+$/, '');
    const path = (file as unknown as { path?: string }).path ?? '';
    if (!path) {
      setFileInstallError('Could not determine file path.');
      return false;
    }
    setFileInstalling(true);
    try {
      await tauriInvoke('install_font_from_file', { sourcePath: path, name });
      await loadInstalledFonts();
    } catch (err) {
      setFileInstallError(String(err));
    } finally {
      setFileInstalling(false);
    }
    return false;
  }, [loadInstalledFonts]);

  const handleRemoveFont = useCallback(async (name: string) => {
    setFontToRemove(name);
    setRemoveConfirmVisible(true);
  }, []);

  const confirmRemoveFont = useCallback(async () => {
    if (!fontToRemove) return;
    try {
      await tauriInvoke('remove_font', { name: fontToRemove });
      await loadInstalledFonts();
    } catch (err) {
      setFontUrlError(String(err));
    } finally {
      setFontToRemove(null);
      setRemoveConfirmVisible(false);
    }
  }, [fontToRemove, loadInstalledFonts]);

  const cancelRemoveFont = useCallback(() => {
    setFontToRemove(null);
    setRemoveConfirmVisible(false);
  }, []);

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
      <div style={{ padding: "16px 32px", maxWidth: 560 }}>
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ theme: 'system', openLastProject: true, language: 'en', fontFamily: 'Inter', fontSize: '12' }}
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
              <Form.Item name="fontFamily" style={{ marginBottom: 0 }}>
                <Select options={allFontOptions} style={{ width: 240 }} />
              </Form.Item>
            </section>


            <section>
              <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
                Custom Fonts
              </Text>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space.Compact style={{ width: '100%', maxWidth: 480 }}>
                  <Input
                    placeholder="Font name"
                    value={fontUrlName}
                    onChange={(e) => setFontUrlName(e.target.value)}
                    style={{ width: 140 }}
                    aria-label="Font name for URL install"
                  />
                  <Input
                    placeholder="https://example.com/font.woff2"
                    value={fontUrl}
                    onChange={(e) => setFontUrl(e.target.value)}
                    aria-label="Font URL"
                  />
                  <Button
                    onClick={handleInstallFromUrl}
                    loading={fontUrlInstalling}
                    aria-label="Install font from URL"
                  >
                    Install
                  </Button>
                </Space.Compact>
                {fontUrlError && (
                  <Text type="danger" style={{ fontSize: 12 }}>{fontUrlError}</Text>
                )}

                <Upload
                  accept=".ttf,.otf,.woff,.woff2"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    void handleInstallFromFile(file as unknown as UploadFile);
                    return false;
                  }}
                >
                  <Button icon={<UploadOutlined />} loading={fileInstalling}>
                    Select Font File
                  </Button>
                </Upload>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Accepted formats: .ttf, .otf, .woff, .woff2
                </Text>
                {fileInstallError && (
                  <Text type="danger" style={{ fontSize: 12 }}>{fileInstallError}</Text>
                )}

                {installedFonts.length > 0 && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                      Installed:
                    </Text>
                    {installedFonts.map((name) => (
                      <Tag 
                        key={name} 
                        closable
                        onClose={(e) => {
                          e.preventDefault();
                          handleRemoveFont(name);
                        }}
                        style={{ cursor: 'default' }}
                      >
                        {name}
                      </Tag>
                    ))}
                  </div>
                )}
              </Space>
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
                    if (e.target.value) form.setFieldValue('fontSize', e.target.value);
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
      <Modal
        title="Remove Font"
        open={removeConfirmVisible}
        onOk={confirmRemoveFont}
        onCancel={cancelRemoveFont}
        okText="Remove"
        okButtonProps={{ danger: true }}
        cancelText="Cancel"
      >
        <p>Are you sure you want to remove the font "<strong>{fontToRemove}</strong>"? This action cannot be undone.</p>
      </Modal>
    </div>
  );
}
