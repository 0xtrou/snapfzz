import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, List, Skeleton, Space, Typography } from 'antd';
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

function ComponentCardSkeleton(): React.ReactElement {
  return (
    <div
      style={{
        width: '100%',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: 16,
        background: 'var(--bg-primary)',
      }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <Space direction="vertical" size={4} style={{ flex: 1 }}>
            <Skeleton.Input active size="small" style={{ width: 200, height: 22 }} />
            <Skeleton.Input active size="small" style={{ width: 300, height: 16 }} />
          </Space>
          <Skeleton.Input active size="small" style={{ width: 60, height: 22 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <Space size={12}>
            <Skeleton.Input active size="small" style={{ width: 100, height: 16 }} />
            <Skeleton.Input active size="small" style={{ width: 120, height: 16 }} />
          </Space>
          <Skeleton.Button active size="small" style={{ width: 80 }} />
        </div>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Skeleton.Input active size="small" style={{ width: 60, height: 12 }} />
          <Skeleton.Input active size="small" style={{ width: '100%', height: 14 }} />
        </Space>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Skeleton.Input active size="small" style={{ width: 60, height: 12 }} />
          <Skeleton.Input active size="small" style={{ width: '100%', height: 14 }} />
        </Space>
        <Space size={8}>
          <Skeleton.Button active size="small" style={{ width: 100 }} />
          <Skeleton.Button active size="small" style={{ width: 100 }} />
        </Space>
      </Space>
    </div>
  );
}

function LoadingState(): React.ReactElement {
  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <section>
        <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 10 }}>
          <Skeleton.Input active size="small" style={{ width: 150, height: 20 }} />
          <Skeleton.Input active size="small" style={{ width: 300, height: 14 }} />
        </Space>
        <div style={{ border: '1px solid var(--border-default)', borderRadius: 8, padding: 16, background: 'var(--bg-primary)' }}>
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </section>
      <section>
        <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 10 }}>
          <Skeleton.Input active size="small" style={{ width: 130, height: 20 }} />
          <Skeleton.Input active size="small" style={{ width: 280, height: 14 }} />
        </Space>
        <ComponentCardSkeleton />
      </section>
    </Space>
  );
}

interface PythonPackMetadataItem {
  id: string;
  name: string;
  description: string;
  license: string;
  platformDisplay: string;
  repositoryUrl: string;
  websiteUrl: string;
}

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

function mapComponentToSubPack(
  component: ComponentInfo | undefined,
  metadata: PythonPackMetadataItem | undefined,
): Parameters<typeof PythonPackCard>[0]['uv'] {
  if (!metadata) {
    return {
      id: '',
      name: '',
      version: '',
      description: '',
      license: '',
      platformDisplay: '',
      downloadUrl: 'pip',
      installPath: '~/.snapfzz/runtime/python/venv',
      isInstalled: false,
      repositoryUrl: '',
      websiteUrl: '',
    };
  }

  return {
    id: metadata.id,
    name: metadata.name,
    version: component?.version || '',
    description: metadata.description,
    license: metadata.license,
    platformDisplay: metadata.platformDisplay,
    downloadUrl: component?.downloadUrl || 'pip',
    installPath: component?.installPath || '~/.snapfzz/runtime/python/venv',
    isInstalled: component?.isInstalled ?? false,
    repositoryUrl: metadata.repositoryUrl,
    websiteUrl: metadata.websiteUrl,
  };
}

