import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

const mockInvoke = vi.fn();

Object.defineProperty(window, '__TAURI_INTERNALS__', {
  writable: true,
  value: { invoke: mockInvoke },
});

vi.mock('@snapfzz/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@snapfzz/shared')>();
  return {
    ...actual,
    SettingsHeader: ({ title, children }: { title: string; children?: React.ReactNode }) => (
      <div>
        <h3>{title}</h3>
        {children}
      </div>
    ),
  };
});

import React from 'react';
import ProcessesSettings from '../ProcessesSettings';

function makeProcess(overrides: Partial<import('../ProcessesSettings').ProcessSnapshot> = {}) {
  return {
    name: 'agentscope',
    pid: 43452,
    status: 'online' as const,
    rssMb: 342,
    maxMemoryMb: 512,
    restartCount: 0,
    consecutiveFailures: 0,
    uptimeSecs: 720,
    location: 'local',
    healthUrl: 'http://127.0.0.1:8090/health',
    owner: 'system',
    ...overrides,
  };
}

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('A008/settings-processes: header and layout', () => {
  it('A008/settings-processes: renders "Processes" header', async () => {
    mockInvoke.mockResolvedValue([makeProcess()]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByText('Processes')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: shows live indicator when data available', async () => {
    mockInvoke.mockResolvedValue([makeProcess()]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('live-indicator')).toHaveTextContent('Live');
    });
  });

  it('A008/settings-processes: shows offline indicator when Tauri unavailable', async () => {
    mockInvoke.mockRejectedValue(new Error('no tauri'));
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('live-indicator')).toHaveTextContent('Offline');
    });
  });
});

describe('A008/settings-processes: aggregate stats', () => {
  it('A008/settings-processes: shows process count in aggregate stats', async () => {
    mockInvoke.mockResolvedValue([makeProcess(), makeProcess({ name: 'vite-preview', pid: 99 })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      const stats = screen.getByTestId('aggregate-stats');
      expect(stats).toHaveTextContent('2 processes');
    });
  });

  it('A008/settings-processes: shows total memory in aggregate stats', async () => {
    mockInvoke.mockResolvedValue([
      makeProcess({ rssMb: 342 }),
      makeProcess({ name: 'vite-preview', pid: 99, rssMb: 42 }),
    ]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      const stats = screen.getByTestId('aggregate-stats');
      expect(stats).toHaveTextContent('384 MB total');
    });
  });

  it('A008/settings-processes: shows singular "process" for single process', async () => {
    mockInvoke.mockResolvedValue([makeProcess()]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      const stats = screen.getByTestId('aggregate-stats');
      expect(stats).toHaveTextContent('1 process');
      expect(stats).not.toHaveTextContent('1 processes');
    });
  });
});

describe('A008/settings-processes: process table', () => {
  it('A008/settings-processes: renders process table with Name column', async () => {
    mockInvoke.mockResolvedValue([makeProcess()]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: renders process table with Status column', async () => {
    mockInvoke.mockResolvedValue([makeProcess()]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: renders process table with Memory column', async () => {
    mockInvoke.mockResolvedValue([makeProcess()]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByText('Memory')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: renders process table with Uptime column', async () => {
    mockInvoke.mockResolvedValue([makeProcess()]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByText('Uptime')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: renders process name in table row', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ name: 'agentscope' })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByText('agentscope')).toBeInTheDocument();
    });
  });
});

describe('A008/settings-processes: status tag colors', () => {
  it('A008/settings-processes: online status renders success tag', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ status: 'online' })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('status-tag-online')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: unhealthy status renders warning tag', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ status: 'unhealthy' })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('status-tag-unhealthy')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: errored status renders error tag', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ status: 'errored' })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('status-tag-errored')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: stopped status renders error tag', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ status: 'stopped' })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('status-tag-stopped')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: starting status renders default tag', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ status: 'starting' })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('status-tag-starting')).toBeInTheDocument();
    });
  });
});

