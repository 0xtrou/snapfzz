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
  isInstalling: boolean;
  isUninstalling: boolean;
  allInstalled: boolean;
  anyInstalled: boolean;
  onInstallAll: () => void;
  onUninstallAll: () => void;
  onOpenFolder: (path: string) => void;
}

const SUB_PACK_ROW_GAP = 12;
const CARD_PADDING = 16;

function SubPackCard({
  pack,
  index,
}: {
  pack: PythonSubPack;
  index: number;
}) {
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space direction="vertical" size={4}>
            <Text strong style={{ fontSize: 14 }}>{pack.name}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{pack.description}</Text>
          </Space>
          <Tag color={isInstalled ? 'success' : 'default'}>
            {isInstalled ? (
              <><CheckCircleOutlined /> Installed</>
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
          {pack.isInstalled && (
            <Text type="secondary" style={{ fontSize: 12 }}>{pack.installPath}</Text>
          )}
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
  isInstalling,
  isUninstalling,
  allInstalled,
  anyInstalled,
  onInstallAll,
  onUninstallAll,
  onOpenFolder,
}: PythonPackCardProps): React.ReactElement {
  const packs: PythonSubPack[] = [uv, python].filter(Boolean);
  if (agentscope) packs.push(agentscope);
  if (litellm) packs.push(litellm);

  const installPath = python.installPath.replace('/bin/python', '') || '~/.snapfzz/runtime';

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
          <Space size={8}>
            <Tag color={allInstalled ? 'success' : isInstalling ? 'processing' : anyInstalled ? 'warning' : 'default'}>
              {allInstalled ? (
                <><CheckCircleOutlined /> All Installed</>
              ) : isInstalling ? (
                <><DownloadOutlined /> Installing...</>
              ) : anyInstalled ? (
                <><CheckCircleOutlined /> Partially Installed</>
              ) : (
                <><CloseCircleOutlined /> Not Installed</>
              )}
            </Tag>
          </Space>
        </div>

        <Divider style={{ margin: '4px 0 12px 0' }} />

        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Runtime Components
          </Text>
          {packs.map((pack, index) => (
            <SubPackCard
              key={pack.id}
              pack={pack}
              index={index}
            />
          ))}
        </Space>

        <Space size={8} wrap>
          <AppButton
            icon={<DownloadOutlined />}
            loading={isInstalling}
            disabled={allInstalled || isInstalling}
            onClick={onInstallAll}
          >
            {isInstalling ? 'Installing...' : allInstalled ? 'Installed' : 'Install All'}
          </AppButton>

          <AppButton
            icon={<FolderOpenOutlined />}
            disabled={!anyInstalled}
            onClick={() => onOpenFolder(installPath)}
          >
            Open folder
          </AppButton>

          <AppButton
            danger
            icon={<DeleteOutlined />}
            disabled={!anyInstalled || isInstalling || isUninstalling}
            loading={isUninstalling}
            onClick={onUninstallAll}
          >
            {isUninstalling ? 'Uninstalling...' : 'Uninstall All'}
          </AppButton>
        </Space>
      </Space>
    </div>
  );
}
