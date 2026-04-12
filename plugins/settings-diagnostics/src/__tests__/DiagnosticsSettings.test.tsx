import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

import DiagnosticsSettings from '../DiagnosticsSettings';

const okPhases = [
  { phase: 1, name: 'filesystem', durationMs: 0, status: 'ok', detail: null },
  { phase: 2, name: 'vault', durationMs: 0, status: 'ok', detail: null },
  { phase: 3, name: 'settings', durationMs: 0, status: 'ok', detail: null },
  { phase: 4, name: 'budget', durationMs: 57, status: 'ok', detail: null },
];

const hardware = { cores: 14, ramGb: 36, onBattery: false };

const components = [
  {
    id: 'cef',
    name: 'Chromium Embedded Framework',
    version: 'v146.0.10',
    platformDisplay: 'macOS (Apple Silicon)',
    isInstalled: true,
  },
];

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'preflight_status') return Promise.resolve(okPhases);
    if (cmd === 'get_hardware_info') return Promise.resolve(hardware);
    if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'performance' });
    if (cmd === 'component_list') return Promise.resolve(components);
    return Promise.resolve(undefined);
  });
});

// ---------------------------------------------------------------------------
// Shared helpers for Python Runtime tests
// ---------------------------------------------------------------------------

function makePythonMock(pythonRuntime: object | null) {
  return (cmd: string) => {
    if (cmd === 'preflight_status') return Promise.resolve(okPhases);
    if (cmd === 'get_hardware_info') return Promise.resolve(hardware);
    if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'performance' });
    if (cmd === 'component_list') return Promise.resolve(components);
    if (cmd === 'python_runtime_status') {
      return pythonRuntime === null ? Promise.reject(new Error('unavailable')) : Promise.resolve(pythonRuntime);
    }
    return Promise.resolve(undefined);
  };
}

