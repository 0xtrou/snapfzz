import React, { useCallback } from 'react';
import { Divider, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  GithubOutlined,
  GlobalOutlined,
  LoadingOutlined,
  PythonOutlined,
} from '@ant-design/icons';
import { Tooltip } from 'antd';
import { AppButton, createTauriBridge } from '@snapfzz/shared';
import type { DownloadProgress } from './SystemComponentCard';
import InstallProgressOverlay from './InstallProgressOverlay';

const { Text } = Typography;
const bridge = createTauriBridge();

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
  repositoryUrl: string;
  websiteUrl: string;
  status?: DownloadProgress;
}

interface PythonPackCardProps {
  uv: PythonSubPack;
  python: PythonSubPack;
  agentscope: PythonSubPack;
  agentscopeRuntime: PythonSubPack;
  litellm: PythonSubPack;
  isInstalling: boolean;
  isUninstalling: boolean;
  allInstalled: boolean;
  anyInstalled: boolean;
  installSteps: Array<{ id: string; label: string; is_installed: boolean }>;
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

  const handleOpenUrl = useCallback((url: string) => {
    void bridge.invoke<void>('open_path', { path: url });
  }, []);

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
          {pack.repositoryUrl && (
            <Tooltip title="View Repository">
              <button
                type="button"
                onClick={() => handleOpenUrl(pack.repositoryUrl)}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-link)', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
              >
                <GithubOutlined style={{ fontSize: 14 }} />
              </button>
            </Tooltip>
          )}
          {pack.websiteUrl && (
            <Tooltip title="Visit Website">
              <button
                type="button"
                onClick={() => handleOpenUrl(pack.websiteUrl)}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-link)', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
              >
                <GlobalOutlined style={{ fontSize: 14 }} />
              </button>
            </Tooltip>
          )}
        </Space>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Location:</Text>
          <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{pack.installPath}</Text>
          <Tooltip title="Copy path">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(pack.installPath);
              }}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-link)', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
            >
              <CopyOutlined style={{ fontSize: 12 }} />
            </button>
          </Tooltip>
        </div>
      </Space>
    </div>
  );
}

export default function PythonPackCard({
  uv,
  python,
  agentscope,
  agentscopeRuntime,
  litellm,
  isInstalling,
  isUninstalling,
  allInstalled,
  anyInstalled,
  installSteps,
  onInstallAll,
  onUninstallAll,
  onOpenFolder,
}: PythonPackCardProps): React.ReactElement {
  const packs: PythonSubPack[] = [uv, python, agentscope, agentscopeRuntime, litellm];

  const installPath = python.installPath;

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
                <><LoadingOutlined /> Installing...</>
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
          {isInstalling && installSteps.length > 0 ? (
            <InstallProgressOverlay
              steps={installSteps.map((s, i, arr) => {
                const activeIdx = arr.findIndex((x) => !x.is_installed);
                return {
                  id: s.id,
                  label: s.label,
                  status: (s.is_installed ? 'done' : i === activeIdx ? 'running' : 'pending') as 'done' | 'running' | 'pending',
                };
              })}
            />
          ) : (
            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>
              Runtime Components
            </Text>
          )}

          {!isInstalling && packs.map((pack, index) => (
            <SubPackCard
              key={pack.id}
              pack={pack}
              index={index}
            />
          ))}
        </Space>

        <Space size={8} wrap>
          {allInstalled ? (
            <>
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
            {isUninstalling ? 'Uninstalling...' : 'Uninstall'}
          </AppButton>
            </>
          ) : (<AppButton
            loading={isInstalling}
            disabled={allInstalled || isInstalling}
            onClick={onInstallAll}
          >
            {isInstalling ? 'Installing...' : allInstalled ? 'Installed' : 'Install'}
          </AppButton>)}

          
        </Space>
      </Space>
    </div>
  );
}
