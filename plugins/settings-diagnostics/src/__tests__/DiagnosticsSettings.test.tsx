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

describe('A012/settings-diagnostics', () => {
  it('A012/settings-diagnostics: renders header', async () => {
    render(<DiagnosticsSettings />);

    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Preflight Status')).toBeInTheDocument();
    });
  });

  it('A012/settings-diagnostics: shows all 4 preflight phases', async () => {
    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Phase 1: Filesystem')).toBeInTheDocument();
      expect(screen.getByText('Phase 2: Vault')).toBeInTheDocument();
      expect(screen.getByText('Phase 3: Settings')).toBeInTheDocument();
      expect(screen.getByText('Phase 4: Budget')).toBeInTheDocument();
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
      expect(screen.getByText('Phase 1: Filesystem')).toBeInTheDocument();
    });

    const preflightCallsBefore = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'preflight_status').length;
    const rerunButton = screen.getByRole('button', { name: /re-run checks/i });

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

  it('A012/settings-diagnostics: handles preflight_status failure gracefully', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.reject(new Error('preflight unavailable'));
      if (cmd === 'get_hardware_info') return Promise.resolve(hardware);
      if (cmd === 'budget_snapshot') return Promise.resolve({ presetName: 'balanced' });
      if (cmd === 'component_list') return Promise.resolve(components);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load preflight status.')).toBeInTheDocument();
      expect(screen.getByText('No preflight data available.')).toBeInTheDocument();
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
      expect(screen.getByText(/Phase 1:/)).toBeInTheDocument();
      expect(screen.getByText('Ok')).toBeInTheDocument();
    });
  });
});
