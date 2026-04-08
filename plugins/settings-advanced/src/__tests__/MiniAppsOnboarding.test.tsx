import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

import MiniAppsOnboarding from '../MiniAppsOnboarding';

function event(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    bytesDownloaded: 0,
    bytesTotal: 0,
    percent: 0,
    status: 'pending',
    ...overrides,
  };
}

function info(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    platform: 'macos-arm64',
    platformDisplay: 'macOS (Apple Silicon)',
    downloadUrl: 'https://cef-builds.spotifycdn.com/macos-arm64/cef_binary.tar',
    installPath: '/Users/test/.snapfzz/runtime/cef',
    isInstalled: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'cef_download_status') return Promise.resolve(event());
    if (cmd === 'cef_platform_info') return Promise.resolve(info());
    if (cmd === 'cef_download_start') return Promise.resolve([event({ status: 'ready', percent: 100, bytesDownloaded: 120 * 1024 * 1024, bytesTotal: 120 * 1024 * 1024 })]);
    if (cmd === 'cef_download_cancel') return Promise.resolve(undefined);
    if (cmd === 'open_path') return Promise.resolve(undefined);
    return Promise.resolve(undefined);
  });

});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('A007/settings-advanced: mini apps onboarding initial states', () => {
  it('A007/settings-advanced: renders not installed copy by default', async () => {
    render(<MiniAppsOnboarding />);

    expect(screen.getByText('Mini apps runtime')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('CEF runtime not installed. Download is required for mini apps.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /download cef runtime/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: renders ready state from initial status check', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'cef_download_status') {
        return Promise.resolve(event({ status: 'ready', percent: 100, bytesDownloaded: 64 * 1024 * 1024, bytesTotal: 64 * 1024 * 1024 }));
      }
      if (cmd === 'cef_platform_info') {
        return Promise.resolve(info({ isInstalled: true }));
      }
      if (cmd === 'open_path') return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    render(<MiniAppsOnboarding />);

    await waitFor(() => {
      expect(screen.getByText('CEF runtime installed and ready.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open folder/i })).toBeInTheDocument();
      expect(screen.getByText(/Download complete/)).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: shows in-progress bytes when partial status already exists', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'cef_download_status') {
        return Promise.resolve(event({ status: 'pending', percent: 25, bytesDownloaded: 512_000, bytesTotal: 1_024_000 }));
      }
      if (cmd === 'cef_platform_info') return Promise.resolve(info());
      return Promise.resolve(undefined);
    });

    render(<MiniAppsOnboarding />);

    await waitFor(() => {
      expect(screen.getByText('CEF runtime not installed. Download is required for mini apps.')).toBeInTheDocument();
      expect(mockInvoke).toHaveBeenCalledWith('cef_download_status');
    });
  });
});

describe('A007/settings-advanced: mini apps onboarding actions', () => {
  it('A007/settings-advanced: successful download reaches ready state and updates checklist', async () => {
    const user = userEvent.setup();
    render(<MiniAppsOnboarding />);

    await user.click(await screen.findByRole('button', { name: /download cef runtime/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cef_download_start');
      expect(screen.getByText('CEF runtime installed and ready.')).toBeInTheDocument();
      expect(screen.getByText('Checksum verified (SHA-256)')).toBeInTheDocument();
      expect(screen.getByText('Archive extracted')).toBeInTheDocument();
      expect(screen.getByText('CEF runtime ready')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open folder/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: empty event list reports download failure message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'cef_download_status') return Promise.resolve(event());
      if (cmd === 'cef_platform_info') return Promise.resolve(info());
      if (cmd === 'cef_download_start') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    render(<MiniAppsOnboarding />);
    await user.click(await screen.findByRole('button', { name: /download cef runtime/i }));

    await waitFor(() => {
      expect(screen.getByText('Download did not return progress events.')).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: failed event shows retry message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'cef_download_status') return Promise.resolve(event());
      if (cmd === 'cef_platform_info') return Promise.resolve(info());
      if (cmd === 'cef_download_start') return Promise.resolve([event({ status: 'failed', percent: 50, bytesDownloaded: 10, bytesTotal: 20 })]);
      return Promise.resolve(undefined);
    });

    render(<MiniAppsOnboarding />);
    await user.click(await screen.findByRole('button', { name: /download cef runtime/i }));

    await waitFor(() => {
      expect(screen.getByText('Download failed. Try again.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /download cef runtime/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: thrown download error surfaces error message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'cef_download_status') return Promise.resolve(event());
      if (cmd === 'cef_platform_info') return Promise.resolve(info());
      if (cmd === 'cef_download_start') return Promise.reject(new Error('network down'));
      return Promise.resolve(undefined);
    });

    render(<MiniAppsOnboarding />);
    await user.click(await screen.findByRole('button', { name: /download cef runtime/i }));

    await waitFor(() => {
      expect(screen.getByText('network down')).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: cancel resets progress and invokes cancel command', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'cef_download_status') return Promise.resolve(event());
      if (cmd === 'cef_platform_info') return Promise.resolve(info());
      if (cmd === 'cef_download_start') return new Promise(() => {});
      if (cmd === 'cef_download_cancel') return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    render(<MiniAppsOnboarding />);
    await user.click(await screen.findByRole('button', { name: /download cef runtime/i }));
    await user.click(await screen.findByRole('button', { name: /^cancel$/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cef_download_cancel');
      expect(screen.getByText('CEF runtime not installed. Download is required for mini apps.')).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: open folder uses install path when ready', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'cef_download_status') {
        return Promise.resolve(event({ status: 'ready', percent: 100, bytesDownloaded: 64 * 1024 * 1024, bytesTotal: 64 * 1024 * 1024 }));
      }
      if (cmd === 'cef_platform_info') {
        return Promise.resolve(info({ isInstalled: true, installPath: '/tmp/cef-runtime' }));
      }
      if (cmd === 'open_path') return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    render(<MiniAppsOnboarding />);
    await user.click(await screen.findByRole('button', { name: /open folder/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('open_path', { path: '/tmp/cef-runtime' });
    });
  });

  it('A007/settings-advanced: load failures for initial status and platform info are swallowed', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'cef_download_status') return Promise.reject(new Error('status unavailable'));
      if (cmd === 'cef_platform_info') return Promise.reject(new Error('platform unavailable'));
      return Promise.resolve(undefined);
    });

    render(<MiniAppsOnboarding />);

    await waitFor(() => {
      expect(screen.getByText('CEF runtime not installed. Download is required for mini apps.')).toBeInTheDocument();
    });
  });
});
