import React, { useEffect, useState } from 'react';
import { List, Space, Switch, Tag, Typography } from 'antd';
import { createTauriBridge, SettingsHeader, AppButton, fetchWithToast } from '@snapfzz/shared';

const { Text } = Typography;

interface PluginEntry {
  id: string;
  name: string;
  version: string;
  zone: string;
  strikes: number;
  enabled: boolean;
}

interface BudgetSnapshot {
  plugins?: Array<{
    id: string;
    name?: string;
    version?: string;
    zone?: string;
    strikes?: number;
    enabled?: boolean;
  }>;
}

interface InstalledPluginInfo {
  pluginId: string;
  manifest: Record<string, unknown>;
  distPath: string;
}

const bridge = createTauriBridge();

function strikeColor(strikes: number): 'success' | 'warning' | 'error' {
  if (strikes === 0) return 'success';
  if (strikes < 3) return 'warning';
  return 'error';
}

function getManifestString(manifest: Record<string, unknown>, key: string): string {
  const val = manifest[key];
  return typeof val === 'string' ? val : '';
}

function getPythonDeclaration(manifest: Record<string, unknown>): string | null {
  const runtimes = manifest['runtimes'];
  if (runtimes && typeof runtimes === 'object' && !Array.isArray(runtimes)) {
    const python = (runtimes as Record<string, unknown>)['python'];
    if (Array.isArray(python) && python.length > 0) {
      const decl = python[0];
      return typeof decl === 'string' ? decl : null;
    }
  }
  return null;
}

export default function PluginsSettings(): React.ReactElement {
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemPlugins, setSystemPlugins] = useState<InstalledPluginInfo[]>([]);
  const [systemLoading, setSystemLoading] = useState(true);
  const [reinstalling, setReinstalling] = useState<Record<string, boolean>>({});

  useEffect(() => {
    bridge.invoke<BudgetSnapshot>('budget_snapshot')
      .then((snapshot) => {
        const entries: PluginEntry[] = (snapshot.plugins ?? []).map((p) => ({
          id: p.id,
          name: p.name ?? p.id,
          version: p.version ?? '—',
          zone: p.zone ?? 'zone3',
          strikes: p.strikes ?? 0,
          enabled: p.enabled ?? true,
        }));
        setPlugins(entries);
      })
      .catch(() => {
        setPlugins([]);
      })
      .finally(() => setLoading(false));

    bridge.invoke<InstalledPluginInfo[]>('list_installed_plugins')
      .then((list) => {
        setSystemPlugins(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        setSystemPlugins([]);
      })
      .finally(() => setSystemLoading(false));
  }, []);

  function handleToggle(id: string, enabled: boolean): void {
    setPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled } : p)),
    );
  }

  async function handleReinstall(pluginId: string, manifest: Record<string, unknown>): Promise<void> {
    setReinstalling((prev) => ({ ...prev, [pluginId]: true }));
    try {
      await fetchWithToast(
        async () => {
          await bridge.invoke<void>('install_system_plugin', { pluginId });
          const declaration = getPythonDeclaration(manifest);
          if (declaration !== null) {
            await bridge.invoke<void>('install_plugin_runtime', { declaration });
          }
        },
        {
          successMessage: `Plugin ${pluginId} reinstalled successfully`,
          errorMessage: `Failed to reinstall plugin ${pluginId}`,
        },
      );
    } finally {
      setReinstalling((prev) => ({ ...prev, [pluginId]: false }));
    }
  }

  return (
    <div>
      <SettingsHeader
        title="Plugins"
        subtitle="Manage installed plugins and monitor their reliability status. Disabled plugins are quarantined after repeated failures."
      />
      <div style={{ padding: '24px 32px', background: 'var(--bg-default)', border: '1px solid var(--border-default)', borderRadius: 8, margin: '16px 16px 24px' }}>
      <List<PluginEntry>
        loading={loading}
        dataSource={plugins}
        locale={{ emptyText: 'No plugins installed.' }}
        renderItem={(plugin) => (
          <List.Item
            key={plugin.id}
            actions={[
              <Switch
                key="toggle"
                checked={plugin.enabled}
                onChange={(checked) => handleToggle(plugin.id, checked)}
                aria-label={`Toggle ${plugin.name}`}
              />,
            ]}
          >
            <List.Item.Meta
              title={
                <Space size={8}>
                  <Text strong>{plugin.name}</Text>
                  <Tag>{plugin.version}</Tag>
                  <Tag color="blue">{plugin.zone}</Tag>
                  <Tag color={strikeColor(plugin.strikes)}>
                    {plugin.strikes} strike{plugin.strikes !== 1 ? 's' : ''}
                  </Tag>
                </Space>
              }
              description={<Text type="secondary" style={{ fontSize: 12 }}>{plugin.id}</Text>}
            />
          </List.Item>
        )}
      />
      </div>

      <div style={{ padding: '0 16px 8px' }}>
        <Text strong style={{ fontSize: 14 }}>System Plugins</Text>
      </div>
      <div style={{ padding: '24px 32px', background: 'var(--bg-default)', border: '1px solid var(--border-default)', borderRadius: 8, margin: '0 16px 24px' }}>
      <List<InstalledPluginInfo>
        loading={systemLoading}
        dataSource={systemPlugins}
        locale={{ emptyText: 'No system plugins found.' }}
        renderItem={(plugin) => {
          const name = getManifestString(plugin.manifest, 'name') || plugin.pluginId;
          const version = getManifestString(plugin.manifest, 'version') || '—';
          const hasDist = Boolean(plugin.distPath);
          const hasManifest = Object.keys(plugin.manifest).length > 0;
          const hasRuntime = getPythonDeclaration(plugin.manifest) !== null;
          const isReinstalling = reinstalling[plugin.pluginId] ?? false;

          return (
            <List.Item
              key={plugin.pluginId}
              actions={[
                <AppButton
                  key="reinstall"
                  loading={isReinstalling}
                  onClick={() => void handleReinstall(plugin.pluginId, plugin.manifest)}
                  aria-label={`Reinstall ${name}`}
                >
                  Reinstall
                </AppButton>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={8}>
                    <Text strong>{name}</Text>
                    <Tag>{version}</Tag>
                    <Tag color={hasDist ? 'success' : 'error'}>dist</Tag>
                    <Tag color={hasManifest ? 'success' : 'error'}>manifest</Tag>
                    <Tag color={hasRuntime ? 'success' : 'default'}>runtime</Tag>
                  </Space>
                }
                description={<Text type="secondary" style={{ fontSize: 12 }}>{plugin.pluginId}</Text>}
              />
            </List.Item>
          );
        }}
      />
      </div>
    </div>
  );
}