export default function ComponentsSettings(): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [uninstallBusyId, setUninstallBusyId] = useState<string | null>(null);
  const [installingPythonPack, setInstallingPythonPack] = useState(false);
  const [uninstallingPythonPack, setUninstallingPythonPack] = useState(false);
  const [pythonPackMetadata, setPythonPackMetadata] = useState<PythonPackMetadataItem[]>([]);
  const [pythonRuntime, setPythonRuntime] = useState<{
    installed_packages: string[];
    venv_exists: boolean;
    install_steps: Array<{ id: string; label: string; is_installed: boolean }>;
    agentscope: { name: string; version: string; is_installed: boolean };
    agentscope_runtime: { name: string; version: string; is_installed: boolean };
    litellm: { name: string; version: string; is_installed: boolean };
  } | null>(null);

  const refreshComponents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, metadata] = await Promise.all([
        bridge.invoke<ComponentInfo[]>('component_list'),
        bridge.invoke<PythonPackMetadataItem[]>('python_pack_metadata'),
      ]);
      setComponents(list);
      setPythonPackMetadata(metadata);
      setLoading(false);

      try {
        const pythonStatus = await bridge.invoke<typeof pythonRuntime>('python_runtime_status');
        setPythonRuntime(pythonStatus);
      } catch (e) {
        console.error('Failed to fetch python_runtime_status:', e);
        setPythonRuntime(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load system packs right now.');
      setComponents([]);
      setLoading(false);
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
      await bridge.invoke<void>('component_download', { id });
      await refreshComponents();
    } catch {
      void 0;
    } finally {
      setDownloadBusyId(null);
    }
  }, [refreshComponents]);

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
      const uv = components.find((c) => c.id === 'uv');
      const python = components.find((c) => c.id === 'python');

      if (uv && !uv.isInstalled) {
        await bridge.invoke<void>('component_download', { id: 'uv' });
      }
      if (python && !python.isInstalled) {
        await bridge.invoke<void>('component_download', { id: 'python' });
      }

      await bridge.invoke<string>('python_pack_install_all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install Python packages');
    } finally {
      setInstallingPythonPack(false);
      await refreshComponents();
    }
  }, [components, refreshComponents]);

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
      
      const agentscopeMeta = pythonPackMetadata.find((m) => m.id === 'agentscope');
      const agentscopeRuntimeMeta = pythonPackMetadata.find((m) => m.id === 'agentscope-runtime');
      const litellmMeta = pythonPackMetadata.find((m) => m.id === 'litellm');

      const agentscope: ComponentInfo | undefined = agentscopeMeta ? {
        id: 'agentscope',
        name: agentscopeMeta.name,
        description: agentscopeMeta.description,
        version: pythonRuntime?.agentscope.version ?? '',
        platform: 'any',
        platformDisplay: agentscopeMeta.platformDisplay,
        downloadUrl: 'pip',
        installPath: '~/.snapfzz/runtime/python/venv',
        size: 0,
        checksum: '',
        checksumAlgorithm: '',
        isInstalled: pythonRuntime?.agentscope.is_installed ?? false,
        license: agentscopeMeta.license,
        repositoryUrl: agentscopeMeta.repositoryUrl,
        websiteUrl: agentscopeMeta.websiteUrl,
      } : undefined;

      const agentscopeRuntime: ComponentInfo | undefined = agentscopeRuntimeMeta ? {
        id: 'agentscope-runtime',
        name: agentscopeRuntimeMeta.name,
        description: agentscopeRuntimeMeta.description,
        version: pythonRuntime?.agentscope_runtime.version ?? '',
        platform: 'any',
        platformDisplay: agentscopeRuntimeMeta.platformDisplay,
        downloadUrl: 'pip',
        installPath: '~/.snapfzz/runtime/python/venv',
        size: 0,
        checksum: '',
        checksumAlgorithm: '',
        isInstalled: pythonRuntime?.agentscope_runtime.is_installed ?? false,
        license: agentscopeRuntimeMeta.license,
        repositoryUrl: agentscopeRuntimeMeta.repositoryUrl,
        websiteUrl: agentscopeRuntimeMeta.websiteUrl,
      } : undefined;

      const litellm: ComponentInfo | undefined = litellmMeta ? {
        id: 'litellm',
        name: litellmMeta.name,
        description: litellmMeta.description,
        version: pythonRuntime?.litellm.version ?? '',
        platform: 'any',
        platformDisplay: litellmMeta.platformDisplay,
        downloadUrl: 'pip',
        installPath: '~/.snapfzz/runtime/python/venv',
        size: 0,
        checksum: '',
        checksumAlgorithm: '',
        isInstalled: pythonRuntime?.litellm.is_installed ?? false,
        license: litellmMeta.license,
        repositoryUrl: litellmMeta.repositoryUrl,
        websiteUrl: litellmMeta.websiteUrl,
      } : undefined;

      const allPacks = [uv, python, agentscope, agentscopeRuntime, litellm].filter(Boolean) as ComponentInfo[];
      const allInstalled = allPacks.every((p) => p.isInstalled);
      const anyInstalled = allPacks.some((p) => p.isInstalled);

      const uvMeta = pythonPackMetadata.find((m) => m.id === 'uv');
      const pythonMeta = pythonPackMetadata.find((m) => m.id === 'python');

      return (
        <PythonPackCard
          uv={mapComponentToSubPack(uv, uvMeta)}
          python={mapComponentToSubPack(python, pythonMeta)}
          agentscope={mapComponentToSubPack(agentscope, agentscopeMeta)}
          agentscopeRuntime={mapComponentToSubPack(agentscopeRuntime, agentscopeRuntimeMeta)}
          litellm={mapComponentToSubPack(litellm, litellmMeta)}
          isInstalling={installingPythonPack}
          isUninstalling={uninstallingPythonPack}
          allInstalled={allInstalled}
          anyInstalled={anyInstalled}
          installSteps={pythonRuntime?.install_steps ?? []}
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
              busyDownload={downloadBusyId === component.id}
              busyUninstall={uninstallBusyId === component.id}
              onDownload={handleDownload}
              onUninstall={handleUninstall}
              onOpenFolder={handleOpenFolder}
            />
          </List.Item>
        )}
      />
    );
  }, [
    downloadBusyId,
    handleDownload,
    handleInstallPythonPack,
    handleOpenFolder,
    handleUninstall,
    handleUninstallPythonPack,
    installingPythonPack,
    loading,
    pythonPackMetadata,
    pythonRuntime,
    uninstallBusyId,
    uninstallingPythonPack,
  ]);

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <SettingsHeader
        title="System Packs"
        subtitle="Install and manage runtime dependencies for AI agent development, including Python environments and the CEF browser engine."
      />
      <div style={{ padding: '16px 32px', maxWidth: 800 }}>
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

          {loading ? (
            <LoadingState />
          ) : groupedComponents.length === 0 ? (
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
