import React, { useEffect, useState } from 'react';
import { List, Space, Switch, Tag, Typography } from 'antd';
import { createTauriBridge, SettingsHeader } from '@snapfzz/shared';

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

const bridge = createTauriBridge();

function strikeColor(strikes: number): 'success' | 'warning' | 'error' {
  if (strikes === 0) return 'success';
  if (strikes < 3) return 'warning';
  return 'error';
}

export default function PluginsSettings(): React.ReactElement {
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, []);

  function handleToggle(id: string, enabled: boolean): void {
    setPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled } : p)),
    );
  }

  return (
    <div>
      <SettingsHeader
        title="Plugins"
        subtitle="Manage installed plugins and monitor their reliability status. Disabled plugins are quarantined after repeated failures."
      />
      <div style={{ padding: "24px 32px", background: "var(--bg-subtle)", borderRadius: 8, margin: "0 32px 24px" }}>
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
