import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Divider, Input, List, Space, Tag, Typography } from 'antd';
import { createTauriBridge, SettingsHeader } from '@snapfzz/shared';
import SystemComponentCard, {
  type ComponentInfo,
  type DependencyBadge,
  type DownloadProgress,
} from './SystemComponentCard';

const { Text } = Typography;
const bridge = createTauriBridge();

const PYTHON_COMPONENT_ORDER: string[] = ['uv', 'python', 'agentscope', 'litellm'];
const PYTHON_FOUNDATION_COMPONENT_IDS: string[] = ['uv', 'python'];
const PYTHON_INTEGRATION_COMPONENT_IDS: string[] = ['agentscope', 'litellm'];
const STANDALONE_COMPONENT_ORDER: string[] = ['cef'];

const ROW_GAP_PX = 14;

type ComponentSubgroup = {
  key: 'foundation' | 'integrations';
  title: string;
  description: string;
  items: ComponentInfo[];
};

type ComponentGroup = {
  key: 'standalone' | 'python';
  title: string;
  description: string;
  items: ComponentInfo[];
  subgroups?: ComponentSubgroup[];
};

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function indexByOrder(id: string, order: string[]): number {
  const index = order.indexOf(id);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function isPythonEcosystemComponent(id: string): boolean {
  return PYTHON_COMPONENT_ORDER.includes(id);
}

function isStandaloneComponent(id: string): boolean {
  return STANDALONE_COMPONENT_ORDER.includes(id);
}

function installOrderLabel(id: string): string | undefined {
  if (id === 'python') return '1st';
  if (id === 'agentscope') return '2nd';
  if (id === 'litellm') return '3rd';
  return undefined;
}

function dependencyBadgesFor(componentId: string): DependencyBadge[] | undefined {
  if (componentId === 'uv') {
    return [
      { label: 'Base tool', tone: 'ready' },
      { label: 'Required by Python', tone: 'required' },
    ];
  }

  if (componentId === 'python') {
    return [
      { label: 'Requires uv', tone: 'required' },
      { label: 'Runtime base', tone: 'ready' },
    ];
  }

  if (componentId === 'agentscope') {
    return [
      { label: 'Requires Python', tone: 'required' },
      { label: 'Python Ecosystem', tone: 'ready' },
    ];
  }

  if (componentId === 'litellm') {
    return [
      { label: 'Requires Python', tone: 'required' },
      { label: 'Python Ecosystem', tone: 'ready' },
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

  const pythonInstalled = useMemo(
    () => Boolean(components.find((component) => component.id === 'python')?.isInstalled),
    [components],
  );

  const groupedComponents = useMemo<ComponentGroup[]>(() => {
    const standalone = filteredComponents
      .filter((component) => isStandaloneComponent(component.id))
      .sort((a, b) => indexByOrder(a.id, STANDALONE_COMPONENT_ORDER) - indexByOrder(b.id, STANDALONE_COMPONENT_ORDER));

    const python = filteredComponents
      .filter((component) => isPythonEcosystemComponent(component.id))
      .sort((a, b) => indexByOrder(a.id, PYTHON_COMPONENT_ORDER) - indexByOrder(b.id, PYTHON_COMPONENT_ORDER));

    const pythonFoundation = python.filter((component) => PYTHON_FOUNDATION_COMPONENT_IDS.includes(component.id));
    const pythonIntegrations = python.filter((component) => PYTHON_INTEGRATION_COMPONENT_IDS.includes(component.id));

    const uncategorized = filteredComponents
      .filter((component) => !isStandaloneComponent(component.id) && !isPythonEcosystemComponent(component.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    const groups: ComponentGroup[] = [];

    if (standalone.length > 0 || uncategorized.length > 0) {
      groups.push({
        key: 'standalone',
        title: 'Standalone',
        description: 'Independent packs that do not depend on the Python runtime.',
        items: [...standalone, ...uncategorized],
      });
    }

    if (python.length > 0) {
      const subgroups: ComponentSubgroup[] = [];

      if (pythonFoundation.length > 0) {
        subgroups.push({
          key: 'foundation',
          title: 'Foundation Runtime',
          description: 'Install uv and Python first. They provide the runtime base for Python tools.',
          items: pythonFoundation,
        });
      }

      if (pythonIntegrations.length > 0) {
        subgroups.push({
          key: 'integrations',
          title: 'Agent Integrations',
          description: 'AgentScope and LiteLLM run on top of the installed Python runtime.',
          items: pythonIntegrations,
        });
      }

      groups.push({
        key: 'python',
        title: 'Python Ecosystem',
        description: 'Install order: Python → AgentScope → LiteLLM. uv is a required foundation dependency for Python.',
        items: python,
        subgroups,
      });
    }

    return groups;
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
      locale={{ emptyText: 'No packs in this section.' }}
      style={{ display: 'flex', flexDirection: 'column', rowGap: ROW_GAP_PX }}
      renderItem={(component) => {
        const requiresPython = component.id === 'agentscope' || component.id === 'litellm';
        const downloadDisabled = requiresPython && !pythonInstalled && !component.isInstalled;

        return (
          <List.Item key={component.id} style={{ padding: 0, border: 'none', margin: 0 }}>
            <SystemComponentCard
              component={component}
              status={statusById[component.id]}
              busyDownload={downloadBusyId === component.id}
              busyUninstall={uninstallBusyId === component.id}
              downloadDisabled={downloadDisabled}
              dependencyBadges={dependencyBadgesFor(component.id)}
              installOrderLabel={installOrderLabel(component.id)}
              onDownload={handleDownload}
              onCancelDownload={handleCancelDownload}
              onUninstall={handleUninstall}
              onOpenFolder={handleOpenFolder}
            />
          </List.Item>
        );
      }}
    />
  ), [
    downloadBusyId,
    handleCancelDownload,
    handleDownload,
    handleOpenFolder,
    handleUninstall,
    loading,
    pythonInstalled,
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
                    {group.key === 'python' ? (
                      <Space size={8} wrap>
                        <Tag color="blue">1. Python</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>→</Text>
                        <Tag color="geekblue">2. AgentScope</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>→</Text>
                        <Tag color="purple">3. LiteLLM</Tag>
                      </Space>
                    ) : null}
                  </Space>

                  {group.key === 'python' && group.subgroups && group.subgroups.length > 0 ? (
                    <Space direction="vertical" size={18} style={{ width: '100%' }}>
                      {group.subgroups.map((subgroup) => (
                        <div key={subgroup.key}>
                          <Space direction="vertical" size={2} style={{ width: '100%', marginBottom: 8 }}>
                            <Text type="secondary" style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                              {subgroup.title}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>{subgroup.description}</Text>
                          </Space>
                          {renderComponentList(subgroup.items)}
                        </div>
                      ))}
                    </Space>
                  ) : renderComponentList(group.items)}

                  {group.key === 'standalone' ? <Divider style={{ margin: '12px 0 0 0' }} /> : null}
                </section>
              ))}
            </Space>
          )}
        </Space>
      </div>
    </div>
  );
}
