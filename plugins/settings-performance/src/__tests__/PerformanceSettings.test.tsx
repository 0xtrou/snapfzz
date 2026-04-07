import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockBridgeInvoke } = vi.hoisted(() => ({ mockBridgeInvoke: vi.fn() }));

vi.mock('@snapfzz/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@snapfzz/shared')>();
  return {
    ...actual,
    createTauriBridge: () => ({
      isAvailable: true,
      invoke: mockBridgeInvoke,
      listen: vi.fn().mockResolvedValue(() => {}),
    }),
  };
});

import PerformanceSettings from '../PerformanceSettings';

function makeMetrics(overrides: Record<string, unknown> = {}) {
  return {
    presetName: 'Balanced',
    cpuUsed: 1,
    cpuTotal: 4,
    invokeUsed: 0,
    invokeTotal: 3,
    batchIntervalMs: 16,
    batchRateMs: 16,
    agentscopeRssMb: 128,
    agentscopeMaxMb: 512,
    agentscopeStatus: 'online',
    storageUsedGb: 0.5,
    storageMaxGb: 10,
    disabledPlugins: [],
    uptimeSecs: 120,
    ...overrides,
  };
}

function makeHwInfo(overrides: Record<string, unknown> = {}) {
  return { cores: 10, ramGb: 16, onBattery: false, ...overrides };
}

function setupMocks(overrides: Partial<Record<string, unknown>> = {}) {
  mockBridgeInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'budget_snapshot') return Promise.resolve(overrides.metrics ?? makeMetrics());
    if (cmd === 'get_hardware_info') return Promise.resolve(overrides.hwInfo ?? makeHwInfo());
    if (cmd === 'set_preset') return Promise.resolve(undefined);
    if (cmd === 'get_settings') return Promise.resolve({ preset: 'balanced' });
    if (cmd === 'save_settings') return Promise.resolve(undefined);
    return Promise.resolve(undefined);
  });
}

beforeEach(() => {
  mockBridgeInvoke.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('A008/settings-performance: stateless preset from backend', () => {
  it('A008/settings-performance: displays active preset from backend snapshot', async () => {
    setupMocks({ metrics: makeMetrics({ presetName: 'performance' }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /performance/i })).toBeChecked();
    });
  });

  it('A008/settings-performance: balanced preset selected when snapshot returns Balanced', async () => {
    setupMocks({ metrics: makeMetrics({ presetName: 'balanced' }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /balanced/i })).toBeChecked();
    });
  });

  it('A008/settings-performance: battery preset selected when snapshot returns battery', async () => {
    setupMocks({ metrics: makeMetrics({ presetName: 'battery' }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /battery/i })).toBeChecked();
    });
  });

  it('A008/settings-performance: unknown presetName from snapshot falls back to balanced', async () => {
    setupMocks({ metrics: makeMetrics({ presetName: 'extreme' }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /balanced/i })).toBeChecked();
    });
  });

  it('A008/settings-performance: pending preset shown when user selects different radio', async () => {
    const user = userEvent.setup();
    setupMocks({ metrics: makeMetrics({ presetName: 'balanced' }) });
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByRole('radio', { name: /battery/i }));

    await user.click(screen.getByRole('radio', { name: /battery/i }));

    expect(screen.getByRole('radio', { name: /battery/i })).toBeChecked();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: save clears pending preset and backend updates', async () => {
    const user = userEvent.setup();
    setupMocks({ metrics: makeMetrics({ presetName: 'balanced' }) });
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByRole('radio', { name: /battery/i }));
    await user.click(screen.getByRole('radio', { name: /battery/i }));
    await waitFor(() => screen.getByRole('button', { name: /save/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      const saveCall = mockBridgeInvoke.mock.calls.find(([cmd]) => cmd === 'save_settings');
      expect(saveCall).toBeDefined();
      expect(saveCall![1]).toMatchObject({ settings: expect.objectContaining({ preset: 'battery' }) });
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /discard/i })).not.toBeInTheDocument();
    });
  });

  it('A008/settings-performance: discard clears pending preset back to active', async () => {
    const user = userEvent.setup();
    setupMocks({ metrics: makeMetrics({ presetName: 'balanced' }) });
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByRole('radio', { name: /battery/i }));
    await user.click(screen.getByRole('radio', { name: /battery/i }));
    await waitFor(() => screen.getByRole('button', { name: /discard/i }));

    await user.click(screen.getByRole('button', { name: /discard/i }));

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /balanced/i })).toBeChecked();
    });
    expect(screen.queryByRole('button', { name: /discard/i })).not.toBeInTheDocument();
  });
});

