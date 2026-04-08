import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, List, Space, Typography } from 'antd';
import { createTauriBridge, SettingsHeader } from '@snapfzz/shared';
import SystemComponentCard, {
  type ComponentInfo,
  type DownloadProgress,
} from './SystemComponentCard';
import PythonPackCard from './PythonPackCard';

const { Text } = Typography;
const bridge = createTauriBridge();

const COMPONENT_ORDER: string[] = ['python-runtime', 'cef'];
const ROW_GAP_PX = 16;

type ComponentGroup = {
  key: string;
  title: string;
  description: string;
  items: ComponentInfo[];
  isPythonGroup?: boolean;
};

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function indexByOrder(id: string, order: string[]): number {
  const index = order.indexOf(id);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function createPlaceholder(id: string, name: string, description: string): ComponentInfo {
  return {
    id,
    name,
    description,
    version: 'latest',
    platform: 'any',
    platformDisplay: 'Cross-platform',
    downloadUrl: 'pip',
    installPath: `~/.snapfzz/runtime/packages/${id}`,
    size: 0,
    checksum: '',
    checksumAlgorithm: '',
    isInstalled: false,
    license: 'MIT',
  };
}

function isPipPackageInstalled(packageName: string, installedPackages: string[]): boolean {
  const normalizedPackage = packageName.toLowerCase().replace('[ext]', '');
  return installedPackages.some(pkg => {
    const name = pkg.split('=')[0].split('[')[0].toLowerCase();
    return name === normalizedPackage || name.startsWith(normalizedPackage + '-');
  });
}

function checkAgentscopeInstalled(installedPackages: string[]): boolean {
  // Check for agentscope OR agentscope-runtime (covers both base and [ext])
  return installedPackages.some(pkg => {
    const name = pkg.split('=')[0].split('[')[0].toLowerCase();
    return name === 'agentscope' || name === 'agentscope-runtime' || name.startsWith('agentscope');
  });
}

function mapComponentToSubPack(component: ComponentInfo | undefined, subPackId: string): Parameters<typeof PythonPackCard>[0]['uv'] {
  const fallback = {
    id: subPackId,
    version: subPackId === 'python' ? '3.12' : 'latest',
    license: subPackId === 'python' ? 'PSF-2.0' : 'MIT',
    platformDisplay: 'Unknown',
    downloadUrl: 'Unavailable',
    installPath: `~/.snapfzz/runtime/${subPackId}`,
    isInstalled: false,
  };

  if (!component) {
    return {
      ...fallback,
      name: subPackId === 'uv' ? 'uv (Python Package Manager)' :
            subPackId === 'python' ? 'Python 3.12' :
            subPackId === 'agentscope' ? 'AgentScope' : 'LiteLLM',
      description: subPackId === 'uv' ? 'Fast Python package manager.' :
                   subPackId === 'python' ? 'Python runtime managed by uv.' :
                   subPackId === 'agentscope' ? 'AI agent framework.' :
                   'LLM proxy and model router.',
    };
  }

  return {
    id: subPackId,
    name: subPackId === 'uv' ? 'uv (Python Package Manager)' :
          subPackId === 'python' ? 'Python 3.12' :
          subPackId === 'agentscope' ? 'AgentScope' : 'LiteLLM',
    version: component.version || fallback.version,
    description: subPackId === 'uv' ? 'Fast Python package manager. Required for all Python runtimes.' :
                 subPackId === 'python' ? 'Python runtime managed by uv. Required for AgentScope and Python-based packs.' :
                 subPackId === 'agentscope' ? 'AI agent framework. Requires Python runtime.' :
                 'LLM proxy and model router. Requires Python runtime.',
    license: component.license || fallback.license,
    platformDisplay: component.platformDisplay || fallback.platformDisplay,
    downloadUrl: component.downloadUrl || fallback.downloadUrl,
    installPath: component.installPath || fallback.installPath,
    isInstalled: component.isInstalled,
  };
}

export default function ComponentsSettings(): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [statusById, setStatusById] = useState<Record<string, DownloadProgress>>({});
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [uninstallBusyId, setUninstallBusyId] = useState<string | null>(null);
  const [installingPythonPack, setInstallingPythonPack] = useState(false);
  const [uninstallingPythonPack, setUninstallingPythonPack] = useState(false);
  const [pythonRuntime, setPythonRuntime] = useState<{ installed_packages: string[] } | null>(null);

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
      
      // Fetch installed pip packages to detect AgentScope/LiteLLM
      try {
        const pythonStatus = await bridge.invoke<{ installed_packages: string[] }>('python_runtime_status').catch(() => null);
        setPythonRuntime(pythonStatus);
      } catch {
        setPythonRuntime(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load system packs right now.');
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
    const pythonComponents = filteredComponents.filter((c) =>
      c.id === 'uv' || c.id === 'python' || c.id === 'agentscope' || c.id === 'litellm'
    ).sort((a, b) => {
      const order = ['uv', 'python', 'agentscope', 'litellm'];
      return order.indexOf(a.id) - order.indexOf(b.id);
    });

    const otherComponents = filteredComponents.filter((c) =>
      !['uv', 'python', 'agentscope', 'litellm'].includes(c.id)
    ).sort((a, b) =>
      indexByOrder(a.id, COMPONENT_ORDER) - indexByOrder(b.id, COMPONENT_ORDER)
    );

    const groups: ComponentGroup[] = [];

    if (pythonComponents.length > 0) {
      groups.push({
        key: 'python-ecosystem',
        title: 'Python Runtime',
        description: 'Python runtime and dependencies for AI agent development.',
        items: pythonComponents,
        isPythonGroup: true,
      });
    }

    if (otherComponents.length > 0) {
      groups.push({
        key: 'standalone',
        title: 'Standalone Packs',
        description: 'Independent runtime components.',
        items: otherComponents,
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

  const handleInstallPythonPack = useCallback(async () => {
    setInstallingPythonPack(true);
    try {
      await bridge.invoke<DownloadProgress[]>('component_download', { id: 'uv' }).catch(() => {});
      await bridge.invoke<DownloadProgress[]>('component_download', { id: 'python' }).catch(() => {});
      
      try {
        await bridge.invoke<void>('python_pip_install_packages', { 
          packages: ['agentscope', 'agentscope-runtime', 'agentscope-runtime[ext]', 'litellm'] 
        });
      } catch {
      }
      
      await refreshComponents();
    } finally {
      setInstallingPythonPack(false);
    }
  }, [refreshComponents]);

  const handleUninstallPythonPack = useCallback(async () => {
    setUninstallingPythonPack(true);
    try {
      const packIds = ['python', 'uv'];
      for (const packId of packIds) {
        await bridge.invoke<void>('component_uninstall', { id: packId }).catch(() => {});
      }
      await refreshComponents();
    } finally {
      setUninstallingPythonPack(false);
    }
  }, [refreshComponents]);

  const renderComponentList = useCallback((items: ComponentInfo[], isPythonGroup?: boolean) => {
    if (isPythonGroup) {
      const uv = items.find((c) => c.id === 'uv');
      const python = items.find((c) => c.id === 'python');
      const agentscope = createPlaceholder('agentscope', 'AgentScope', 'AI agent framework');
      const litellm = createPlaceholder('litellm', 'LiteLLM', 'LLM proxy');

      // Check if pip packages are installed via python_runtime_status
      const installedPipPackages = pythonRuntime?.installed_packages || [];
      
      // Mark pip packages as installed based on pip list
      agentscope.isInstalled = checkAgentscopeInstalled(installedPipPackages);
      litellm.isInstalled = isPipPackageInstalled('litellm', installedPipPackages);

      const allPacks = [uv, python, agentscope, litellm].filter(Boolean) as ComponentInfo[];
      const allInstalled = allPacks.every((p) => p.isInstalled);
      const anyInstalled = allPacks.some((p) => p.isInstalled);

      return (
        <PythonPackCard
          uv={mapComponentToSubPack(uv, 'uv')}
          python={mapComponentToSubPack(python, 'python')}
          agentscope={mapComponentToSubPack(agentscope, 'agentscope')}
          litellm={mapComponentToSubPack(litellm, 'litellm')}
          isInstalling={installingPythonPack}
          isUninstalling={uninstallingPythonPack}
          allInstalled={allInstalled}
          anyInstalled={anyInstalled}
          onInstallAll={handleInstallPythonPack}
          onUninstallAll={handleUninstallPythonPack}
          onOpenFolder={handleOpenFolder}
        />
      );
    }

    return (
      <List
        loading={loading}
        dataSource={items}
        split={false}
        locale={{ emptyText: 'No packs available.' }}
        style={{ display: 'flex', flexDirection: 'column', rowGap: ROW_GAP_PX }}
        renderItem={(component) => (
          <List.Item key={component.id} style={{ marginBottom: ROW_GAP_PX }}>
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
    );
  }, [
    downloadBusyId,
    handleCancelDownload,
    handleDownload,
    handleInstallPythonPack,
    handleOpenFolder,
    handleUninstall,
    handleUninstallPythonPack,
    installingPythonPack,
    loading,
    pythonRuntime,
    statusById,
    uninstallBusyId,
    uninstallingPythonPack,
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
                  {renderComponentList(group.items, group.isPythonGroup)}
                </section>
              ))}
            </Space>
          )}
        </Space>
      </div>
    </div>
  );
}
