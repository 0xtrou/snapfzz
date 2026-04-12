import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@snapfzz/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@snapfzz/shared')>();
  return {
    ...actual,
    createTauriBridge: () => ({
      isAvailable: false,
      invoke: mockInvoke,
      listen: vi.fn().mockResolvedValue(() => {}),
    }),
  };
});

import PythonPackCard from '../PythonPackCard';

function makePack(overrides: Partial<{
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
}> = {}) {
  return {
    id: 'uv',
    name: 'uv',
    version: '0.5.0',
    description: 'Fast Python package manager',
    license: 'Apache-2.0',
    platformDisplay: 'macOS (Apple Silicon)',
    downloadUrl: 'pip',
    installPath: '/Users/test/.snapfzz/runtime/python/venv',
    isInstalled: false,
    repositoryUrl: '',
    websiteUrl: '',
    ...overrides,
  };
}

function makeDefaultProps() {
  return {
    uv: makePack({ id: 'uv', name: 'uv' }),
    python: makePack({ id: 'python', name: 'Python' }),
    agentscope: makePack({ id: 'agentscope', name: 'AgentScope' }),
    agentscopeRuntime: makePack({ id: 'agentscope-runtime', name: 'AgentScope Runtime' }),
    litellm: makePack({ id: 'litellm', name: 'LiteLLM' }),
    isInstalling: false,
    isUninstalling: false,
    allInstalled: false,
    anyInstalled: false,
    installSteps: [],
    onInstallAll: vi.fn(),
    onUninstallAll: vi.fn(),
    onOpenFolder: vi.fn(),
  };
}

// Shared defaultProps instance — reset-safe for tests that only render, not click
const defaultProps = makeDefaultProps();

