import React, { useCallback } from 'react';
import { Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  GithubOutlined,
  GlobalOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { Tooltip } from 'antd';
import { AppButton, createTauriBridge } from '@snapfzz/shared';

const { Text } = Typography;
const bridge = createTauriBridge();

export interface ComponentInfo {
  id: string;
  name: string;
  description: string;
  license: string;
  version: string;
  platform: string;
  platformDisplay: string;
  downloadUrl: string;
  installPath: string;
  size: number;
  checksum: string;
  checksumAlgorithm: string;
  isInstalled: boolean;
  repositoryUrl?: string;
  websiteUrl?: string;
}

export interface DownloadProgress {
  componentId: string;
  bytesDownloaded: number;
  bytesTotal: number;
  percent: number;
  status: string;
}

type DependencyBadgeTone = 'default' | 'ready' | 'required';

export interface DependencyBadge {
  label: string;
  tone?: DependencyBadgeTone;
}

interface SystemComponentCardProps {
  component: ComponentInfo;
  busyDownload: boolean;
  busyUninstall: boolean;
  downloadDisabled?: boolean;
  dependencyBadges?: DependencyBadge[];
  installOrderLabel?: string;
  onDownload: (id: string) => void;
  onUninstall: (id: string) => void;
  onOpenFolder: (path: string) => void;
}

export default function SystemComponentCard({
  component,
  busyDownload,
  busyUninstall,
  downloadDisabled = false,
  dependencyBadges,
  installOrderLabel,
  onDownload,
  onUninstall,
  onOpenFolder,
}: SystemComponentCardProps): React.ReactElement {
  const installed = component.isInstalled;
  const downloading = busyDownload;

  const handleOpenUrl = useCallback((url: string) => {
    void bridge.invoke<void>('open_path', { path: url });
  }, []);

  return (
    <div
      data-testid={`system-component-card-${component.id}`}
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
            <Space size={8} wrap>
              <Text strong>{component.name}</Text>
              {installOrderLabel && <Tag color="blue">{installOrderLabel}</Tag>}
              {dependencyBadges?.map((badge) => {
                const color = badge.tone === 'ready'
                  ? 'success'
                  : badge.tone === 'required'
                    ? 'warning'
                    : undefined;

                return (
                  <Tag key={`${component.id}-${badge.label}`} color={color}>
                    {badge.label}
                  </Tag>
                );
              })}
            </Space>
            {component.description && (
              <Text type="secondary" style={{ fontSize: 13 }}>{component.description}</Text>
            )}
          </Space>
          <Text type="secondary">{component.version || '—'}</Text>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Space size={12} wrap>
            <Text type="secondary">{component.platformDisplay || component.platform || 'Unknown platform'}</Text>
{component.license && (
  <Text type="secondary" style={{ fontSize: 12 }}>License: {component.license}</Text>
)}

{component.repositoryUrl && (
  <Tooltip title="View Repository">
    <button
      type="button"
      onClick={() => handleOpenUrl(component.repositoryUrl!)}
      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-link)', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
    >
      <GithubOutlined style={{ fontSize: 14 }} />
    </button>
  </Tooltip>
)}

{component.websiteUrl && (
  <Tooltip title="Visit Website">
    <button
      type="button"
      onClick={() => handleOpenUrl(component.websiteUrl!)}
      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-link)', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
    >
      <GlobalOutlined style={{ fontSize: 14 }} />
    </button>
  </Tooltip>
)}
          </Space>
          {installed ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>Installed</Tag>
          ) : downloading ? (
            <Tag color="processing" icon={<LoadingOutlined />}>Installing</Tag>
          ) : (
            <Tag icon={<CloseCircleOutlined />}>Not Installed</Tag>
          )}
        </div>

        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
            Source
          </Text>
          <Text copyable style={{ fontSize: 12 }}>
            {component.downloadUrl || 'Unavailable'}
          </Text>
        </div>

        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
            Location
          </Text>
          <Text copyable style={{ fontSize: 12 }}>
            {component.installPath || 'Unavailable'}
          </Text>
        </div>

        <Space size={8} wrap>
          {installed ? (
              <AppButton icon={<FolderOpenOutlined />} onClick={() => onOpenFolder(component.installPath)}>
                Open folder
              </AppButton>
          ) : (
            <AppButton
              loading={busyDownload}
              disabled={downloadDisabled}
              onClick={() => onDownload(component.id)}
            >
              Install
            </AppButton>
          )}

          <AppButton
            variant="danger"
            icon={<DeleteOutlined />}
            disabled={!installed}
            loading={busyUninstall}
            onClick={() => onUninstall(component.id)}
          >
            Uninstall
          </AppButton>
        </Space>
      </Space>
    </div>
  );
}