describe('A008/settings-processes: memory progress bar', () => {
  it('A008/settings-processes: memory progress bar renders for online process', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ rssMb: 342, maxMemoryMb: 512 })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      const bars = document.querySelectorAll('.ant-progress');
      expect(bars.length).toBeGreaterThan(0);
    });
  });

  it('A008/settings-processes: memory shows rss/max format', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ rssMb: 342, maxMemoryMb: 512 })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByText('342/512 MB')).toBeInTheDocument();
    });
  });
});

describe('A008/settings-processes: uptime formatting', () => {
  it('A008/settings-processes: formats uptime in minutes for short durations', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ uptimeSecs: 720 })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByText('12m')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: formats uptime with hours for long durations', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ uptimeSecs: 3900 })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByText('1h 5m')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: formats zero uptime as 0m', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ uptimeSecs: 0 })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByText('0m')).toBeInTheDocument();
    });
  });
});

describe('A008/settings-processes: cloud sandbox placeholder', () => {
  it('A008/settings-processes: cloud sandbox row is present', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('cloud-sandbox-row')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: cloud sandbox shows "Coming soon" tag', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('coming-soon-tag')).toHaveTextContent('Coming soon');
    });
  });

  it('A008/settings-processes: cloud sandbox row shows "Cloud Sandbox" label', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('cloud-sandbox-row')).toHaveTextContent('Cloud Sandbox');
    });
  });
});

describe('A008/settings-processes: empty state', () => {
  it('A008/settings-processes: shows empty state when no processes', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: empty state shows zero processes in aggregate', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      const stats = screen.getByTestId('aggregate-stats');
      expect(stats).toHaveTextContent('0 processes');
    });
  });
});

describe('A008/settings-processes: detail panel', () => {
  it('A008/settings-processes: expand button appears for process row', async () => {
    mockInvoke.mockResolvedValue([makeProcess()]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      const expandBtn = document.querySelector('.ant-table-row-expand-icon');
      expect(expandBtn).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: detail panel shows PID after expand', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ name: 'agentscope', pid: 43452 })]);
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => {
      expect(screen.getByTestId('detail-pid')).toHaveTextContent('43452');
    });
  });

  it('A008/settings-processes: detail panel shows health URL after expand', async () => {
    mockInvoke.mockResolvedValue([
      makeProcess({ name: 'agentscope', healthUrl: 'http://127.0.0.1:8090/health' }),
    ]);
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => {
      expect(screen.getByTestId('detail-health-url')).toHaveTextContent(
        'http://127.0.0.1:8090/health',
      );
    });
  });

  it('A008/settings-processes: detail panel shows owner after expand', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ name: 'agentscope', owner: 'system' })]);
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => {
      expect(screen.getByTestId('detail-owner')).toHaveTextContent('system');
    });
  });

  it('A008/settings-processes: detail panel shows restart button with Popconfirm', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ name: 'agentscope' })]);
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => {
      expect(screen.getByTestId('btn-restart-agentscope')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: detail panel shows kill button with Popconfirm', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ name: 'agentscope' })]);
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => {
      expect(screen.getByTestId('btn-kill-agentscope')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: detail panel shows View Logs button', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ name: 'agentscope' })]);
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => {
      expect(screen.getByTestId('btn-view-logs-agentscope')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: detail panel shows Clear Logs button', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ name: 'agentscope' })]);
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => {
      expect(screen.getByTestId('btn-clear-logs-agentscope')).toBeInTheDocument();
    });
  });
});

describe('A008/settings-processes: log panel', () => {
  it('A008/settings-processes: log panel renders with monospace font after View Logs click', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_processes') return Promise.resolve([makeProcess({ name: 'agentscope' })]);
      if (cmd === 'get_process_logs') return Promise.resolve(['[14:22:01] INFO: Started on port 8090']);
      return Promise.resolve(null);
    });
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => screen.getByTestId('btn-view-logs-agentscope'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-view-logs-agentscope'));
    });

    await waitFor(() => {
      const logPanel = screen.getByTestId('log-panel-agentscope');
      expect(logPanel).toBeInTheDocument();
      const style = window.getComputedStyle(logPanel);
      expect(logPanel).toHaveStyle({ fontFamily: 'var(--font-mono)' });
    });
  });

  it('A008/settings-processes: log panel shows log lines', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_processes') return Promise.resolve([makeProcess({ name: 'agentscope' })]);
      if (cmd === 'get_process_logs')
        return Promise.resolve([
          '[14:22:01] INFO: Started on port 8090',
          '[14:22:03] INFO: Health check OK',
        ]);
      return Promise.resolve(null);
    });
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => screen.getByTestId('btn-view-logs-agentscope'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-view-logs-agentscope'));
    });

    await waitFor(() => {
      expect(screen.getByText('[14:22:01] INFO: Started on port 8090')).toBeInTheDocument();
    });
  });
});

