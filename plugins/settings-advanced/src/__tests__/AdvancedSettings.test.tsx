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

describe('A007/settings-advanced: simplified advanced settings', () => {
  it('A007/settings-advanced: renders header', () => {
    render(<AdvancedSettings />);
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('A007/settings-advanced: renders data directory from get_data_dir', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('/Users/test/.snapfzz')).toBeInTheDocument();
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
});
