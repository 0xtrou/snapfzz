import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const defaultPhases = [
  { phase: 1, name: 'filesystem', durationMs: 0, status: 'ok', detail: null },
  { phase: 2, name: 'vault', durationMs: 0, status: 'ok', detail: null },
  { phase: 3, name: 'settings', durationMs: 1, status: 'ok', detail: null },
  { phase: 4, name: 'budget', durationMs: 57, status: 'ok', detail: null },
];

const defaultHardware = { cores: 14, ramGb: 36, onBattery: false };

const defaultComponents = [
  { id: 'cef', name: 'Chromium Embedded Framework', version: '146.0.10', platform: 'macos-arm64', platformDisplay: 'macOS (Apple Silicon)', isInstalled: true },
];

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'preflight_status') return Promise.resolve(defaultPhases);
    if (cmd === 'get_hardware_info') return Promise.resolve(defaultHardware);
    if (cmd === 'component_list') return Promise.resolve(defaultComponents);
    return Promise.resolve(undefined);
  });
});

describe('A012/settings-diagnostics', () => {
  it('renders header and system health check title', async () => {
    render(<DiagnosticsSettings />);
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('System Health Check')).toBeInTheDocument();
    });
  });

  it('shows all 4 health checks with capitalized names', async () => {
    render(<DiagnosticsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Filesystem')).toBeInTheDocument();
      expect(screen.getByText('Vault')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Budget')).toBeInTheDocument();
    });
  });

  it('shows Ok status tags for healthy checks', async () => {
    render(<DiagnosticsSettings />);
    await waitFor(() => {
      const tags = screen.getAllByText('Ok');
      expect(tags.length).toBe(4);
    });
  });

  it('shows Degraded status with warning tag', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve([
        { phase: 2, name: 'vault', durationMs: 0, status: 'degraded: key missing', detail: 'key missing' },
      ]);
      if (cmd === 'get_hardware_info') return Promise.resolve(defaultHardware);
      if (cmd === 'component_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Degraded')).toBeInTheDocument();
      expect(screen.getByText('key missing')).toBeInTheDocument();
    });
  });

  it('shows Failed status for unknown status values', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve([
        { phase: 1, name: 'filesystem', durationMs: 0, status: 'error', detail: 'disk full' },
      ]);
      if (cmd === 'get_hardware_info') return Promise.resolve(defaultHardware);
      if (cmd === 'component_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows hardware info', async () => {
    render(<DiagnosticsSettings />);
    await waitFor(() => {
      expect(screen.getByText('14')).toBeInTheDocument();
      expect(screen.getByText('36 GB')).toBeInTheDocument();
      expect(screen.getByText('No')).toBeInTheDocument();
    });
  });

  it('shows on battery Yes when onBattery is true', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve(defaultPhases);
      if (cmd === 'get_hardware_info') return Promise.resolve({ cores: 8, ramGb: 16, onBattery: true });
      if (cmd === 'component_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });
  });

  it('shows component install status', async () => {
    render(<DiagnosticsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Chromium Embedded Framework')).toBeInTheDocument();
      expect(screen.getByText('Installed')).toBeInTheDocument();
    });
  });

  it('shows not installed component', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve(defaultPhases);
      if (cmd === 'get_hardware_info') return Promise.resolve(defaultHardware);
      if (cmd === 'component_list') return Promise.resolve([
        { id: 'llama', name: 'llama-server', version: '', platform: '', platformDisplay: '', isInstalled: false },
      ]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Not Installed')).toBeInTheDocument();
    });
  });

  it('re-check button refreshes data', async () => {
    const user = userEvent.setup();
    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Filesystem')).toBeInTheDocument();
    });

    const callsBefore = mockInvoke.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /re-check/i }));

    await waitFor(() => {
      expect(mockInvoke.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('handles fetch failure gracefully', async () => {
    mockInvoke.mockImplementation(() => Promise.reject(new Error('unavailable')));

    render(<DiagnosticsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    });
  });
});
