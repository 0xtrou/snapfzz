import React, { useEffect, useState } from 'react';
import { List, Space, Switch, Tag, Typography } from 'antd';
import { createTauriBridge, SettingsHeader, AppButton, ConfirmAction, fetchWithToast } from '@snapfzz/shared';

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

/** Unified row — can be either a budget-tracked plugin or a system-installed plugin. */
interface UnifiedPlugin {
  id: string;
  name: string;
  version: string;
  type: 'system' | 'user';
  enabled: boolean;
  strikes: number;
  manifest?: Record<string, unknown>;
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
  const [budgetPlugins, setBudgetPlugins] = useState<PluginEntry[]>([]);
  const [systemPlugins, setSystemPlugins] = useState<InstalledPluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let pending = 2;
    const done = () => { pending--; if (pending <= 0) setLoading(false); };

    bridge.invoke<BudgetSnapshot>('budget_snapshot')
      .then((snapshot) => {
        setBudgetPlugins((snapshot.plugins ?? []).map((p) => ({
          id: p.id,
          name: p.name ?? p.id,
          version: p.version ?? '—',
          zone: p.zone ?? 'zone3',
          strikes: p.strikes ?? 0,
          enabled: p.enabled ?? true,
        })));
      })
      .catch(() => setBudgetPlugins([]))
      .finally(done);

    bridge.invoke<InstalledPluginInfo[]>('list_installed_plugins')
      .then((list) => setSystemPlugins(Array.isArray(list) ? list : []))
      .catch(() => setSystemPlugins([]))
      .finally(done);
  }, []);

  // Merge into unified list — system plugins first, then budget-only plugins
  const unified: UnifiedPlugin[] = [];
  const seenIds = new Set<string>();

  for (const sp of systemPlugins) {
    const name = getManifestString(sp.manifest, 'name') || sp.pluginId;
    const version = getManifestString(sp.manifest, 'version') || '—';
    const budget = budgetPlugins.find((bp) => bp.id === sp.pluginId);
    seenIds.add(sp.pluginId);
    unified.push({
      id: sp.pluginId,
      name,
      version,
      type: 'system',
      enabled: budget?.enabled ?? true,
      strikes: budget?.strikes ?? 0,
      manifest: sp.manifest,
    });
  }

  for (const bp of budgetPlugins) {
    if (seenIds.has(bp.id)) continue;
    unified.push({
      id: bp.id,
      name: bp.name,
      version: bp.version,
      type: 'user',
      enabled: bp.enabled,
      strikes: bp.strikes,
    });
  }

  function handleToggle(id: string, enabled: boolean): void {
    setBudgetPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled } : p)),
    );
  }

  async function handleReload(pluginId: string, manifest: Record<string, unknown>): Promise<void> {
    setReloading((prev) => ({ ...prev, [pluginId]: true }));
    try {
      await fetchWithToast(
        async () => {
          await bridge.invoke<void>('install_system_plugin', { pluginId, force: true });
          const declaration = getPythonDeclaration(manifest);
          if (declaration !== null) {
            await bridge.invoke<void>('install_plugin_runtime', { declaration });
          }
        },
        {
          successMessage: `${pluginId} reloaded`,
          errorMessage: `Failed to reload ${pluginId}`,
        },
      );
    } finally {
      setReloading((prev) => ({ ...prev, [pluginId]: false }));
    }
  }

  return (
    <div>
      <SettingsHeader
        title="Plugins"
        subtitle="Manage installed plugins and monitor their reliability status."
      />
      <div style={{ padding: '16px 32px', background: 'var(--bg-default)', border: '1px solid var(--border-default)', borderRadius: 8, margin: '16px 16px 24px' }}>
      <List<UnifiedPlugin>
        loading={loading}
        dataSource={unified}
        locale={{ emptyText: 'No plugins installed.' }}
        size="small"
        renderItem={(plugin) => {
          const isSystem = plugin.type === 'system';
          const isReloading = reloading[plugin.id] ?? false;

          return (
            <List.Item
              key={plugin.id}
              actions={isSystem && plugin.manifest ? [
                <ConfirmAction
                  key="reload"
                  title="Reload plugin?"
                  description="This will reinstall the plugin and restart its background service."
                  okText="Reload"
                  onConfirm={() => handleReload(plugin.id, plugin.manifest!)}
                  disabled={isReloading}
                >
                  <AppButton
                    size="small"
                    loading={isReloading}
                    aria-label={`Reload ${plugin.name}`}
                  >
                    Reload
                  </AppButton>
                </ConfirmAction>,
              ] : [
                <Switch
                  key="toggle"
                  size="small"
                  checked={plugin.enabled}
                  onChange={(checked) => handleToggle(plugin.id, checked)}
                  aria-label={`Toggle ${plugin.name}`}
                />,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={4}>
                    <Text strong style={{ fontSize: 13 }}>{plugin.name}</Text>
                    <Tag style={{ fontSize: 11 }}>{plugin.version}</Tag>
                    <Tag color={isSystem ? 'blue' : 'default'} style={{ fontSize: 11 }}>{isSystem ? 'system' : 'user'}</Tag>
                    {plugin.strikes > 0 && (
                      <Tag color={strikeColor(plugin.strikes)} style={{ fontSize: 11 }}>
                        {plugin.strikes} strike{plugin.strikes !== 1 ? 's' : ''}
                      </Tag>
                    )}
                  </Space>
                }
                description={<Text type="secondary" style={{ fontSize: 11 }}>{plugin.id}</Text>}
              />
            </List.Item>
          );
        }}
      />
      </div>
    </div>
  );
}
