import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, List, Space, Typography } from 'antd';
import { createTauriBridge, SettingsHeader } from '@snapfzz/shared';
import SystemComponentCard, {
  type ComponentInfo,
  type DependencyBadge,
  type DownloadProgress,
} from './SystemComponentCard';

const { Text } = Typography;
const bridge = createTauriBridge();

const COMPONENT_ORDER: string[] = ['python-runtime', 'cef'];
const ROW_GAP_PX = 16;

type ComponentGroup = {
  key: string;
  title: string;
  description: string;
  items: ComponentInfo[];
};

const ROW_MARGIN_STYLE = { marginBottom: ROW_GAP_PX };

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function indexByOrder(id: string, order: string[]): number {
  const index = order.indexOf(id);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function dependencyBadgesFor(componentId: string): DependencyBadge[] | undefined {
  if (componentId === 'python-runtime') {
    return [
      { label: 'Includes uv', tone: 'ready' },
      { label: 'Python 3.12', tone: 'ready' },
      { label: 'AgentScope', tone: 'ready' },
      { label: 'LiteLLM', tone: 'ready' },
    ];
  }
  return undefined;
}

export default function ComponentsSettings(): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [statusById, setStatusById] = useState<Record<string, DownloadProgress>>({});
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [uninstallBusyId, setUninstallBusyId] = useState<string | null>(null);

  const refreshComponents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await bridge.invoke<ComponentInfo[]>('component_list');
      setComponents(list);
      setLoading(false);

      const ordered = [...list].sort((a, b) => a.name.localeCompare(b.name));

      const statuses = await Promise.all(
        ordered.map(async (component) => {
          try {
            const status = await bridge.invoke<DownloadProgress>('component_status', { id: component.id });
            return [component.id, status] as const;
          } catch {
            return [component.id, {
              componentId: component.id,
              bytesDownloaded: 0,
              bytesTotal: 0,
              percent: 0,
              status: component.isInstalled ? 'ready' : 'pending',
            }] as const;
          }
        }),
      );

      setStatusById(Object.fromEntries(statuses));
    } catch {
      setError('Unable to load system packs right now.');
      setComponents([]);
      setStatusById({});
      setLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async (id: string) => {
    try {
      const status = await bridge.invoke<DownloadProgress>('component_status', { id });
      setStatusById((prev) => ({ ...prev, [id]: status }));
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    void refreshComponents();
  }, [refreshComponents]);

  const filteredComponents = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return components;
    return components.filter((component) => {
      const haystack = `${component.name} ${component.id}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [components, query]);

  const groupedComponents = useMemo<ComponentGroup[]>(() => {
    const sorted = [...filteredComponents].sort((a, b) =>
      indexByOrder(a.id, COMPONENT_ORDER) - indexByOrder(b.id, COMPONENT_ORDER)
    );

    return [
      {
        key: 'all',
        title: 'System Packs',
        description: 'Install runtime components for your AI agent environment.',
        items: sorted,
      },
    ];
  }, [filteredComponents]);

  const handleDownload = useCallback(async (id: string) => {
    setDownloadBusyId(id);
    try {
      await bridge.invoke<DownloadProgress[]>('component_download', { id });
      await refreshComponents();
    } catch {
      await refreshStatus(id);
    } finally {
      setDownloadBusyId(null);
    }
  }, [refreshComponents, refreshStatus]);

  const handleCancelDownload = useCallback(async (id: string) => {
    try {
      await bridge.invoke<void>('component_download_cancel', { id });
      await refreshStatus(id);
    } catch {
      void 0;
    }
  }, [refreshStatus]);

  const handleUninstall = useCallback(async (id: string) => {
    setUninstallBusyId(id);
    try {
      await bridge.invoke<void>('component_uninstall', { id });
      await refreshComponents();
    } catch {
      setError('Unable to uninstall component.');
    } finally {
      setUninstallBusyId(null);
    }
  }, [refreshComponents]);

  const handleOpenFolder = useCallback((path: string) => {
    void bridge.invoke<void>('open_path', { path });
  }, []);

  const renderComponentList = useCallback((items: ComponentInfo[]) => (
    <List
      loading={loading}
      dataSource={items}
      split={false}
      locale={{ emptyText: 'No packs available.' }}
      style={{ display: 'flex', flexDirection: 'column', rowGap: ROW_GAP_PX }}
      renderItem={(component) => (
        <List.Item key={component.id} style={ROW_MARGIN_STYLE}>
          <SystemComponentCard
            component={component}
            status={statusById[component.id]}
            busyDownload={downloadBusyId === component.id}
            busyUninstall={uninstallBusyId === component.id}
            dependencyBadges={dependencyBadgesFor(component.id)}
            onDownload={handleDownload}
            onCancelDownload={handleCancelDownload}
            onUninstall={handleUninstall}
            onOpenFolder={handleOpenFolder}
          />
        </List.Item>
      )}
    />
  ), [
    downloadBusyId,
    handleCancelDownload,
    handleDownload,
    handleOpenFolder,
    handleUninstall,
    loading,
    statusById,
    uninstallBusyId,
  ]);

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <SettingsHeader title="System Packs" />
      <div style={{ padding: '16px 32px', maxWidth: 920 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Input.Search
            allowClear
            value={query}
            placeholder="Search packs..."
            onChange={(event) => setQuery(event.target.value)}
          />

          {error && (
            <Text type="danger" style={{ fontSize: 12 }}>
              {error}
            </Text>
          )}

          {groupedComponents.length === 0 && !loading ? (
            <Text type="secondary">No system packs match your search.</Text>
          ) : (
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              {groupedComponents.map((group) => (
                <section key={group.key}>
                  <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 10 }}>
                    <Text strong>{group.title}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{group.description}</Text>
                  </Space>
                  {renderComponentList(group.items)}
                </section>
              ))}
            </Space>
          )}
        </Space>
      </div>
    </div>
  );
}
