import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from 'antd';

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

import AdvancedSettings from '../AdvancedSettings';

const defaultPlatformInfo = {
  platform: 'macos-arm64',
  platformDisplay: 'macOS (Apple Silicon)',
  downloadUrl: 'https://cef-builds.spotifycdn.com/macos-arm64/cef_binary.tar',
  installPath: '/Users/test/.snapfzz/runtime/cef',
  isInstalled: false,
};

const defaultDownloadStatus = {
  bytesDownloaded: 0,
  bytesTotal: 0,
  percent: 0,
  status: 'verifying',
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
    if (cmd === 'save_settings') return Promise.resolve(undefined);
    if (cmd === 'pick_folder') return Promise.resolve('/Users/test/new-dir');
    if (cmd === 'set_data_dir') return Promise.resolve(undefined);
    if (cmd === 'cef_download_status') return Promise.resolve(defaultDownloadStatus);
    if (cmd === 'cef_platform_info') return Promise.resolve(defaultPlatformInfo);
    if (cmd === 'cef_download_cancel') return Promise.resolve(undefined);
    return Promise.resolve(undefined);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('A007/settings-advanced: simplified advanced settings', () => {
  it('A007/settings-advanced: renders header', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.reject(new Error('first launch'));
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    expect(screen.getByText('Advanced')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_data_dir');
    });
  });

  it('A007/settings-advanced: renders data directory from get_data_dir', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('/Users/test/.snapfzz')).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: falls back to empty string when get_data_dir returns null', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve(null);
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('')).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: clicking Browse calls pick_folder', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /browse/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /browse/i }));

    await waitFor(() => {
      const commands = mockInvoke.mock.calls.map(([cmd]) => cmd);
      expect(commands).toContain('pick_folder');
    });
  });

  it('A007/settings-advanced: browse skip keeps current directory when no folder selected', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'pick_folder') return Promise.resolve(null);
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('/Users/test/.snapfzz')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /browse/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('pick_folder', { defaultPath: '/Users/test/.snapfzz' });
    });

    expect(mockInvoke).not.toHaveBeenCalledWith('set_data_dir', expect.anything());
    expect(screen.getByDisplayValue('/Users/test/.snapfzz')).toBeInTheDocument();
  });

  it('A007/settings-advanced: browse failure is swallowed', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'pick_folder') return Promise.reject(new Error('dialog failed'));
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /browse/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /browse/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('pick_folder', { defaultPath: '/Users/test/.snapfzz' });
    });

    expect(mockInvoke).not.toHaveBeenCalledWith('set_data_dir', expect.anything());
  });

  it('A007/settings-advanced: browse success updates directory and shows restart modal', async () => {
    const user = userEvent.setup();
    const modalInfoSpy = vi.spyOn(Modal, 'info').mockImplementation(() => {
      const destroy = vi.fn();
      const update = vi.fn();
      const then = vi.fn();
      return { destroy, update, then } as never;
    });

    render(<AdvancedSettings />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('/Users/test/.snapfzz')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /browse/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set_data_dir', { newPath: '/Users/test/new-dir' });
    });

    expect(screen.getByDisplayValue('/Users/test/new-dir')).toBeInTheDocument();
    expect(modalInfoSpy).toHaveBeenCalledWith({
      title: 'Restart Required',
      content: 'Data directory changed. Please restart for changes to take effect.',
    });

    modalInfoSpy.mockRestore();
  });

  it('A007/settings-advanced: reset confirmation saves defaults', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset all settings to defaults/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /reset all settings to defaults/i }));
    await user.click(await screen.findByRole('button', { name: /reset everything/i }));

    await waitFor(() => {
      const saveCall = mockInvoke.mock.calls.find(([cmd]) => cmd === 'save_settings');
      expect(saveCall).toBeDefined();
      expect(saveCall?.[1]).toMatchObject({
        settings: expect.objectContaining({
          model: 'gpt-4o',
          theme: 'system',
          fontFamily: 'Inter',
          preset: 'auto',
        }),
      });
    });
  });

  it('A007/settings-advanced: reset emits snapfzz:settings-changed', async () => {
    const user = userEvent.setup();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<AdvancedSettings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset all settings to defaults/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /reset all settings to defaults/i }));
    await user.click(await screen.findByRole('button', { name: /reset everything/i }));

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'snapfzz:settings-changed' }));
    });

    dispatchSpy.mockRestore();
  });

  it('A007/settings-advanced: reset save failure is swallowed without dispatching event', async () => {
    const user = userEvent.setup();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'save_settings') return Promise.reject(new Error('save failed'));
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset all settings to defaults/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /reset all settings to defaults/i }));
    await user.click(await screen.findByRole('button', { name: /reset everything/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('save_settings', expect.anything());
    });

    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'snapfzz:settings-changed' }));
    dispatchSpy.mockRestore();
  });

  it('A015/settings-advanced: mini apps onboarding initial state shows download button and default message', async () => {
    render(<AdvancedSettings />);

    const section = await screen.findByTestId('miniapps-onboarding');
    expect(within(section).getByText('CEF runtime not installed. Download is required for mini apps.')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: /download cef runtime/i })).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('A015/settings-advanced: clicking download enters downloading and updates progress when still downloading', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'cef_download_start') {
        return Promise.resolve([{ bytesDownloaded: 380, bytesTotal: 1000, percent: 38, status: 'downloading' }]);
      }
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    const section = await screen.findByTestId('miniapps-onboarding');
    await act(async () => {
      await user.click(within(section).getByRole('button', { name: /download cef runtime/i }));
    });

    await waitFor(() => {
      expect(within(section).getByText('38%')).toBeInTheDocument();
      expect(within(section).getByText('Downloading CEF runtime...')).toBeInTheDocument();
      expect(within(section).getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    expect(mockInvoke).toHaveBeenCalledWith('cef_download_start');
  });

  it('A015/settings-advanced: ready state shows success message and hides action buttons', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'cef_download_start') {
        return Promise.resolve([{ bytesDownloaded: 1024, bytesTotal: 1024, percent: 100, status: 'ready' }]);
      }
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    const section = await screen.findByTestId('miniapps-onboarding');
    await act(async () => {
      await user.click(within(section).getByRole('button', { name: /download cef runtime/i }));
    });

    await waitFor(() => {
      expect(within(section).getByText('CEF runtime installed and ready.')).toBeInTheDocument();
    });

    expect(within(section).queryByRole('button', { name: /download cef runtime/i })).not.toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('A015/settings-advanced: failed status shows error and allows retry', async () => {
    const user = userEvent.setup();
    let callCount = 0;

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'cef_download_start') {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve([{ bytesDownloaded: 100, bytesTotal: 1000, percent: 10, status: 'failed' }]);
        }
        return Promise.resolve([{ bytesDownloaded: 1000, bytesTotal: 1000, percent: 100, status: 'ready' }]);
      }
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    const section = await screen.findByTestId('miniapps-onboarding');
    await act(async () => {
      await user.click(within(section).getByRole('button', { name: /download cef runtime/i }));
    });

    await waitFor(() => {
      expect(within(section).getByText('Download failed. Try again.')).toBeInTheDocument();
      expect(within(section).getByRole('button', { name: /download cef runtime/i })).toBeInTheDocument();
    });

    await act(async () => {
      await user.click(within(section).getByRole('button', { name: /download cef runtime/i }));
    });

    await waitFor(() => {
      expect(within(section).getByText('CEF runtime installed and ready.')).toBeInTheDocument();
    });
  });

  it('A015/settings-advanced: empty events and thrown errors both transition to failed state', async () => {
    const user = userEvent.setup();
    let callCount = 0;

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'cef_download_status') return Promise.resolve(defaultDownloadStatus);
      if (cmd === 'cef_platform_info') return Promise.resolve(defaultPlatformInfo);
      if (cmd === 'cef_download_start') {
        callCount += 1;
        if (callCount === 1) return Promise.resolve([]);
        return Promise.reject(new Error('network failed'));
      }
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    const section = await screen.findByTestId('miniapps-onboarding');

    await act(async () => {
      await user.click(within(section).getByRole('button', { name: /download cef runtime/i }));
    });

    await waitFor(() => {
      expect(within(section).getByText('Download did not return progress events.')).toBeInTheDocument();
    });

    await act(async () => {
      await user.click(within(section).getByRole('button', { name: /download cef runtime/i }));
    });

    await waitFor(() => {
      expect(within(section).getByText(/network failed/i)).toBeInTheDocument();
    });
  });

  it('A015/settings-advanced: cancel button calls cef_download_cancel', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'cef_download_status') return Promise.resolve(defaultDownloadStatus);
      if (cmd === 'cef_platform_info') return Promise.resolve(defaultPlatformInfo);
      if (cmd === 'cef_download_cancel') return Promise.resolve(undefined);
      if (cmd === 'cef_download_start') return new Promise(() => {});
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    const section = await screen.findByTestId('miniapps-onboarding');

    await act(async () => {
      await user.click(within(section).getByRole('button', { name: /download cef runtime/i }));
    });

    await waitFor(() => {
      expect(within(section).getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    await act(async () => {
      await user.click(within(section).getByRole('button', { name: /cancel/i }));
    });

    expect(mockInvoke).toHaveBeenCalledWith('cef_download_cancel');
  });

  it('A015/settings-advanced: ready state shows checklist and open folder button', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'cef_download_status') return Promise.resolve({ bytesDownloaded: 124000000, bytesTotal: 124000000, percent: 100, status: 'ready' });
      if (cmd === 'cef_platform_info') return Promise.resolve({ ...defaultPlatformInfo, isInstalled: true });
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    const section = await screen.findByTestId('miniapps-onboarding');

    await waitFor(() => {
      expect(within(section).getByText('CEF runtime installed and ready.')).toBeInTheDocument();
    });

    expect(within(section).getByText(/Checksum verified/)).toBeInTheDocument();
    expect(within(section).getByText(/CEF runtime ready/)).toBeInTheDocument();

    const openBtn = within(section).getByRole('button', { name: /open folder/i });
    expect(openBtn).toBeInTheDocument();

    await act(async () => {
      await user.click(openBtn);
    });

    expect(mockInvoke).toHaveBeenCalledWith('open_path', { path: '/Users/test/.snapfzz/runtime/cef' });
  });

  it('A015/settings-advanced: shows platform info descriptions', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'cef_download_status') return Promise.resolve(defaultDownloadStatus);
      if (cmd === 'cef_platform_info') return Promise.resolve(defaultPlatformInfo);
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    await waitFor(() => {
      expect(screen.getByText('macOS (Apple Silicon)')).toBeInTheDocument();
    });

    expect(screen.getByText(/cef-builds.spotifycdn.com/)).toBeInTheDocument();
    expect(screen.getByText(/\.snapfzz\/runtime\/cef/)).toBeInTheDocument();
  });

  it('A015/settings-advanced: handles mount errors gracefully', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'cef_download_status') return Promise.reject(new Error('unavailable'));
      if (cmd === 'cef_platform_info') return Promise.reject(new Error('unavailable'));
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    const section = await screen.findByTestId('miniapps-onboarding');
    expect(within(section).getByRole('button', { name: /download cef runtime/i })).toBeInTheDocument();
  });

  it('A015/settings-advanced: partial download resumes progress on mount', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'cef_download_status') return Promise.resolve({ bytesDownloaded: 50000, bytesTotal: 124000000, percent: 0.04, status: 'downloading' });
      if (cmd === 'cef_platform_info') return Promise.resolve(defaultPlatformInfo);
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    const section = await screen.findByTestId('miniapps-onboarding');

    await waitFor(() => {
      expect(within(section).getByRole('button', { name: /download cef runtime/i })).toBeInTheDocument();
    });
  });

  it('A015/settings-advanced: download progress shows bytes formatted', async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'cef_download_status') return Promise.resolve(defaultDownloadStatus);
      if (cmd === 'cef_platform_info') return Promise.resolve(defaultPlatformInfo);
      if (cmd === 'cef_download_start') {
        return Promise.resolve([{ bytesDownloaded: 50000000, bytesTotal: 124000000, percent: 40, status: 'downloading' }]);
      }
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    const section = await screen.findByTestId('miniapps-onboarding');

    await act(async () => {
      await user.click(within(section).getByRole('button', { name: /download cef runtime/i }));
    });

    await waitFor(() => {
      expect(within(section).getByText(/47\.7 MB/)).toBeInTheDocument();
      expect(within(section).getByText(/118\.3 MB/)).toBeInTheDocument();
    });
  });
});