describe('A007/settings-components: PythonPackCard', () => {
  it('renders the python-pack-card container', () => {
    render(<PythonPackCard {...defaultProps} />);
    expect(screen.getByTestId('python-pack-card')).toBeInTheDocument();
  });

  it('renders "Python Runtime Ecosystem" heading', () => {
    render(<PythonPackCard {...defaultProps} />);
    expect(screen.getByText('Python Runtime Ecosystem')).toBeInTheDocument();
  });

  it('shows "Not Installed" tag when none installed and not installing', () => {
    render(<PythonPackCard {...defaultProps} allInstalled={false} anyInstalled={false} isInstalling={false} />);
    // There will be multiple "Not Installed" texts (one for the card header tag, several for sub-packs)
    expect(screen.getAllByText('Not Installed').length).toBeGreaterThan(0);
  });

  it('shows "All Installed" tag when allInstalled=true', () => {
    render(<PythonPackCard {...defaultProps} allInstalled={true} anyInstalled={true} />);
    expect(screen.getByText('All Installed')).toBeInTheDocument();
  });

  it('shows "Installing..." tag when isInstalling=true and not allInstalled', () => {
    render(<PythonPackCard {...defaultProps} isInstalling={true} allInstalled={false} />);
    const installingTexts = screen.getAllByText('Installing...');
    expect(installingTexts.length).toBeGreaterThan(0);
  });

  it('shows "Partially Installed" tag when anyInstalled=true but not allInstalled and not installing', () => {
    render(<PythonPackCard {...defaultProps} anyInstalled={true} allInstalled={false} isInstalling={false} />);
    expect(screen.getByText('Partially Installed')).toBeInTheDocument();
  });

  it('renders Install button when not all installed', () => {
    render(<PythonPackCard {...defaultProps} allInstalled={false} />);
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
  });

  it('clicking Install button calls onInstallAll', async () => {
    const onInstallAll = vi.fn();
    const user = userEvent.setup();
    render(<PythonPackCard {...defaultProps} allInstalled={false} onInstallAll={onInstallAll} />);
    await user.click(screen.getByRole('button', { name: /^install$/i }));
    expect(onInstallAll).toHaveBeenCalledOnce();
  });

  it('shows Install button text as "Installing..." while isInstalling=true', () => {
    render(<PythonPackCard {...defaultProps} isInstalling={true} allInstalled={false} />);
    // The button text inside the Install button
    const btn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Installing...'));
    expect(btn).toBeDefined();
  });

  it('renders Open folder and Uninstall buttons when allInstalled=true', () => {
    render(<PythonPackCard {...defaultProps} allInstalled={true} anyInstalled={true} />);
    expect(screen.getByRole('button', { name: /open folder/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /uninstall/i })).toBeInTheDocument();
  });

  it('clicking Open folder calls onOpenFolder with python installPath', async () => {
    const onOpenFolder = vi.fn();
    const user = userEvent.setup();
    const pythonPack = makePack({ id: 'python', name: 'Python', installPath: '/test/venv', isInstalled: true });
    render(
      <PythonPackCard
        {...defaultProps}
        python={pythonPack}
        allInstalled={true}
        anyInstalled={true}
        onOpenFolder={onOpenFolder}
      />,
    );
    await user.click(screen.getByRole('button', { name: /open folder/i }));
    expect(onOpenFolder).toHaveBeenCalledWith('/test/venv');
  });

  it('clicking Uninstall calls onUninstallAll', async () => {
    const onUninstallAll = vi.fn();
    const user = userEvent.setup();
    render(
      <PythonPackCard
        {...defaultProps}
        allInstalled={true}
        anyInstalled={true}
        onUninstallAll={onUninstallAll}
      />,
    );
    await user.click(screen.getByRole('button', { name: /uninstall/i }));
    expect(onUninstallAll).toHaveBeenCalledOnce();
  });

  it('shows Uninstalling... text while isUninstalling=true', () => {
    render(
      <PythonPackCard
        {...defaultProps}
        allInstalled={true}
        anyInstalled={true}
        isUninstalling={true}
      />,
    );
    const btn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Uninstalling...'));
    expect(btn).toBeDefined();
  });

  it('renders all sub-pack cards when not installing', () => {
    render(<PythonPackCard {...defaultProps} isInstalling={false} />);
    expect(screen.getByText('uv')).toBeInTheDocument();
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText('AgentScope')).toBeInTheDocument();
    expect(screen.getByText('AgentScope Runtime')).toBeInTheDocument();
    expect(screen.getByText('LiteLLM')).toBeInTheDocument();
  });

  it('hides sub-pack cards when isInstalling=true and shows progress overlay', () => {
    render(
      <PythonPackCard
        {...defaultProps}
        isInstalling={true}
        installSteps={[
          { id: 'uv', label: 'Install uv', is_installed: true },
          { id: 'python', label: 'Install Python', is_installed: false },
        ]}
      />,
    );
    expect(screen.getByTestId('install-progress-overlay')).toBeInTheDocument();
    // Sub-pack cards should not be visible while installing
    expect(screen.queryByText('uv')).not.toBeInTheDocument();
  });

  it('does not render InstallProgressOverlay when not installing', () => {
    render(<PythonPackCard {...defaultProps} isInstalling={false} />);
    expect(screen.queryByTestId('install-progress-overlay')).not.toBeInTheDocument();
  });

  it('shows "Runtime Components" label when not installing', () => {
    render(<PythonPackCard {...defaultProps} isInstalling={false} />);
    expect(screen.getByText('Runtime Components')).toBeInTheDocument();
  });

  it('does not render InstallProgressOverlay when isInstalling=true but installSteps is empty', () => {
    render(<PythonPackCard {...defaultProps} isInstalling={true} installSteps={[]} />);
    // No overlay because steps are empty — the condition is isInstalling && installSteps.length > 0
    expect(screen.queryByTestId('install-progress-overlay')).not.toBeInTheDocument();
    expect(screen.getByText('Runtime Components')).toBeInTheDocument();
  });
});