describe('A012/settings-diagnostics', () => {
  it('A012/settings-diagnostics: renders header', async () => {
    render(<DiagnosticsSettings />);

    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('System Status')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: shows all 4 system checks', async () => {
    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Filesystem')).toBeInTheDocument();
      expect(screen.getByText('Vault')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Budget')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: shows Ok status with green tag', async () => {
    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getAllByText('Ok')).toHaveLength(4);
    });
  });

  it('A012/settings-diagnostics: shows Degraded status with warning tag', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') {
        return Promise.resolve([
          { phase: 2, name: 'vault', durationMs: 0, status: 'degraded', detail: 'Keychain unavailable' },
        ]);
      }
      if (cmd === 'get_hardware_info') return Promise.resolve(hardware);
      if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'performance' });
      if (cmd === 'component_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Degraded')).toBeInTheDocument();
      expect(screen.getByText('Keychain unavailable')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: shows degraded fallback message when detail is missing', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') {
        return Promise.resolve([
          { phase: 2, name: 'vault', durationMs: 0, status: 'degraded', detail: null },
        ]);
      }
      if (cmd === 'get_hardware_info') return Promise.resolve(hardware);
      if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'performance' });
      if (cmd === 'component_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Degraded')).toBeInTheDocument();
      expect(screen.getByText('Some checks need attention.')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: shows failed status with fallback message', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') {
        return Promise.resolve([
          { phase: 1, name: 'filesystem', durationMs: 3, status: 'failed', detail: null },
        ]);
      }
      if (cmd === 'get_hardware_info') return Promise.resolve(hardware);
      if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'performance' });
      if (cmd === 'component_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('Unable to complete this check.')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: shows hardware info', async () => {
    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('14')).toBeInTheDocument();
      expect(screen.getByText('36 GB')).toBeInTheDocument();
      expect(screen.getByText('Performance')).toBeInTheDocument();
      expect(screen.getByText('macOS (Apple Silicon)')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: keeps hardware placeholders when hardware command fails', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve(okPhases);
      if (cmd === 'get_hardware_info') return Promise.reject(new Error('hardware unavailable'));
      if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'balanced' });
      if (cmd === 'component_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
      expect(screen.getByText('Balanced')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: re-run button refreshes data', async () => {
    const user = userEvent.setup();
    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Filesystem')).toBeInTheDocument();
    });

    const preflightCallsBefore = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'preflight_status').length;
    const rerunButton = await screen.findByRole('button', { name: /re-run/i });
    await waitFor(() => {
      expect(rerunButton).toBeEnabled();
    });

    await user.click(rerunButton);

    await waitFor(() => {
      const preflightCallsAfter = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'preflight_status').length;
      expect(preflightCallsAfter).toBeGreaterThan(preflightCallsBefore);
    });
  });

  it('A012/settings-diagnostics: shows component install status', async () => {
    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('CEF Runtime')).toBeInTheDocument();
      expect(screen.getByText('Installed')).toBeInTheDocument();
      expect(screen.getByText('v146.0.10')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: shows missing status when CEF pack is not installed', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve(okPhases);
      if (cmd === 'get_hardware_info') return Promise.resolve(hardware);
      if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'performance' });
      if (cmd === 'component_list') {
        return Promise.resolve([
          {
            id: 'cef',
            name: 'Chromium Embedded Framework',
            version: '',
            platformDisplay: 'macOS (Apple Silicon)',
            isInstalled: false,
          },
        ]);
      }
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Missing')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: shows missing pack state when CEF is absent', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve(okPhases);
      if (cmd === 'get_hardware_info') return Promise.resolve(hardware);
      if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'performance' });
      if (cmd === 'component_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('No system packs detected.')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: handles system status failure gracefully', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.reject(new Error('system status unavailable'));
      if (cmd === 'get_hardware_info') return Promise.resolve(hardware);
      if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'balanced' });
      if (cmd === 'component_list') return Promise.resolve(components);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load system status.')).toBeInTheDocument();
      expect(screen.getByText('No system status data available.')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: keeps default platform when component list fails', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve(okPhases);
      if (cmd === 'get_hardware_info') return Promise.resolve(hardware);
      if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'performance' });
      if (cmd === 'component_list') return Promise.reject(new Error('components unavailable'));
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('macOS (Apple Silicon)')).toBeInTheDocument();
      expect(screen.getByText('No system packs detected.')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: keeps default preset when no preset values are available', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve(okPhases);
      if (cmd === 'get_hardware_info') return Promise.resolve({ cores: 8, ramGb: 16, onBattery: false });
      if (cmd === 'budget_snapshot') return Promise.resolve({});
      if (cmd === 'component_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Preset')).toBeInTheDocument();
      expect(screen.getByText('Performance')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: keeps default platform when CEF platform display is empty', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve(okPhases);
      if (cmd === 'get_hardware_info') return Promise.resolve(hardware);
      if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'performance' });
      if (cmd === 'component_list') {
        return Promise.resolve([
          {
            id: 'cef',
            name: 'Chromium Embedded Framework',
            version: 'v146.0.10',
            platformDisplay: '',
            isInstalled: true,
          },
        ]);
      }
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('macOS (Apple Silicon)')).toBeInTheDocument();
      expect(screen.getByText('CEF Runtime')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: uses hardware preset when available and snapshot is empty', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve(okPhases);
      if (cmd === 'get_hardware_info') {
        return Promise.resolve({ cores: 12, ramGb: 24, onBattery: false, preset: 'Eco' });
      }
      if (cmd === 'budget_snapshot') return Promise.resolve({});
      if (cmd === 'component_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Eco')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: renders empty phase names without crashing', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') {
        return Promise.resolve([
          { phase: 1, name: '', durationMs: 5, status: 'ok', detail: null },
        ]);
      }
      if (cmd === 'get_hardware_info') return Promise.resolve(hardware);
      if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'performance' });
      if (cmd === 'component_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Ok')).toBeInTheDocument();
      expect(screen.queryByText('1. ')).not.toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: shows failed status with explicit detail message', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') {
        return Promise.resolve([
          { phase: 1, name: 'filesystem', durationMs: 3, status: 'failed', detail: 'Disk read error' },
        ]);
      }
      if (cmd === 'get_hardware_info') return Promise.resolve(hardware);
      if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'performance' });
      if (cmd === 'component_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('Disk read error')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Python Runtime section
// ---------------------------------------------------------------------------

describe('A012/settings-diagnostics — Python Runtime section', () => {
  it('shows "Loading Python runtime status..." while python_runtime_status is pending or unavailable', async () => {
    mockInvoke.mockImplementation(makePythonMock(null));

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Loading Python runtime status...')).toBeInTheDocument();
    });
  });

  it('renders Python Runtime section when python_runtime_status resolves', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.9',
        python_path: '/usr/local/bin/python3',
        uv_installed: true,
        uv_version: '0.4.1',
        venv_exists: true,
        installed_packages: [],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Python Runtime')).toBeInTheDocument();
      expect(screen.queryByText('Loading Python runtime status...')).not.toBeInTheDocument();
    });
  });

  it('shows installed Python tag with version when python_installed=true and python_version is set', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.12.2',
        python_path: null,
        uv_installed: false,
        uv_version: undefined,
        venv_exists: false,
        installed_packages: [],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('v3.12.2')).toBeInTheDocument();
    });
  });

  it('shows "Installed" tag (no version) when python_installed=true and python_version is absent', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: undefined,
        python_path: null,
        uv_installed: false,
        uv_version: undefined,
        venv_exists: false,
        installed_packages: [],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      const tags = screen.getAllByText('Installed');
      expect(tags.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows "Not Installed" tag when python_installed=false', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: false,
        python_version: undefined,
        python_path: null,
        uv_installed: false,
        uv_version: undefined,
        venv_exists: false,
        installed_packages: [],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getAllByText('Not Installed').length).toBeGreaterThan(0);
    });
  });

  it('shows uv version tag when uv_installed=true and uv_version is set', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.0',
        python_path: null,
        uv_installed: true,
        uv_version: '0.5.3',
        venv_exists: true,
        installed_packages: [],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('v0.5.3')).toBeInTheDocument();
    });
  });

  it('shows uv "Installed" tag (no version) when uv_installed=true and uv_version is absent', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.0',
        python_path: null,
        uv_installed: true,
        uv_version: undefined,
        venv_exists: true,
        installed_packages: [],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      const tags = screen.getAllByText('Installed');
      expect(tags.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows uv "Not Installed" tag when uv_installed=false', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.0',
        python_path: null,
        uv_installed: false,
        uv_version: undefined,
        venv_exists: false,
        installed_packages: [],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Not Installed')).toBeInTheDocument();
    });
  });

  it('shows Python Path row when python_path is present', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.9',
        python_path: '/usr/local/bin/python3',
        uv_installed: true,
        uv_version: '0.4.1',
        venv_exists: true,
        installed_packages: [],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Python Path')).toBeInTheDocument();
      expect(screen.getByText('/usr/local/bin/python3')).toBeInTheDocument();
    });
  });

  it('does not show Python Path row when python_path is null/absent', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.9',
        python_path: null,
        uv_installed: true,
        uv_version: '0.4.1',
        venv_exists: true,
        installed_packages: [],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.queryByText('Python Path')).not.toBeInTheDocument();
    });
  });

  it('shows "No agent packages installed" when installed_packages is empty', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.9',
        python_path: null,
        uv_installed: true,
        uv_version: '0.4.1',
        venv_exists: true,
        installed_packages: [],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('No agent packages installed')).toBeInTheDocument();
    });
  });

  it('shows "No agent packages installed" when packages do not match agentscope or litellm', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.9',
        python_path: null,
        uv_installed: true,
        uv_version: '0.4.1',
        venv_exists: true,
        installed_packages: ['requests==2.31.0', 'numpy==1.26.0', 'someother-enterprise==1.0.0'],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('No agent packages installed')).toBeInTheDocument();
    });
  });

  it('shows agentscope package tag when present', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.9',
        python_path: null,
        uv_installed: true,
        uv_version: '0.4.1',
        venv_exists: true,
        installed_packages: ['agentscope==0.2.1', 'requests==2.31.0'],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('agentscope')).toBeInTheDocument();
      expect(screen.queryByText('No agent packages installed')).not.toBeInTheDocument();
    });
  });

  it('shows litellm package tag when present', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.9',
        python_path: null,
        uv_installed: true,
        uv_version: '0.4.1',
        venv_exists: true,
        installed_packages: ['litellm==1.0.0'],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('litellm')).toBeInTheDocument();
      expect(screen.queryByText('No agent packages installed')).not.toBeInTheDocument();
    });
  });

  it('strips extras bracket from package name in tag (e.g. agentscope[all])', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.9',
        python_path: null,
        uv_installed: true,
        uv_version: '0.4.1',
        venv_exists: true,
        installed_packages: ['agentscope[all]==0.3.0'],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('agentscope')).toBeInTheDocument();
    });
  });

  it('filters out enterprise-suffixed agentscope packages', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.9',
        python_path: null,
        uv_installed: true,
        uv_version: '0.4.1',
        venv_exists: true,
        installed_packages: ['agentscope-enterprise==0.2.1'],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('No agent packages installed')).toBeInTheDocument();
    });
  });

  it('shows package tag without version tooltip text when version segment is absent', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.9',
        python_path: null,
        uv_installed: true,
        uv_version: '0.4.1',
        venv_exists: true,
        installed_packages: ['agentscope'],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('agentscope')).toBeInTheDocument();
    });
  });

  it('shows both agentscope and litellm package tags when both present', async () => {
    mockInvoke.mockImplementation(
      makePythonMock({
        python_installed: true,
        python_version: '3.11.9',
        python_path: null,
        uv_installed: true,
        uv_version: '0.4.1',
        venv_exists: true,
        installed_packages: ['agentscope==0.2.1', 'litellm==1.0.0', 'requests==2.31.0'],
      }),
    );

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('agentscope')).toBeInTheDocument();
      expect(screen.getByText('litellm')).toBeInTheDocument();
    });
  });
});
