import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SystemComponentCard, { type ComponentInfo, type DownloadProgress } from '../SystemComponentCard';

function makeComponent(overrides: Partial<ComponentInfo> = {}): ComponentInfo {
  return {
    id: 'cef',
    name: 'Chromium Embedded Framework',
    version: 'v146.0.10',
    platform: 'macos-arm64',
    platformDisplay: 'macOS (Apple Silicon)',
    downloadUrl: 'https://example.com/cef.tar.gz',
    installPath: '/Users/test/.snapfzz/runtime/cef',
    size: 123,
    checksum: 'abc',
    checksumAlgorithm: 'sha256',
    isInstalled: false,
    ...overrides,
  };
}

function makeStatus(overrides: Partial<DownloadProgress> = {}): DownloadProgress {
  return {
    componentId: 'cef',
    bytesDownloaded: 0,
    bytesTotal: 0,
    percent: 0,
    status: 'pending',
    ...overrides,
  };
}

describe('A007/settings-components: SystemComponentCard branches', () => {
  it('A007/settings-components: renders unknown platform fallback when platform labels missing', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ platformDisplay: '', platform: '' })}
        status={makeStatus({ status: 'pending' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onCancelDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getByText('Unknown platform')).toBeInTheDocument();
    expect(screen.getByText('Not Installed')).toBeInTheDocument();
  });

  it('A007/settings-components: resolves undefined status as pending', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ isInstalled: false })}
        status={undefined}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onCancelDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getByText('Not Installed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
  });

  it('A007/settings-components: renders downloading state and cancel action from status', async () => {
    const onCancelDownload = vi.fn();
    const user = userEvent.setup();

    render(
      <SystemComponentCard
        component={makeComponent({ isInstalled: false })}
        status={makeStatus({ status: 'downloading' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onCancelDownload={onCancelDownload}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getByText('Downloading')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel download/i }));
    expect(onCancelDownload).toHaveBeenCalledWith('cef');
  });

  it('A007/settings-components: falls back to Unavailable metadata labels', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ downloadUrl: '', installPath: '' })}
        status={makeStatus({ status: 'pending' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onCancelDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
  });

  it('A007/settings-components: hides license label when license is empty', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ license: '' })}
        status={makeStatus({ status: 'pending' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onCancelDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.queryByText(/License:/i)).not.toBeInTheDocument();
  });

  it('A007/settings-components: treats ready-like status text as installed', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ isInstalled: false })}
        status={makeStatus({ status: 'Ready to use' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onCancelDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getByText('Installed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open folder/i })).toBeInTheDocument();
  });

  it('A007/settings-components: clicking open folder forwards install path', async () => {
    const onOpenFolder = vi.fn();
    const user = userEvent.setup();

    render(
      <SystemComponentCard
        component={makeComponent({ isInstalled: true, installPath: '/tmp/component' })}
        status={makeStatus({ status: 'ready' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onCancelDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={onOpenFolder}
      />,
    );

    await user.click(screen.getByRole('button', { name: /open folder/i }));
    expect(onOpenFolder).toHaveBeenCalledWith('/tmp/component');
  });

  it('A007/settings-components: busy download shows progress tag and percentage', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ isInstalled: false })}
        status={makeStatus({ status: 'pending', percent: 63 })}
        busyDownload={true}
        busyUninstall={false}
        onDownload={vi.fn()}
        onCancelDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getByText('Downloading')).toBeInTheDocument();
    expect(screen.getByText('63%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel download/i })).toBeInTheDocument();
  });

  it('A007/settings-components: renders dependency badge and order label with disabled download', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ id: 'agentscope', name: 'AgentScope', isInstalled: false })}
        status={makeStatus({ componentId: 'agentscope', status: 'pending' })}
        busyDownload={false}
        busyUninstall={false}
        downloadDisabled={true}
        dependencyBadges={[{ label: 'Requires Python', tone: 'required' }]}
        installOrderLabel="2nd"
        onDownload={vi.fn()}
        onCancelDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getByText('Requires Python')).toBeInTheDocument();
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled();
  });
});