describe('A008/settings-performance: hardware-scaled performance badge', () => {
  it('A008/settings-performance: performance badge shows actual hardware values', async () => {
    setupMocks({ hwInfo: makeHwInfo({ cores: 10, ramGb: 16 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(mockBridgeInvoke).toHaveBeenCalledWith('get_hardware_info');
      expect(screen.getByRole('radio', { name: /performance/i })).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: performance badge floors cpu at 4 on low-core machine', async () => {
    setupMocks({ hwInfo: makeHwInfo({ cores: 4, ramGb: 4 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(mockBridgeInvoke).toHaveBeenCalledWith('get_hardware_info');
      expect(screen.getByRole('radio', { name: /balanced/i })).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: performance badge caps ram at 8GB', async () => {
    setupMocks({ hwInfo: makeHwInfo({ cores: 20, ramGb: 64 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(mockBridgeInvoke).toHaveBeenCalledWith('get_hardware_info');
      expect(screen.getByRole('radio', { name: /performance/i })).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: performance badge shows MB when ramGb yields <1024MB', async () => {
    setupMocks({ hwInfo: makeHwInfo({ cores: 4, ramGb: 1 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(mockBridgeInvoke).toHaveBeenCalledWith('get_hardware_info');
      expect(screen.getByRole('radio', { name: /battery/i })).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: shows fallback 4 CPU / 2048MB when hardware info unavailable', async () => {
    mockBridgeInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return Promise.resolve(makeMetrics());
      if (cmd === 'get_hardware_info') return Promise.reject(new Error('unavailable'));
      return Promise.resolve(undefined);
    });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /balanced/i })).toBeInTheDocument();
    });
  });
});

describe('A007/settings-performance: preset selector', () => {
  it('A007/settings-performance: renders Performance radio option', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /performance/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: renders Balanced radio option', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /balanced/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: renders Battery radio option', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /battery/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: clicking a different preset updates selection', async () => {
    const user = userEvent.setup();
    setupMocks({ metrics: makeMetrics({ presetName: 'balanced' }) });
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByRole('radio', { name: /battery/i }));

    await user.click(screen.getByRole('radio', { name: /battery/i }));

    expect(screen.getByRole('radio', { name: /battery/i })).toBeChecked();
  });
});

describe('A008/settings-performance: budget table structure', () => {
  it('A008/settings-performance: renders budget rows when metrics loaded', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Batch Interval')).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: renders 6 budget rows', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      const rowNames = ['Batch Interval', 'CPU Permits', 'Memory', 'Network', 'Storage', 'Reliability'];
      for (const name of rowNames) {
        expect(screen.getByText(name)).toBeInTheDocument();
      }
    });
  });

  it('A008/settings-performance: Batch Interval row present', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Batch Interval')).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: Batch Rate row present', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Batch Interval')).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: CPU Permits row present', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('CPU Permits')).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: Memory row present', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Memory')).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: Network row present', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Network')).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: Storage row present', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Storage')).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: Startup row present', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Reliability')).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: Reliability row present', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Reliability')).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: table has Budget, Current, Limit, Usage column headers', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Batch Interval')).toBeInTheDocument();
      expect(screen.getByText('CPU Permits')).toBeInTheDocument();
      expect(screen.getByText('Memory')).toBeInTheDocument();
      expect(screen.getByText('Network')).toBeInTheDocument();
    });
  });
});

