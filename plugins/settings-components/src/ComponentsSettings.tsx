import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, List, Space, Typography } from 'antd';
import { createTauriBridge, SettingsHeader } from '@snapfzz/shared';
import SystemComponentCard, { type ComponentInfo, type DownloadProgress } from './SystemComponentCard';

const { Text } = Typography;
const bridge = createTauriBridge();

function normalize(text: string): string {
  return text.trim().toLowerCase();
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
      const ordered = [...list].sort((a, b) => a.name.localeCompare(b.name));
      setComponents(ordered);

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
      setError('Unable to load system components right now.');
      setComponents([]);
      setStatusById({});
    } finally {
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

          <List
            loading={loading}
            dataSource={filteredComponents}
            locale={{ emptyText: 'No system packs match your search.' }}
            split={false}
            pagination={{ pageSize: 8, hideOnSinglePage: true, showSizeChanger: false }}
            renderItem={(component) => (
              <List.Item key={component.id} style={{ padding: 0, border: 'none' }}>
                <SystemComponentCard
                  component={component}
                  status={statusById[component.id]}
                  busyDownload={downloadBusyId === component.id}
                  busyUninstall={uninstallBusyId === component.id}
                  onDownload={handleDownload}
                  onCancelDownload={handleCancelDownload}
                  onUninstall={handleUninstall}
                  onOpenFolder={handleOpenFolder}
                />
              </List.Item>
            )}
          />
        </Space>
      </div>
    </div>
  );
}
