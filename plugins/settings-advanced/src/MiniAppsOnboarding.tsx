import React, { useState } from 'react';
import { Progress, Space, Typography } from 'antd';
import { createTauriBridge, AppButton } from '@snapfzz/shared';

type DownloadPhase = 'not-started' | 'downloading' | 'ready' | 'failed';

type DownloadEvent = {
  bytesDownloaded: number;
  bytesTotal: number;
  percent: number;
  status: string;
};

const { Text } = Typography;
const bridge = createTauriBridge();

export default function MiniAppsOnboarding(): React.ReactElement {
  const [phase, setPhase] = useState<DownloadPhase>('not-started');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string>('CEF runtime not installed. Download is required for mini apps.');
  const [requestToken, setRequestToken] = useState(0);

  const runDownload = async (): Promise<void> => {
    const token = requestToken + 1;
    setRequestToken(token);
    setPhase('downloading');
    setProgress(0);
    setMessage('Downloading CEF runtime...');

    try {
      const events = await bridge.invoke<DownloadEvent[]>('cef_download_start');
      if (token !== requestToken + 1) {
        return;
      }

      const latest = events.at(-1);
      if (!latest) {
        setPhase('failed');
        setMessage('Download did not return progress events.');
        return;
      }

      setProgress(Math.round(latest.percent));
      if (latest.status === 'ready') {
        setPhase('ready');
        setMessage('CEF runtime ready');
      } else if (latest.status === 'failed') {
        setPhase('failed');
        setMessage('Download failed. Try again.');
      } else {
        setPhase('downloading');
      }
    } catch {
      setPhase('failed');
      setMessage('Download failed. Try again.');
    }
  };

  const cancelDownload = (): void => {
    setRequestToken((value) => value + 1);
    setPhase('not-started');
    setProgress(0);
    setMessage('CEF runtime not installed. Download is required for mini apps.');
  };

  return (
    <section data-testid="miniapps-onboarding">
      <Text strong style={{ display: 'block', marginBottom: 'var(--spacing-3, 12px)' }}>
        Mini apps runtime
      </Text>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Text type={phase === 'failed' ? 'danger' : 'secondary'}>{message}</Text>
        <Progress percent={progress} status={phase === 'failed' ? 'exception' : 'active'} />
        {phase === 'not-started' || phase === 'failed' ? (
          <AppButton onClick={runDownload}>Download CEF runtime</AppButton>
        ) : null}
        {phase === 'downloading' ? (
          <AppButton variant="danger" onClick={cancelDownload}>Cancel download</AppButton>
        ) : null}
      </Space>
    </section>
  );
}
