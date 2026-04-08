import React, { useEffect, useState } from 'react';
import { Descriptions, Progress, Space, Typography } from 'antd';
import { CheckCircleOutlined, DownloadOutlined, FolderOpenOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { createTauriBridge, AppButton } from '@snapfzz/shared';

type DownloadPhase = 'not-started' | 'downloading' | 'verifying' | 'extracting' | 'ready' | 'failed';

type DownloadEvent = {
  bytesDownloaded: number;
  bytesTotal: number;
  percent: number;
  status: string;
};

type PlatformInfo = {
  platform: string;
  platformDisplay: string;
  downloadUrl: string;
  installPath: string;
  isInstalled: boolean;
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
    icon = <CheckCircleOutlined style={{ color: 'var(--success-color, var(--ant-color-success))' }} />;
  } else if (active) {
    icon = <LoadingOutlined style={{ color: 'var(--accent-primary, var(--ant-color-primary))' }} />;
  } else {
    icon = <CheckCircleOutlined style={{ color: 'var(--text-tertiary, var(--ant-color-text-tertiary))' }} />;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon}
      <Text type={done ? undefined : 'secondary'}>{label}</Text>
    </div>
  );
}

export default function MiniAppsOnboarding(): React.ReactElement {
  const [phase, setPhase] = useState<DownloadPhase>('not-started');
  const [progress, setProgress] = useState(0);
  const [bytesDownloaded, setBytesDownloaded] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [info, setInfo] = useState<PlatformInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bridge.invoke<DownloadEvent>('cef_download_status').then((status) => {
      if (status.status === 'ready') {
        setPhase('ready');
        setProgress(100);
      } else if (status.status === 'extracting') {
        setPhase('extracting');
        setProgress(Math.round(status.percent));
      } else if (status.status === 'verifying') {
        setPhase('verifying');
        setProgress(Math.round(status.percent));
      } else if (status.bytesDownloaded > 0 || status.status === 'downloading') {
        setPhase('downloading');
        setProgress(Math.round(status.percent));
      }
      setBytesDownloaded(status.bytesDownloaded);
      setBytesTotal(status.bytesTotal);
    }).catch(() => {});

    bridge.invoke<PlatformInfo>('cef_platform_info').then(setInfo).catch(() => {});
  }, []);

  const runDownload = async (): Promise<void> => {
    setPhase('downloading');
    setProgress(0);
    setBytesDownloaded(0);
    setBytesTotal(0);
    setError(null);

    try {
      const events = await bridge.invoke<DownloadEvent[]>('cef_download_start');
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
        await new Promise((resolve) => setTimeout(resolve, 400));
        setPhase('extracting');
        await new Promise((resolve) => setTimeout(resolve, 400));
        setPhase('ready');
        setProgress(100);
        setInfo((current) => (current ? { ...current, isInstalled: true } : current));
        return;
      }

      if (latest.status === 'failed') {
        setPhase('failed');
        setError('Download failed. Try again.');
        return;
      }

      if (latest.status === 'extracting') {
        setPhase('extracting');
        return;
      }

      if (latest.status === 'verifying') {
        setPhase('verifying');
        return;
      }

      setPhase('downloading');
    } catch (err) {
      setPhase('failed');
      setError(err instanceof Error ? err.message : 'Download failed. Try again.');
    }
  };

  const cancelDownload = (): void => {
    bridge.invoke('cef_download_cancel').catch(() => {});
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
  const statusText = phase === 'verifying'
    ? 'Verifying CEF archive...'
    : phase === 'extracting'
      ? 'Extracting CEF runtime...'
      : 'Downloading CEF runtime...';

  return (
    <section data-testid="miniapps-onboarding">
      <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
        Mini apps runtime
      </Text>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {isFailed && error ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CloseCircleOutlined style={{ color: 'var(--error-color, var(--ant-color-error))' }} />
            <Text type="danger">{error}</Text>
          </div>
        ) : isDone ? (
          <Text type="success">CEF runtime installed and ready.</Text>
        ) : isActive ? (
          <Text type="secondary">{statusText}</Text>
        ) : (
          <Text type="secondary">CEF runtime not installed. Download is required for mini apps.</Text>
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

        {(isDone || phase === 'verifying' || phase === 'extracting') && !isFailed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <CheckItem done={isDone || phase === 'verifying' || phase === 'extracting'} active={false} label={`Download complete${bytesTotal > 0 ? ` (${formatBytes(bytesTotal)})` : ''}`} />
            <CheckItem done={isDone || phase === 'extracting'} active={phase === 'verifying'} label="Checksum verified (SHA-256)" />
            <CheckItem done={isDone} active={phase === 'extracting'} label="Archive extracted" />
            <CheckItem done={isDone} active={false} label="CEF runtime ready" />
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
            ]}
          />
        )}

        <Space size={8}>
          {(phase === 'not-started' || isFailed) && (
            <AppButton icon={<DownloadOutlined />} onClick={runDownload}>Download CEF runtime</AppButton>
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
