import React from 'react';
import { Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { AppButton } from '@snapfzz/shared';

const { Text } = Typography;

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
}

export interface DownloadProgress {
  componentId: string;
  bytesDownloaded: number;
  bytesTotal: number;
  percent: number;
  status: string;
}

interface SystemComponentCardProps {
  component: ComponentInfo;
  status?: DownloadProgress;
  busyDownload: boolean;
  busyUninstall: boolean;
  onDownload: (id: string) => void;
  onCancelDownload: (id: string) => void;
  onUninstall: (id: string) => void;
  onOpenFolder: (path: string) => void;
}

function resolveStatus(status?: DownloadProgress): 'downloading' | 'ready' | 'pending' {
  const value = String(status?.status ?? '').toLowerCase();
  if (value.includes('ready')) return 'ready';
  if (value.includes('downloading')) return 'downloading';
  return 'pending';
}

export default function SystemComponentCard({
  component,
  status,
  busyDownload,
  busyUninstall,
  onDownload,
  onCancelDownload,
  onUninstall,
  onOpenFolder,
}: SystemComponentCardProps): React.ReactElement {
  const statusKind = resolveStatus(status);
  const installed = component.isInstalled || statusKind === 'ready';
  const downloading = statusKind === 'downloading' || busyDownload;

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
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <Text strong>{component.name}</Text>
          <Text type="secondary">{component.version || '—'}</Text>
        </div>

        {component.description && (
          <Text type="secondary" style={{ fontSize: 13 }}>{component.description}</Text>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <Space size={12}>
            <Text type="secondary">{component.platformDisplay || component.platform || 'Unknown platform'}</Text>
            {component.license && (
              <Text type="secondary" style={{ fontSize: 12 }}>License: {component.license}</Text>
            )}
          </Space>
          {installed ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>Installed</Tag>
          ) : downloading ? (
            <Tag color="processing" icon={<LoadingOutlined />}>Downloading</Tag>
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

        <Space size={8}>
          {installed ? (
            <AppButton icon={<FolderOpenOutlined />} onClick={() => onOpenFolder(component.installPath)}>
              Open folder
            </AppButton>
          ) : (
            <AppButton
              icon={<DownloadOutlined />}
              loading={busyDownload}
              onClick={() => onDownload(component.id)}
            >
              Download
            </AppButton>
          )}

          {downloading && !installed && (
            <AppButton onClick={() => onCancelDownload(component.id)}>
              Cancel download
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
