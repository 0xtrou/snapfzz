import React, { useEffect, useState } from 'react';
import { List, Space, Switch, Tag, Typography } from 'antd';
import { SettingsHeader } from '@snapfzz/shared';

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

function tauriInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const w = window as unknown as Record<string, unknown>;
  const tauri = w.__TAURI_INTERNALS__ as
    | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
    | undefined;
  if (!tauri) return Promise.reject('Tauri not available');
  return tauri.invoke(cmd, args);
}

function strikeColor(strikes: number): 'success' | 'warning' | 'error' {
  if (strikes === 0) return 'success';
  if (strikes < 3) return 'warning';
  return 'error';
}

export default function PluginsSettings(): React.ReactElement {
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tauriInvoke('budget_snapshot')
      .then((raw) => {
        const snapshot = raw as BudgetSnapshot;
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
  }, []);

  function handleToggle(id: string, enabled: boolean): void {
    setPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled } : p)),
    );
    tauriInvoke('set_plugin_enabled', { id, enabled }).catch(() => {
      setPlugins((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled: !enabled } : p)),
      );
    });
  }

  return (
    <div>
      <SettingsHeader title="Plugins" />
      <div style={{ padding: 16, maxWidth: 640 }}>
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
    </div>
  );
}