describe('A007/settings-components: SubPackCard (via PythonPackCard)', () => {
  it('shows Installed tag for installed sub-pack', () => {
    const installed = makePack({ id: 'uv', name: 'uv', isInstalled: true });
    render(<PythonPackCard {...defaultProps} uv={installed} />);
    expect(screen.getByText('Installed')).toBeInTheDocument();
  });

  it('shows Not Installed tag for uninstalled sub-pack', () => {
    render(<PythonPackCard {...defaultProps} />);
    // All packs are not installed by default; at least one "Not Installed" should appear
    const notInstalledTags = screen.getAllByText('Not Installed');
    expect(notInstalledTags.length).toBeGreaterThan(0);
  });

  it('renders pack version when version is non-empty', () => {
    const packWithVersion = makePack({ id: 'uv', name: 'uv', version: '1.2.3' });
    render(<PythonPackCard {...defaultProps} uv={packWithVersion} />);
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
  });

  it('does not render version text when version is empty', () => {
    const packNoVersion = makePack({ id: 'uv', name: 'uv', version: '' });
    render(<PythonPackCard {...defaultProps} uv={packNoVersion} />);
    // uv has empty version — should not render "v" prefix for uv, but other packs may have versions
    expect(screen.queryByText('v')).not.toBeInTheDocument();
  });

  it('renders repository link button when repositoryUrl is set', () => {
    const packWithRepo = makePack({ id: 'uv', name: 'uv', repositoryUrl: 'https://github.com/example/uv' });
    render(<PythonPackCard {...defaultProps} uv={packWithRepo} />);
    // GithubOutlined is rendered inside a button with Tooltip "View Repository"
    const repoButtons = screen.getAllByRole('button').filter((b) =>
      b.querySelector('.anticon-github') !== null,
    );
    expect(repoButtons.length).toBeGreaterThan(0);
  });

  it('does not render repository link when repositoryUrl is empty', () => {
    render(<PythonPackCard {...defaultProps} />);
    const repoButtons = screen.queryAllByRole('button').filter((b) =>
      b.querySelector('.anticon-github') !== null,
    );
    expect(repoButtons.length).toBe(0);
  });

  it('renders website link button when websiteUrl is set', () => {
    const packWithWebsite = makePack({ id: 'uv', name: 'uv', websiteUrl: 'https://example.com' });
    render(<PythonPackCard {...defaultProps} uv={packWithWebsite} />);
    const webButtons = screen.getAllByRole('button').filter((b) =>
      b.querySelector('.anticon-global') !== null,
    );
    expect(webButtons.length).toBeGreaterThan(0);
  });

  it('does not render website link when websiteUrl is empty', () => {
    render(<PythonPackCard {...defaultProps} />);
    const webButtons = screen.queryAllByRole('button').filter((b) =>
      b.querySelector('.anticon-global') !== null,
    );
    expect(webButtons.length).toBe(0);
  });

  it('renders install path for sub-pack', () => {
    const uvPack = makePack({ id: 'uv', name: 'uv', installPath: '/custom/venv' });
    render(<PythonPackCard {...defaultProps} uv={uvPack} />);
    expect(screen.getAllByText('/custom/venv').length).toBeGreaterThan(0);
  });

  it('renders copy button for install path', () => {
    render(<PythonPackCard {...defaultProps} />);
    // CopyOutlined buttons should be present for each sub-pack
    const copyButtons = screen.getAllByRole('button').filter((b) =>
      b.querySelector('.anticon-copy') !== null,
    );
    expect(copyButtons.length).toBeGreaterThan(0);
  });

  it('renders description for sub-pack', () => {
    const uvPack = makePack({ id: 'uv', name: 'uv', description: 'A fast package manager' });
    render(<PythonPackCard {...defaultProps} uv={uvPack} />);
    expect(screen.getByText('A fast package manager')).toBeInTheDocument();
  });

  it('renders license for sub-pack', () => {
    const uvPack = makePack({ id: 'uv', name: 'uv', license: 'MIT' });
    render(<PythonPackCard {...defaultProps} uv={uvPack} />);
    expect(screen.getAllByText('License: MIT').length).toBeGreaterThan(0);
  });
});

describe('A007/settings-components: PythonPackCard install step status mapping', () => {
  it('maps first uninstalled step to running, rest to pending', () => {
    render(
      <PythonPackCard
        {...defaultProps}
        isInstalling={true}
        installSteps={[
          { id: 'uv', label: 'Install uv', is_installed: true },
          { id: 'python', label: 'Install Python', is_installed: false },
          { id: 'agentscope', label: 'Install AgentScope', is_installed: false },
        ]}
      />,
    );
    // done step shows ✅, running step shows spinner, pending step shows ○
    expect(screen.getByText('✅')).toBeInTheDocument();
    expect(screen.getByText('○')).toBeInTheDocument();
    expect(screen.getByTestId('install-progress-overlay')).toBeInTheDocument();
  });

  it('all steps done shows all ✅', () => {
    render(
      <PythonPackCard
        {...defaultProps}
        isInstalling={true}
        installSteps={[
          { id: 'uv', label: 'Install uv', is_installed: true },
          { id: 'python', label: 'Install Python', is_installed: true },
        ]}
      />,
    );
    const doneIcons = screen.getAllByText('✅');
    expect(doneIcons.length).toBe(2);
  });
});