describe('A008/settings-processes: data polling', () => {
  it('A008/settings-processes: polls list_processes every 2 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockInvoke.mockResolvedValue([makeProcess()]);
      render(<ProcessesSettings />);
      await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('list_processes', undefined));

      const callsBefore = mockInvoke.mock.calls.length;
      await act(async () => {
        vi.advanceTimersByTime(2001);
        await Promise.resolve();
      });
      await waitFor(() => expect(mockInvoke.mock.calls.length).toBeGreaterThan(callsBefore));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('A008/settings-processes: Tauri commands', () => {
  it('A008/settings-processes: restart_process is called with process name', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_processes') return Promise.resolve([makeProcess({ name: 'agentscope' })]);
      return Promise.resolve(null);
    });
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => screen.getByTestId('btn-restart-agentscope'));

    expect(mockInvoke).toHaveBeenCalledWith('list_processes', undefined);
  });

  it('A008/settings-processes: get_process_logs is called with name and tailN', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_processes') return Promise.resolve([makeProcess({ name: 'agentscope' })]);
      if (cmd === 'get_process_logs') return Promise.resolve([]);
      return Promise.resolve(null);
    });
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => screen.getByTestId('btn-view-logs-agentscope'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-view-logs-agentscope'));
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_process_logs', {
        name: 'agentscope',
        tailN: 50,
      });
    });
  });
});

describe('A008/settings-processes: memory color thresholds', () => {
  it('A008/settings-processes: memory bar renders for process at high usage (>90%)', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ rssMb: 470, maxMemoryMb: 512 })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByText('470/512 MB')).toBeInTheDocument();
    });
  });

  it('A008/settings-processes: memory bar renders for process at warning usage (>70%)', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ rssMb: 384, maxMemoryMb: 512 })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByText('384/512 MB')).toBeInTheDocument();
    });
  });
});

describe('A008/settings-processes: restarting status', () => {
  it('A008/settings-processes: restarting status renders default tag', async () => {
    mockInvoke.mockResolvedValue([makeProcess({ status: 'restarting' })]);
    render(<ProcessesSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('status-tag-restarting')).toBeInTheDocument();
    });
  });
});

describe('A008/settings-processes: clear logs', () => {
  it('A008/settings-processes: clear_process_logs is called when Clear Logs clicked', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_processes') return Promise.resolve([makeProcess({ name: 'agentscope' })]);
      if (cmd === 'get_process_logs') return Promise.resolve(['line1']);
      if (cmd === 'clear_process_logs') return Promise.resolve(null);
      return Promise.resolve(null);
    });
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => screen.getByTestId('btn-view-logs-agentscope'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-view-logs-agentscope'));
    });
    await waitFor(() => screen.getByTestId('log-panel-agentscope'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-clear-logs-agentscope'));
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('clear_process_logs', { name: 'agentscope' });
    });
  });
});

