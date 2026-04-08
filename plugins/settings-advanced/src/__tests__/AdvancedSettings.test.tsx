import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
    if (cmd === 'save_settings') return Promise.resolve(undefined);
    if (cmd === 'pick_folder') return Promise.resolve('/Users/test/new-dir');
    if (cmd === 'set_data_dir') return Promise.resolve(undefined);
    return Promise.resolve(undefined);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('A007/settings-advanced: advanced settings sections', () => {
  it('A007/settings-advanced: renders Advanced header and data directory value', async () => {
    render(<AdvancedSettings />);

    expect(screen.getByText('Advanced')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_data_dir');
      expect(screen.getByDisplayValue('/Users/test/.snapfzz')).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: falls back to empty path when get_data_dir returns null', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve(null);
      return Promise.resolve(undefined);
    });

    render(<AdvancedSettings />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('')).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: browse button calls pick_folder with current path', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /browse/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /browse/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('pick_folder', { defaultPath: '/Users/test/.snapfzz' });
    });
  });

  it('A007/settings-advanced: browse success updates path and opens restart modal', async () => {
    const user = userEvent.setup();
    const modalInfoSpy = vi.spyOn(Modal, 'info').mockImplementation(() => {
      const destroy = vi.fn();
      const update = vi.fn();
      const then = vi.fn();
      return { destroy, update, then } as never;
    });

    render(<AdvancedSettings />);

    await user.click(await screen.findByRole('button', { name: /browse/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set_data_dir', { newPath: '/Users/test/new-dir' });
      expect(screen.getByDisplayValue('/Users/test/new-dir')).toBeInTheDocument();
      expect(modalInfoSpy).toHaveBeenCalledWith({
        title: 'Restart Required',
        content: 'Data directory changed. Please restart for changes to take effect.',
      });
    });

    modalInfoSpy.mockRestore();
  });

  it('A007/settings-advanced: reset confirmation saves defaults and emits settings-changed', async () => {
    const user = userEvent.setup();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<AdvancedSettings />);

    await user.click(await screen.findByRole('button', { name: /reset all settings to defaults/i }));
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
          agentscopeHost: '127.0.0.1',
          agentscopePort: '8090',
        }),
      });
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

    await user.click(await screen.findByRole('button', { name: /reset all settings to defaults/i }));
    await user.click(await screen.findByRole('button', { name: /reset everything/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('save_settings', expect.anything());
    });

    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'snapfzz:settings-changed' }));
    dispatchSpy.mockRestore();
  });
});
