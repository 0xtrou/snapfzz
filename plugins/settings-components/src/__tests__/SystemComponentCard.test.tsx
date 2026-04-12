import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SystemComponentCard, { type ComponentInfo } from '../SystemComponentCard';

function makeComponent(overrides: Partial<ComponentInfo> = {}): ComponentInfo {
  return {
    id: 'cef',
    name: 'Chromium Embedded Framework',
    description: 'Embedded browser engine',
    license: 'BSD',
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

describe('A007/settings-components: SystemComponentCard branches', () => {
  it('A007/settings-components: renders unknown platform fallback when platform labels missing', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ platformDisplay: '', platform: '' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getByText('Unknown platform')).toBeInTheDocument();
    expect(screen.getByText('Not Installed')).toBeInTheDocument();
  });

  it('A007/settings-components: renders not installed with install button when not installed', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ isInstalled: false })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getByText('Not Installed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
  });

  it('A007/settings-components: renders installing state when busyDownload is true', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ isInstalled: false })}
        busyDownload={true}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getByText('Installing')).toBeInTheDocument();
  });

  it('A007/settings-components: falls back to Unavailable metadata labels', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ downloadUrl: '', installPath: '' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
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
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.queryByText(/License:/i)).not.toBeInTheDocument();
  });

  it('A007/settings-components: renders installed state with open folder and uninstall', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ isInstalled: true })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
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
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={onOpenFolder}
      />,
    );

    await user.click(screen.getByRole('button', { name: /open folder/i }));
    expect(onOpenFolder).toHaveBeenCalledWith('/tmp/component');
  });

  it('A007/settings-components: renders dependency badge and order label with disabled install', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ id: 'agentscope', name: 'AgentScope', isInstalled: false })}
        busyDownload={false}
        busyUninstall={false}
        downloadDisabled={true}
        dependencyBadges={[{ label: 'Requires Python', tone: 'required' }]}
        installOrderLabel="2nd"
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getByText('Requires Python')).toBeInTheDocument();
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /install/i })).toBeDisabled();
  });

  it('A007/settings-components: clicking install calls onDownload with component id', async () => {
    const onDownload = vi.fn();
    const user = userEvent.setup();

    render(
      <SystemComponentCard
        component={makeComponent({ isInstalled: false })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={onDownload}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /install/i }));
    expect(onDownload).toHaveBeenCalledWith('cef');
  });

  it('A007/settings-components: shows description when provided', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ description: 'A browser engine' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getByText('A browser engine')).toBeInTheDocument();
  });

  it('A007/settings-components: shows license when provided', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ license: 'MIT' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    expect(screen.getByText('License: MIT')).toBeInTheDocument();
  });
});