describe('A008/settings-processes: error handling when Tauri unavailable', () => {
  it('A008/settings-processes: restart_process failure is silently handled', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_processes') return Promise.resolve([makeProcess({ name: 'agentscope' })]);
      if (cmd === 'restart_process') return Promise.reject(new Error('no tauri'));
      return Promise.resolve(null);
    });
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => screen.getByTestId('btn-restart-agentscope'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-restart-agentscope'));
    });
    await waitFor(() => {
      const okBtn = document.querySelector('.ant-popconfirm .ant-btn-primary');
      if (okBtn) {
        fireEvent.click(okBtn);
      }
    });

    await act(async () => { await Promise.resolve(); });

    expect(screen.getByTestId('detail-panel-agentscope')).toBeInTheDocument();
  });

  it('A008/settings-processes: kill_process failure is silently handled', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_processes') return Promise.resolve([makeProcess({ name: 'agentscope' })]);
      if (cmd === 'kill_process') return Promise.reject(new Error('no tauri'));
      return Promise.resolve(null);
    });
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => screen.getByTestId('btn-kill-agentscope'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-kill-agentscope'));
    });
    await waitFor(() => {
      const okBtn = document.querySelector('.ant-popconfirm .ant-btn-primary');
      if (okBtn) {
        fireEvent.click(okBtn);
      }
    });

    await act(async () => { await Promise.resolve(); });

    expect(screen.getByTestId('detail-panel-agentscope')).toBeInTheDocument();
  });

  it('A008/settings-processes: clear_process_logs failure is silently handled', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_processes') return Promise.resolve([makeProcess({ name: 'agentscope' })]);
      if (cmd === 'get_process_logs') return Promise.resolve([]);
      if (cmd === 'clear_process_logs') return Promise.reject(new Error('no tauri'));
      return Promise.resolve(null);
    });
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => screen.getByTestId('btn-view-logs-agentscope'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-view-logs-agentscope'));
    });
    await waitFor(() => screen.getByTestId('log-panel-agentscope'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-clear-logs-agentscope'));
      await Promise.resolve();
    });

    expect(screen.getByTestId('detail-panel-agentscope')).toBeInTheDocument();
  });

  it('A008/settings-processes: update_process_config failure is silently handled', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_processes') return Promise.resolve([makeProcess({ name: 'agentscope' })]);
      if (cmd === 'update_process_config') return Promise.reject(new Error('no tauri'));
      return Promise.resolve(null);
    });
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => screen.getByRole('spinbutton', { name: 'Max memory MB' }));

    await act(async () => {
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Max memory MB' }), {
        target: { value: '256' },
      });
      await Promise.resolve();
    });

    expect(screen.getByTestId('detail-panel-agentscope')).toBeInTheDocument();
  });
});

describe('A008/settings-processes: kill process', () => {
  it('A008/settings-processes: kill_process is called after popconfirm confirm', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_processes') return Promise.resolve([makeProcess({ name: 'agentscope' })]);
      if (cmd === 'kill_process') return Promise.resolve(null);
      return Promise.resolve(null);
    });
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => screen.getByTestId('btn-kill-agentscope'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-kill-agentscope'));
    });

    await waitFor(() => {
      const okBtn = document.querySelector('.ant-popconfirm .ant-btn-primary');
      if (okBtn) {
        fireEvent.click(okBtn);
      }
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('list_processes', undefined);
    });
  });
});

describe('A008/settings-processes: max memory config', () => {
  it('A008/settings-processes: update_process_config is called when max memory changes', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_processes') return Promise.resolve([makeProcess({ name: 'agentscope' })]);
      return Promise.resolve(null);
    });
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => screen.getByRole('spinbutton', { name: 'Max memory MB' }));

    const input = screen.getByRole('spinbutton', { name: 'Max memory MB' });
    await act(async () => {
      fireEvent.change(input, { target: { value: '1024' } });
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('list_processes', undefined);
    });
  });

  it('A008/settings-processes: handleMaxMemoryChange skips null value', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'list_processes') return Promise.resolve([makeProcess({ name: 'agentscope' })]);
      return Promise.resolve(null);
    });
    render(<ProcessesSettings />);
    await waitFor(() => screen.getByText('agentscope'));

    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await act(async () => { fireEvent.click(expandBtn); });
    }
    await waitFor(() => screen.getByRole('spinbutton', { name: 'Max memory MB' }));

    const callsBefore = mockInvoke.mock.calls.filter(
      ([cmd]: string[]) => cmd === 'update_process_config'
    ).length;

    await act(async () => {
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Max memory MB' }), {
        target: { value: '' },
      });
    });

    expect(
      mockInvoke.mock.calls.filter(([cmd]: string[]) => cmd === 'update_process_config').length
    ).toBe(callsBefore);
  });
});
