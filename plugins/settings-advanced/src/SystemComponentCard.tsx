import React, { useEffect, useState } from 'react';
import { Descriptions, Progress, Space, Typography } from 'antd';
import { CheckCircleFilled, FolderOpenOutlined, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons';
import { createTauriBridge, AppButton } from '@snapfzz/shared';

type DownloadPhase = 'not-started' | 'downloading' | 'verifying' | 'extracting' | 'ready' | 'failed';

type ComponentInfoResponse = {
  id: string;
  name: string;
  version: string;
  platform: string;
  platformDisplay: string;
  downloadUrl: string;
  installPath: string;
  size: number;
  checksum: string;
  checksumAlgorithm: string;
  isInstalled: boolean;
};

type DownloadEvent = {
  componentId: string;
  bytesDownloaded: number;
  bytesTotal: number;
  percent: number;
  status: string;
};

type SystemComponentCardProps = {
  componentId: string;
};

const { Text } = Typography;
const bridge = createTauriBridge();

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

type CheckItemProps = {
  done: boolean;
  active: boolean;
  label: string;
};

function CheckItem({ done, active, label }: CheckItemProps): React.ReactElement {
  let icon: React.ReactNode;
  if (done) {
    icon = <CheckCircleFilled style={{ color: 'var(--ant-color-success, #52c41a)' }} />;
  } else if (active) {
    icon = <LoadingOutlined style={{ color: 'var(--ant-color-primary, #1677ff)' }} />;
  } else {
    icon = <CheckCircleFilled style={{ color: 'var(--ant-color-text-quaternary, #d9d9d9)' }} />;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon}
      <Text type={done ? undefined : 'secondary'}>{label}</Text>
    </div>
  );
}

export default function SystemComponentCard({ componentId }: SystemComponentCardProps): React.ReactElement {
  const [phase, setPhase] = useState<DownloadPhase>('not-started');
  const [progress, setProgress] = useState(0);
  const [bytesDownloaded, setBytesDownloaded] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [info, setInfo] = useState<ComponentInfoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bridge.invoke<DownloadEvent>('component_status', { id: componentId }).then((status) => {
      if (status.status === 'ready') {
        setPhase('ready');
        setProgress(100);
        setBytesDownloaded(status.bytesDownloaded);
        setBytesTotal(status.bytesTotal);
      } else if (status.bytesDownloaded > 0) {
        setProgress(Math.round(status.percent));
        setBytesDownloaded(status.bytesDownloaded);
        setBytesTotal(status.bytesTotal);
      }
    }).catch(() => {});

    bridge.invoke<ComponentInfoResponse>('component_info', { id: componentId }).then(setInfo).catch(() => {});
  }, [componentId]);

  const runDownload = async (): Promise<void> => {
    setPhase('downloading');
    setProgress(0);
    setError(null);

    try {
      const events = await bridge.invoke<DownloadEvent[]>('component_download', { id: componentId });
      const latest = events.at(-1);
      if (!latest) {
        setPhase('failed');
        setError('Download did not return progress events.');
        return;
      }

      setBytesDownloaded(latest.bytesDownloaded);
      setBytesTotal(latest.bytesTotal);
      setProgress(Math.round(latest.percent));

      if (latest.status === 'ready') {
        setPhase('verifying');
        setProgress(100);
        await new Promise((r) => setTimeout(r, 400));
        setPhase('extracting');
        await new Promise((r) => setTimeout(r, 400));
        setPhase('ready');
        if (info) setInfo({ ...info, isInstalled: true });
      } else if (latest.status === 'cancelled') {
        setPhase('not-started');
        setProgress(0);
      } else if (typeof latest.status === 'object' && 'failed' in (latest.status as object)) {
        setPhase('failed');
        setError('Download failed. Try again.');
      }
    } catch (err) {
      setPhase('failed');
      setError(err instanceof Error ? err.message : 'Download failed. Try again.');
    }
  };

  const cancelDownload = (): void => {
    bridge.invoke('component_download_cancel', { id: componentId }).catch(() => {});
    setPhase('not-started');
    setProgress(0);
    setBytesDownloaded(0);
    setError(null);
  };

  const openFolder = (): void => {
    if (info?.installPath) {
      bridge.invoke('open_path', { path: info.installPath }).catch(() => {});
    }
  };

  const isActive = phase === 'downloading' || phase === 'verifying' || phase === 'extracting';
  const isDone = phase === 'ready';
  const isFailed = phase === 'failed';
  const phaseIndex = ['downloading', 'verifying', 'extracting', 'ready'].indexOf(phase);
  const displayName = info?.name ?? componentId;

  return (
    <section data-testid={`component-card-${componentId}`}>
      <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
        {displayName}
      </Text>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {isFailed && error ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CloseCircleFilled style={{ color: 'var(--ant-color-error, #ff4d4f)' }} />
            <Text type="danger">{error}</Text>
          </div>
        ) : isDone ? (
          <Text type="success">{displayName} installed and ready.</Text>
        ) : isActive ? (
          <Text type="secondary">Downloading {displayName}...</Text>
        ) : (
          <Text type="secondary">{displayName} not installed. Download is required.</Text>
        )}

        {isActive && (
          <>
            <Progress
              percent={progress}
              status="active"
              format={(pct) => `${pct}%`}
            />
            <Text type="secondary">
              {formatBytes(bytesDownloaded)} / {formatBytes(bytesTotal)}
            </Text>
          </>
        )}

        {(isDone || phaseIndex >= 0) && phase !== 'not-started' && !isFailed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <CheckItem done={phaseIndex >= 1 || isDone} active={phase === 'downloading'} label={`Download complete${isDone && bytesTotal > 0 ? ` (${formatBytes(bytesTotal)})` : ''}`} />
            <CheckItem done={phaseIndex >= 2 || isDone} active={phase === 'verifying'} label={`Checksum verified (${info?.checksumAlgorithm?.toUpperCase() ?? 'SHA1'})`} />
            <CheckItem done={phaseIndex >= 3 || isDone} active={phase === 'extracting'} label="Archive extracted" />
            <CheckItem done={isDone} active={false} label={`${displayName} ready`} />
          </div>
        )}

        {info && (
          <Descriptions
            size="small"
            column={1}
            style={{ marginTop: 4 }}
            items={[
              { key: 'source', label: 'Source', children: <Text copyable type="secondary" style={{ fontSize: 12 }}>{info.downloadUrl}</Text> },
              { key: 'platform', label: 'Platform', children: <Text type="secondary">{info.platformDisplay}</Text> },
              { key: 'location', label: 'Location', children: <Text copyable type="secondary" style={{ fontSize: 12 }}>{info.installPath}</Text> },
              ...(info.version ? [{ key: 'version', label: 'Version', children: <Text type="secondary">{info.version}</Text> }] : []),
            ]}
          />
        )}

        <Space size={8}>
          {(phase === 'not-started' || isFailed) && (
            <AppButton onClick={runDownload}>Download {displayName}</AppButton>
          )}
          {isActive && (
            <AppButton onClick={cancelDownload}>Cancel</AppButton>
          )}
          {isDone && (
            <AppButton icon={<FolderOpenOutlined />} onClick={openFolder}>Open folder</AppButton>
          )}
        </Space>
      </Space>
    </section>
  );
}
