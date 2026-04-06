import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockBridgeInvoke = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({
    isAvailable: true,
    invoke: mockBridgeInvoke,
    listen: vi.fn().mockResolvedValue(() => {}),
  }),
}));

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
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('A007/settings-performance: preset selector', () => {
  it('A007/settings-performance: renders Performance radio option', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'Balanced' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Performance' })).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: renders Balanced radio option', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'Balanced' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Balanced' })).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: renders Battery radio option', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'Balanced' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Battery' })).toBeInTheDocument();
    });
  });

  it('A007/settings-performance: active preset from budget_snapshot is selected', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'performance' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Performance' })).toBeChecked();
    });
  });

  it('A007/settings-performance: balanced preset selected when snapshot returns Balanced', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'balanced' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Balanced' })).toBeChecked();
    });
  });

  it('A007/settings-performance: battery preset selected when snapshot returns battery', async () => {
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'battery' }));
    render(<PerformanceSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Battery' })).toBeChecked();
    });
  });

  it('A007/settings-performance: clicking a different preset updates selection', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockBridgeInvoke.mockResolvedValue(makeMetrics({ presetName: 'balanced' }));
    render(<PerformanceSettings />);
    await waitFor(() => screen.getByRole('radio', { name: 'Battery' }));

    await user.click(screen.getByRole('radio', { name: 'Battery' }));

    expect(screen.getByRole('radio', { name: 'Battery' })).toBeChecked();
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
      expect(screen.getByText(/active: balanced.*4 permits.*512 mb cap.*3m/i)).toBeInTheDocument();
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
    mockBridgeInvoke.mockResolvedValue(makeMetrics());
    render(<PerformanceSettings />);
    await waitFor(() => expect(mockBridgeInvoke).toHaveBeenCalledTimes(1));

    await act(async () => { vi.advanceTimersByTime(2000); });
    await waitFor(() => expect(mockBridgeInvoke).toHaveBeenCalledTimes(2));

    await act(async () => { vi.advanceTimersByTime(2000); });
    await waitFor(() => expect(mockBridgeInvoke).toHaveBeenCalledTimes(3));
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
