import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SystemComponentCard, { type ComponentInfo } from '../SystemComponentCard';

// Re-use the mock wired in ComponentsSettings.test.tsx pattern — here we need
// the bridge mock for handleOpenUrl which calls bridge.invoke('open_path').
const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@snapfzz/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@snapfzz/shared')>();
  return {
    ...actual,
    createTauriBridge: () => ({
      isAvailable: true,
      invoke: mockInvoke,
      listen: vi.fn().mockResolvedValue(() => {}),
    }),
  };
});

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

describe('A007/settings-components: SystemComponentCard — URL buttons', () => {
  it('renders GitHub repository button when repositoryUrl is provided', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ repositoryUrl: 'https://github.com/example/repo' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    const repoBtn = screen.getAllByRole('button').find((b) =>
      b.querySelector('.anticon-github') !== null,
    );
    expect(repoBtn).toBeDefined();
  });

  it('does not render GitHub button when repositoryUrl is absent', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ repositoryUrl: undefined })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    const repoBtn = screen.queryAllByRole('button').find((b) =>
      b.querySelector('.anticon-github') !== null,
    );
    expect(repoBtn).toBeUndefined();
  });

  it('clicking repository button invokes open_path with the URL', async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <SystemComponentCard
        component={makeComponent({ repositoryUrl: 'https://github.com/example/repo' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    const repoBtn = screen.getAllByRole('button').find((b) =>
      b.querySelector('.anticon-github') !== null,
    )!;
    await user.click(repoBtn);
    expect(mockInvoke).toHaveBeenCalledWith('open_path', { path: 'https://github.com/example/repo' });
  });

  it('renders website button when websiteUrl is provided', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ websiteUrl: 'https://example.com' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    const webBtn = screen.getAllByRole('button').find((b) =>
      b.querySelector('.anticon-global') !== null,
    );
    expect(webBtn).toBeDefined();
  });

  it('does not render website button when websiteUrl is absent', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ websiteUrl: undefined })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    const webBtn = screen.queryAllByRole('button').find((b) =>
      b.querySelector('.anticon-global') !== null,
    );
    expect(webBtn).toBeUndefined();
  });

  it('clicking website button invokes open_path with the website URL', async () => {
    mockInvoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <SystemComponentCard
        component={makeComponent({ websiteUrl: 'https://example.com' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    const webBtn = screen.getAllByRole('button').find((b) =>
      b.querySelector('.anticon-global') !== null,
    )!;
    await user.click(webBtn);
    expect(mockInvoke).toHaveBeenCalledWith('open_path', { path: 'https://example.com' });
  });
});

describe('A007/settings-components: SystemComponentCard — dependency badge tones', () => {
  it('renders badge with warning color for "required" tone', () => {
    const { container } = render(
      <SystemComponentCard
        component={makeComponent({ id: 'agentscope', isInstalled: false })}
        busyDownload={false}
        busyUninstall={false}
        dependencyBadges={[{ label: 'Requires Python', tone: 'required' }]}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    expect(screen.getByText('Requires Python')).toBeInTheDocument();
    // antd Tag with color="warning" gets a class like ant-tag-warning
    const tag = container.querySelector('.ant-tag-warning');
    expect(tag).toBeInTheDocument();
  });

  it('renders badge with success color for "ready" tone', () => {
    const { container } = render(
      <SystemComponentCard
        component={makeComponent({ id: 'agentscope', isInstalled: false })}
        busyDownload={false}
        busyUninstall={false}
        dependencyBadges={[{ label: 'Ready', tone: 'ready' }]}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    expect(screen.getByText('Ready')).toBeInTheDocument();
    const tag = container.querySelector('.ant-tag-success');
    expect(tag).toBeInTheDocument();
  });

  it('renders badge with no color for "default" tone', () => {
    const { container } = render(
      <SystemComponentCard
        component={makeComponent({ id: 'agentscope', isInstalled: false })}
        busyDownload={false}
        busyUninstall={false}
        dependencyBadges={[{ label: 'Default badge', tone: 'default' }]}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    expect(screen.getByText('Default badge')).toBeInTheDocument();
    // No explicit color, so no ant-tag-warning or ant-tag-success
    expect(container.querySelector('.ant-tag-warning')).not.toBeInTheDocument();
    expect(container.querySelector('.ant-tag-success')).not.toBeInTheDocument();
  });

  it('renders badge without tone property (undefined tone)', () => {
    render(
      <SystemComponentCard
        component={makeComponent()}
        busyDownload={false}
        busyUninstall={false}
        dependencyBadges={[{ label: 'No tone badge' }]}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    expect(screen.getByText('No tone badge')).toBeInTheDocument();
  });

  it('renders multiple dependency badges', () => {
    render(
      <SystemComponentCard
        component={makeComponent()}
        busyDownload={false}
        busyUninstall={false}
        dependencyBadges={[
          { label: 'Badge One', tone: 'ready' },
          { label: 'Badge Two', tone: 'required' },
          { label: 'Badge Three' },
        ]}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    expect(screen.getByText('Badge One')).toBeInTheDocument();
    expect(screen.getByText('Badge Two')).toBeInTheDocument();
    expect(screen.getByText('Badge Three')).toBeInTheDocument();
  });
});

describe('A007/settings-components: SystemComponentCard — version display', () => {
  it('shows em-dash when version is empty', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ version: '' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows version string when provided', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ version: 'v2.0.0' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    expect(screen.getByText('v2.0.0')).toBeInTheDocument();
  });
});

describe('A007/settings-components: SystemComponentCard — uninstall flow', () => {
  it('clicking uninstall calls onUninstall with component id', async () => {
    const onUninstall = vi.fn();
    const user = userEvent.setup();
    render(
      <SystemComponentCard
        component={makeComponent({ isInstalled: true, id: 'cef' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={onUninstall}
        onOpenFolder={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /uninstall/i }));
    expect(onUninstall).toHaveBeenCalledWith('cef');
  });

  it('shows loading spinner on uninstall button when busyUninstall=true', () => {
    const { container } = render(
      <SystemComponentCard
        component={makeComponent({ isInstalled: true })}
        busyDownload={false}
        busyUninstall={true}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    // loading button renders an anticon-loading spinner
    expect(container.querySelector('.anticon-loading')).toBeInTheDocument();
  });
});

describe('A007/settings-components: SystemComponentCard — description conditional', () => {
  it('does not show description section when description is empty', () => {
    render(
      <SystemComponentCard
        component={makeComponent({ description: '' })}
        busyDownload={false}
        busyUninstall={false}
        onDownload={vi.fn()}
        onUninstall={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );
    // Should not find any description text
    expect(screen.queryByText('Embedded browser engine')).not.toBeInTheDocument();
  });
});
