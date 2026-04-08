import React from 'react';
import { Divider, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  PythonOutlined,
} from '@ant-design/icons';
import { AppButton } from '@snapfzz/shared';
import type { DownloadProgress } from './SystemComponentCard';

const { Text } = Typography;

interface PythonSubPack {
  id: string;
  name: string;
  version: string;
  description: string;
  license: string;
  platformDisplay: string;
  downloadUrl: string;
  installPath: string;
  isInstalled: boolean;
  status?: DownloadProgress;
}

interface PythonPackCardProps {
  uv: PythonSubPack;
  python: PythonSubPack;
  agentscope?: PythonSubPack;
  litellm?: PythonSubPack;
  busyDownload: string | null;
  busyUninstall: string | null;
  onDownload: (id: string) => void;
  onCancelDownload: (id: string) => void;
  onUninstall: (id: string) => void;
  onOpenFolder: (path: string) => void;
}

const SUB_PACK_ROW_GAP = 12;
const CARD_PADDING = 16;

function SubPackCard({
  pack,
  index,
  busyDownload,
  busyUninstall,
  onDownload,
  onUninstall,
  onOpenFolder,
}: {
  pack: PythonSubPack;
  index: number;
  busyDownload: string | null;
  busyUninstall: string | null;
  onDownload: (id: string) => void;
  onUninstall: (id: string) => void;
  onOpenFolder: (path: string) => void;
}) {
  const isDownloading = busyDownload === pack.id;
  const isUninstalling = busyUninstall === pack.id;
  const isInstalled = pack.isInstalled;

  return (
    <div
      style={{
        border: '1px solid var(--border-secondary)',
        borderRadius: 6,
        padding: CARD_PADDING,
        background: 'var(--bg-secondary)',
        marginBottom: index > 0 ? SUB_PACK_ROW_GAP : 0,
      }}
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Space direction="vertical" size={4}>
            <Text strong style={{ fontSize: 14 }}>{pack.name}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{pack.description}</Text>
          </Space>
          <Tag color={isInstalled ? 'success' : isDownloading ? 'processing' : 'default'}>
            {isInstalled ? (
              <><CheckCircleOutlined /> Installed</>
            ) : isDownloading ? (
              <><DownloadOutlined /> Downloading</>
            ) : (
              <><CloseCircleOutlined /> Not Installed</>
            )}
          </Tag>
        </div>

        <Space size={16} wrap>
          <Text type="secondary" style={{ fontSize: 12 }}>{pack.platformDisplay}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>License: {pack.license}</Text>
          {pack.version && (
            <Text type="secondary" style={{ fontSize: 12 }}>v{pack.version}</Text>
          )}
        </Space>

        <Space size={16} wrap>
          <AppButton
            size="small"
            icon={<DownloadOutlined />}
            loading={isDownloading}
            disabled={isInstalled || isDownloading}
            onClick={() => onDownload(pack.id)}
          >
            {isDownloading ? 'Downloading...' : 'Download'}
          </AppButton>

          <AppButton
            size="small"
            icon={<FolderOpenOutlined />}
            disabled={!isInstalled}
            onClick={() => onOpenFolder(pack.installPath)}
          >
            Open folder
          </AppButton>

          <AppButton
            size="small"
            danger
            disabled={!isInstalled || isDownloading}
            loading={isUninstalling}
            onClick={() => onUninstall(pack.id)}
          >
            Uninstall
          </AppButton>
        </Space>
      </Space>
    </div>
  );
}

export default function PythonPackCard({
  uv,
  python,
  agentscope,
  litellm,
  busyDownload,
  busyUninstall,
  onDownload,
  onCancelDownload,
  onUninstall,
  onOpenFolder,
}: PythonPackCardProps): React.ReactElement {
  const allInstalled = [uv, python, agentscope, litellm].filter(Boolean).every((p) => p?.isInstalled);
  const anyDownloading = [uv, python, agentscope, litellm].filter(Boolean).some((p) => busyDownload === p?.id);

  const packs: PythonSubPack[] = [uv, python].filter(Boolean);
  if (agentscope) packs.push(agentscope);
  if (litellm) packs.push(litellm);

  return (
    <div
      data-testid="python-pack-card"
      style={{
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: CARD_PADDING + 4,
        background: 'var(--bg-primary)',
      }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Space direction="vertical" size={4}>
            <Space size={8} align="center">
              <PythonOutlined style={{ fontSize: 18, color: '#3776ab' }} />
              <Text strong style={{ fontSize: 16 }}>Python Runtime Ecosystem</Text>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Install Python and dependencies for AI agent development
            </Text>
          </Space>
          <Tag color={allInstalled ? 'success' : anyDownloading ? 'processing' : 'default'}>
            {allInstalled ? (
              <><CheckCircleOutlined /> All Installed</>
            ) : anyDownloading ? (
              <><DownloadOutlined /> Installing...</>
            ) : (
              <><CloseCircleOutlined /> Not Installed</>
            )}
          </Tag>
        </div>

        <Divider style={{ margin: '4px 0 12px 0' }} />

        {/* Sub-packs */}
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Runtime Components
          </Text>
          {packs.map((pack, index) => (
            <SubPackCard
              key={pack.id}
              pack={pack}
              index={index}
              busyDownload={busyDownload}
              busyUninstall={busyUninstall}
              onDownload={onDownload}
              onUninstall={onUninstall}
              onOpenFolder={onOpenFolder}
            />
          ))}
        </Space>
      </Space>
    </div>
  );
}