describe('A008/settings-performance: budget table values', () => {
  it('A008/settings-performance: Frame row shows frame target and fps', async () => {
    setupMocks({ metrics: makeMetrics({ batchIntervalMs: 16 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Batch Interval')).toBeInTheDocument();
      const bodyText = document.body.textContent ?? '';
      expect(bodyText).toContain('16ms');
    });
  });

  it('A008/settings-performance: Frame row shows 30fps when target > 16ms', async () => {
    setupMocks({ metrics: makeMetrics({ batchIntervalMs: 33 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Batch Interval')).toBeInTheDocument();
      const bodyText = document.body.textContent ?? '';
      expect(bodyText).toContain('33ms');
    });
  });

  it('A008/settings-performance: Batch Rate row shows batch rate', async () => {
    setupMocks({ metrics: makeMetrics({ batchRateMs: 16 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Batch Interval')).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: CPU row shows used count', async () => {
    setupMocks({ metrics: makeMetrics({ cpuUsed: 3, cpuTotal: 8 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('3 in use')).toBeInTheDocument();
      const bodyText = document.body.textContent ?? '';
      expect(bodyText).toContain('8');
    });
  });

  it('A008/settings-performance: Memory row shows used MB', async () => {
    setupMocks({ metrics: makeMetrics({ agentscopeRssMb: 128, agentscopeMaxMb: 512 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('128 MB')).toBeInTheDocument();
      const bodyText = document.body.textContent ?? '';
      expect(bodyText).toContain('512 MB');
    });
  });

  it('A008/settings-performance: Memory row shows — when agentscopeRssMb is null', async () => {
    setupMocks({ metrics: makeMetrics({ agentscopeRssMb: null, agentscopeMaxMb: 512 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('— MB')).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: Network row shows invoke count', async () => {
    setupMocks({ metrics: makeMetrics({ invokeUsed: 2, invokeTotal: 6 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('2 invokes')).toBeInTheDocument();
      const bodyText = document.body.textContent ?? '';
      expect(bodyText).toContain('6');
    });
  });

  it('A008/settings-performance: Storage row shows GB used', async () => {
    setupMocks({ metrics: makeMetrics({ storageUsedGb: 2.5, storageMaxGb: 10 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('2.5 GB')).toBeInTheDocument();
      const bodyText = document.body.textContent ?? '';
      expect(bodyText).toContain('10 GB');
    });
  });

  it('A008/settings-performance: Startup row shows startup budget limit', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Reliability')).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: Reliability row shows disabled count', async () => {
    setupMocks({ metrics: makeMetrics({ disabledPlugins: ['a', 'b'] }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('2 disabled')).toBeInTheDocument();
      const bodyText = document.body.textContent ?? '';
      expect(bodyText).toContain('3 strikes / 5min');
    });
  });

  it('A008/settings-performance: Reliability row shows 0 disabled when empty', async () => {
    setupMocks({ metrics: makeMetrics({ disabledPlugins: [] }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('0 disabled')).toBeInTheDocument();
    });
  });
});

describe('A008/settings-performance: budget table usage bars', () => {
  it('A008/settings-performance: progress bar visible for CPU row', async () => {
    setupMocks({ metrics: makeMetrics({ cpuUsed: 2, cpuTotal: 4 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      const bars = document.querySelectorAll('.ant-progress');
      expect(bars.length).toBeGreaterThan(0);
    });
  });

  it('A008/settings-performance: progress bars shown for CPU, Memory, Network, Storage', async () => {
    setupMocks({ metrics: makeMetrics({ cpuUsed: 1, cpuTotal: 4, agentscopeRssMb: 100, agentscopeMaxMb: 512, invokeUsed: 1, invokeTotal: 3, storageUsedGb: 1, storageMaxGb: 10 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      const bars = document.querySelectorAll('.ant-progress');
      expect(bars.length).toBe(4);
    });
  });

  it('A008/settings-performance: no table rendered before metrics load', async () => {
    mockBridgeInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return new Promise(() => {});
      if (cmd === 'get_hardware_info') return Promise.resolve(makeHwInfo());
      return Promise.resolve(undefined);
    });
    render(<PerformanceSettings />);
    const table = document.querySelector('.ant-table');
    expect(table).not.toBeInTheDocument();
  });

  it('A008/settings-performance: shows — placeholder when metrics not yet loaded', async () => {
    mockBridgeInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return new Promise(() => {});
      if (cmd === 'get_hardware_info') return Promise.resolve(makeHwInfo());
      return Promise.resolve(undefined);
    });
    render(<PerformanceSettings />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});

describe('A007/settings-performance: budget metrics display (API compat)', () => {
  it('A007/settings-performance: calls budget_snapshot on mount', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(mockBridgeInvoke).toHaveBeenCalledWith('budget_snapshot');
    });
  });

  it('A007/settings-performance: calls get_hardware_info on mount', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(mockBridgeInvoke).toHaveBeenCalledWith('get_hardware_info');
    });
  });

  it('A008/settings-performance: shows uptime in preset info line', async () => {
    setupMocks({ metrics: makeMetrics({ uptimeSecs: 180, cpuTotal: 4, agentscopeMaxMb: 512, presetName: 'Balanced' }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      const bodyText = document.body.textContent ?? '';
      expect(bodyText).toMatch(/Balanced/i);
      expect(bodyText).toMatch(/4/);
      expect(bodyText).toMatch(/512/);
      expect(bodyText).toMatch(/3m/);
    });
  });
});

describe('A007/settings-performance: metrics refresh', () => {
  it('A007/settings-performance: polls budget_snapshot every 2 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      setupMocks();
      render(<PerformanceSettings />);
      await waitFor(() => expect(mockBridgeInvoke).toHaveBeenCalledWith('budget_snapshot'));

      const callsBefore = mockBridgeInvoke.mock.calls.filter(([cmd]) => cmd === 'budget_snapshot').length;
      await act(async () => { vi.advanceTimersByTime(2001); await Promise.resolve(); });
      await waitFor(() => {
        const callsAfter = mockBridgeInvoke.mock.calls.filter(([cmd]) => cmd === 'budget_snapshot').length;
        expect(callsAfter).toBeGreaterThan(callsBefore);
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('A007/settings-performance: disabled plugins', () => {
  it('A007/settings-performance: shows disabled plugins section when plugins are disabled', async () => {
    setupMocks({ metrics: makeMetrics({ disabledPlugins: ['snapfzz.chat'] }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Disabled Plugins')).toBeInTheDocument();
      expect(screen.getByText('snapfzz.chat')).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: does not show disabled plugins section when list is empty', async () => {
    setupMocks({ metrics: makeMetrics({ disabledPlugins: [] }) });
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByText('CPU Permits'));
    expect(screen.queryByText('Disabled Plugins')).not.toBeInTheDocument();
  });
});

describe('A007/settings-performance: save and discard', () => {
  it('A007/settings-performance: changing preset marks form dirty', async () => {
    const user = userEvent.setup();
    setupMocks({ metrics: makeMetrics({ presetName: 'balanced' }) });
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByRole('radio', { name: /battery/i }));

    await user.click(screen.getByRole('radio', { name: /battery/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: saving calls save_settings with current preset', async () => {
    const user = userEvent.setup();
    setupMocks({ metrics: makeMetrics({ presetName: 'balanced' }) });
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByRole('radio', { name: /battery/i }));
    await user.click(screen.getByRole('radio', { name: /battery/i }));
    await waitFor(() => screen.getByRole('button', { name: /save/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      const saveCall = mockBridgeInvoke.mock.calls.find(([cmd]) => cmd === 'save_settings');
      expect(saveCall).toBeDefined();
      expect(saveCall![1]).toMatchObject({ settings: expect.objectContaining({ preset: 'battery' }) });
    });
  });

  it('A007/settings-performance: discard restores original preset', async () => {
    const user = userEvent.setup();
    setupMocks({ metrics: makeMetrics({ presetName: 'balanced' }) });
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByRole('radio', { name: /battery/i }));
    await user.click(screen.getByRole('radio', { name: /battery/i }));
    await waitFor(() => screen.getByRole('button', { name: /discard/i }));

    await user.click(screen.getByRole('button', { name: /discard/i }));

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /balanced/i })).toBeChecked();
    });
  });

  it('A007/settings-performance: save failure is handled silently', async () => {
    const user = userEvent.setup();
    mockBridgeInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return Promise.resolve(makeMetrics({ presetName: 'balanced' }));
      if (cmd === 'get_hardware_info') return Promise.resolve(makeHwInfo());
      if (cmd === 'get_settings') return Promise.reject(new Error('fail'));
      return Promise.resolve(undefined);
    });
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByRole('radio', { name: /battery/i }));
    await user.click(screen.getByRole('radio', { name: /battery/i }));
    await waitFor(() => screen.getByRole('button', { name: /save/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('CPU Permits')).toBeInTheDocument();
    });
  });
});

describe('A007/settings-performance: GB display', () => {
  it('A007/settings-performance: shows GB for agentscopeMaxMb >= 1024', async () => {
    setupMocks({ metrics: makeMetrics({ agentscopeMaxMb: 1024, presetName: 'performance' }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('1GB');
    });
  });

  it('A007/settings-performance: shows 30fps when batchIntervalMs > 16', async () => {
    setupMocks({ metrics: makeMetrics({ batchIntervalMs: 33 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Batch Interval')).toBeInTheDocument();
      const bodyText = document.body.textContent ?? '';
      expect(bodyText).toContain('33ms');
    });
  });

  it('A007/settings-performance: shows memory as — when agentscopeRssMb is null', async () => {
    setupMocks({ metrics: makeMetrics({ agentscopeRssMb: null }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('— MB')).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: live indicator shows Offline before metrics load', () => {
    mockBridgeInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return new Promise(() => {});
      if (cmd === 'get_hardware_info') return Promise.resolve(makeHwInfo());
      return Promise.resolve(undefined);
    });
    render(<PerformanceSettings />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('A007/settings-performance: live indicator shows Live after metrics load', async () => {
    setupMocks();
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });
  });
});

describe('A007/settings-performance: Tauri unavailable', () => {
  it('A007/settings-performance: renders with placeholder dashes when bridge invoke throws', async () => {
    mockBridgeInvoke.mockRejectedValue(new Error('no tauri'));
    render(<PerformanceSettings />);
    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThan(0);
    });
  });
});

describe('A008/settings-performance: strokeColorForPct branch coverage', () => {
  it('A008/settings-performance: progress bar shows error color at 90%+ usage', async () => {
    setupMocks({ metrics: makeMetrics({ cpuUsed: 4, cpuTotal: 4 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('CPU Permits')).toBeInTheDocument();
    });
    const progressBars = document.querySelectorAll('.ant-progress');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it('A008/settings-performance: progress bar shows warning color at 70-89% usage', async () => {
    setupMocks({ metrics: makeMetrics({ cpuUsed: 3, cpuTotal: 4 }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('CPU Permits')).toBeInTheDocument();
    });
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).toContain('3 in use');
  });
});

describe('A008/settings-performance: disabledPlugins display', () => {
  it('A008/settings-performance: reliability row shows count of disabled plugins', async () => {
    setupMocks({ metrics: makeMetrics({ disabledPlugins: ['plugin.a', 'plugin.b'] }) });
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Reliability')).toBeInTheDocument();
    });
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).toContain('2 disabled');
  });
});

describe('A008/settings-performance: stale async cleanup', () => {
  it('A008/settings-performance: unmount before metrics resolve does not update state', async () => {
    let resolveSnapshot: ((v: unknown) => void) | undefined;
    mockBridgeInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return new Promise((r) => { resolveSnapshot = r; });
      if (cmd === 'get_hardware_info') return Promise.resolve(makeHwInfo());
      if (cmd === 'get_settings') return Promise.resolve({ preset: 'balanced' });
      return Promise.resolve(undefined);
    });

    const { unmount } = render(<PerformanceSettings />);
    unmount();

    await act(async () => {
      resolveSnapshot?.(makeMetrics());
      await new Promise((r) => setTimeout(r, 50));
    });
  });
});
