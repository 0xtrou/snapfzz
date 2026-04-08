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
  { id: 'cef', name: 'Chromium Embedded Framework', version: '146.0.10', isInstalled: true },
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
  it('renders header', async () => {
    render(<DiagnosticsSettings />);
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('preflight_status');
    });
  });

  it('shows all 4 preflight phases', async () => {
    render(<DiagnosticsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Phase 1: filesystem')).toBeInTheDocument();
      expect(screen.getByText('Phase 2: vault')).toBeInTheDocument();
      expect(screen.getByText('Phase 3: settings')).toBeInTheDocument();
      expect(screen.getByText('Phase 4: budget')).toBeInTheDocument();
    });
  });

  it('shows Ok status tags', async () => {
    render(<DiagnosticsSettings />);
    await waitFor(() => {
      const tags = screen.getAllByText('Ok');
      expect(tags.length).toBe(4);
    });
  });

  it('shows Degraded status with warning tag', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve([
        { phase: 2, name: 'vault', durationMs: 0, status: 'degraded: vault key missing', detail: 'vault key missing' },
      ]);
      if (cmd === 'get_hardware_info') return Promise.resolve(defaultHardware);
      if (cmd === 'component_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Degraded')).toBeInTheDocument();
      expect(screen.getByText('vault key missing')).toBeInTheDocument();
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

  it('shows component install status', async () => {
    render(<DiagnosticsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Chromium Embedded Framework')).toBeInTheDocument();
      expect(screen.getByText('Installed')).toBeInTheDocument();
    });
  });

  it('re-run button refreshes data', async () => {
    const user = userEvent.setup();
    render(<DiagnosticsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Phase 1: filesystem')).toBeInTheDocument();
    });

    const callsBefore = mockInvoke.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /re-run checks/i }));

    await waitFor(() => {
      expect(mockInvoke.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('handles preflight_status failure gracefully', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.reject(new Error('unavailable'));
      if (cmd === 'get_hardware_info') return Promise.reject(new Error('unavailable'));
      if (cmd === 'component_list') return Promise.reject(new Error('unavailable'));
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    });
  });

  it('shows failed status tag for unknown status', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve([
        { phase: 1, name: 'filesystem', durationMs: 0, status: 'error: disk full', detail: 'disk full' },
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

  it('shows not installed component', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'preflight_status') return Promise.resolve(defaultPhases);
      if (cmd === 'get_hardware_info') return Promise.resolve(defaultHardware);
      if (cmd === 'component_list') return Promise.resolve([
        { id: 'llama', name: 'llama-server', version: '', isInstalled: false },
      ]);
      return Promise.resolve(undefined);
    });

    render(<DiagnosticsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Not Installed')).toBeInTheDocument();
    });
  });
});
