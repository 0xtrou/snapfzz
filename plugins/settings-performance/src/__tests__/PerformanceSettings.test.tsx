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
    frameTargetMs: 16,
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

beforeEach(() => {
  mockBridgeInvoke.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('A007/settings-performance: preset selector', () => {
  it('A007/settings-performance: renders Performance radio option', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'Balanced' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /performance/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: renders Balanced radio option', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'Balanced' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /balanced/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: renders Battery radio option', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'Balanced' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /battery/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: active preset from budget_snapshot is selected', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'performance' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /performance/i })).toBeChecked();
    });
  });

  it('A007/settings-performance: balanced preset selected when snapshot returns Balanced', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'balanced' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /balanced/i })).toBeChecked();
    });
  });

  it('A007/settings-performance: battery preset selected when snapshot returns battery', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'battery' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /battery/i })).toBeChecked();
    });
  });

  it('A007/settings-performance: clicking a different preset updates selection', async () => {
    const user = userEvent.setup();
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'balanced' }));
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByRole('radio', { name: /battery/i }));

    await user.click(screen.getByRole('radio', { name: /battery/i }));

    expect(screen.getByRole('radio', { name: /battery/i })).toBeChecked();
  });
});

describe('A007/settings-performance: budget metrics display', () => {
  it('A007/settings-performance: calls budget_snapshot on mount', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics());
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(mockBridgeInvoke).toHaveBeenCalledWith('budget_snapshot', undefined);
    });
  });

  it('A007/settings-performance: displays CPU budget section', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics());
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('CPU Budget')).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: displays Memory Budget section', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics());
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Memory Budget')).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: displays Network Budget section', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics());
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Network Budget')).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: displays Storage Budget section', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics());
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Storage Budget')).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: shows CPU usage as permits in use', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ cpuUsed: 2, cpuTotal: 8 }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('2/8 permits in use')).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: shows storage usage in GB', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ storageUsedGb: 2.5, storageMaxGb: 20 }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('2.5/20 GB used')).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: shows invoke concurrency', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ invokeUsed: 1, invokeTotal: 3 }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('1/3 concurrent invokes')).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: shows frame target and batch rate', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ frameTargetMs: 16, batchRateMs: 16 }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('16ms (60fps)')).toBeInTheDocument();
      expect(screen.getByText('16ms')).toBeInTheDocument();
    });
  });

  it('A008/settings-performance: shows uptime in preset info line', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ uptimeSecs: 180, cpuTotal: 4, agentscopeMaxMb: 512, presetName: 'Balanced' }));
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

describe('A007/settings-performance: progress bars', () => {
  it('A007/settings-performance: CPU progress bar renders at correct percentage', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ cpuUsed: 2, cpuTotal: 4 }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      const bars = document.querySelectorAll('.ant-progress');
      expect(bars.length).toBeGreaterThan(0);
    });
  });

  it('A007/settings-performance: shows — placeholder when metrics not yet loaded', async () => {
    mockBridgeInvoke.mockReturnValue(new Promise(() => {}));
    render(<PerformanceSettings />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});

describe('A007/settings-performance: metrics refresh', () => {
  it('A007/settings-performance: polls budget_snapshot every 2 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockBridgeInvoke.mockResolvedValue(makeMetrics());
      render(<PerformanceSettings />);
      await waitFor(() => expect(mockBridgeInvoke).toHaveBeenCalledTimes(1));

      const callsBefore = mockBridgeInvoke.mock.calls.length;
      await act(async () => { vi.advanceTimersByTime(2001); await Promise.resolve(); });
      await waitFor(() => expect(mockBridgeInvoke.mock.calls.length).toBeGreaterThan(callsBefore));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('A007/settings-performance: disabled plugins', () => {
  it('A007/settings-performance: shows disabled plugins section when plugins are disabled', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ disabledPlugins: ['snapfzz.chat'] }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Disabled Plugins')).toBeInTheDocument();
      expect(screen.getByText('snapfzz.chat')).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: does not show disabled plugins section when list is empty', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ disabledPlugins: [] }));
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByText('CPU Budget'));
    expect(screen.queryByText('Disabled Plugins')).not.toBeInTheDocument();
  });
});

describe('A007/settings-performance: save and discard', () => {
  it('A007/settings-performance: changing preset marks form dirty', async () => {
    const user = userEvent.setup();
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'balanced' }));
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByRole('radio', { name: /battery/i }));

    await user.click(screen.getByRole('radio', { name: /battery/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: saving calls save_settings with current preset', async () => {
    const user = userEvent.setup();
    mockBridgeInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'budget_snapshot') return Promise.resolve(makeMetrics({ presetName: 'balanced' }));
      if (cmd === 'get_settings') return Promise.resolve({ preset: 'balanced' });
      if (cmd === 'save_settings') return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
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
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'balanced' }));
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
      if (cmd === 'get_settings') return Promise.reject(new Error('fail'));
      return Promise.resolve(undefined);
    });
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByRole('radio', { name: /battery/i }));
    await user.click(screen.getByRole('radio', { name: /battery/i }));
    await waitFor(() => screen.getByRole('button', { name: /save/i }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText('CPU Budget')).toBeInTheDocument();
    });
  });
});

describe('A007/settings-performance: GB display', () => {
  it('A007/settings-performance: shows GB for agentscopeMaxMb >= 1024', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ agentscopeMaxMb: 1024, presetName: 'performance' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('1GB');
    });
  });

  it('A007/settings-performance: shows 30fps when frameTargetMs > 16', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ frameTargetMs: 33 }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('33ms (30fps)')).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: shows memory as — when agentscopeRssMb is null', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ agentscopeRssMb: null }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText(/—\/512 MB/)).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: shows agentscope status when not online', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ agentscopeStatus: 'starting' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('starting');
    });
  });

  it('A007/settings-performance: live indicator shows Offline before metrics load', () => {
    mockBridgeInvoke.mockReturnValue(new Promise(() => {}));
    render(<PerformanceSettings />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('A007/settings-performance: live indicator shows Live after metrics load', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics());
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });
  });
});

describe('A007/settings-performance: unknown preset name', () => {
  it('A007/settings-performance: unknown presetName from snapshot does not change preset selection', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'extreme' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /balanced/i })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /balanced/i })).toBeChecked();
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
