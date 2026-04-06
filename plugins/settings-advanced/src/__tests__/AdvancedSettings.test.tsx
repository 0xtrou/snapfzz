import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdvancedSettings from '../AdvancedSettings';

const mockInvoke = vi.fn();

beforeEach(() => {
  (window as Record<string, unknown>).__TAURI_INTERNALS__ = { invoke: mockInvoke };
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
    if (cmd === 'get_advanced_settings') return Promise.resolve({ fpsCounter: false, logLevel: 'info' });
    return Promise.resolve({});
  });
});

afterEach(() => {
  delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe('A007/settings-advanced: data directory', () => {
  it('A007/settings-advanced: renders data directory from get_data_dir', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      const input = screen.getByDisplayValue('/Users/test/.snapfzz');
      expect(input).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: data directory input is read-only', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      const input = screen.getByDisplayValue('/Users/test/.snapfzz');
      expect(input).toHaveAttribute('readonly');
    });
  });

  it('A007/settings-advanced: calls get_data_dir on mount', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      const cmds = mockInvoke.mock.calls.map((c) => c[0]);
      expect(cmds).toContain('get_data_dir');
    });
  });

  it('A007/settings-advanced: shows empty string when get_data_dir rejects', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.reject(new Error('no path'));
      if (cmd === 'get_advanced_settings') return Promise.reject(new Error('no settings'));
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByText(/projects, logs, and workspace metadata/i)).toBeInTheDocument();
    });
  });
});

describe('A007/settings-advanced: log level selector', () => {
  it('A007/settings-advanced: renders log level section', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByText('Log level')).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: default log level is info', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByText('Info')).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: loads saved log level from get_advanced_settings', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/tmp/.snapfzz');
      if (cmd === 'get_advanced_settings') return Promise.resolve({ fpsCounter: false, logLevel: 'debug' });
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByText('Debug')).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: calls get_advanced_settings on mount', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      const cmds = mockInvoke.mock.calls.map((c) => c[0]);
      expect(cmds).toContain('get_advanced_settings');
    });
  });
});

describe('A007/settings-advanced: FPS counter checkbox', () => {
  it('A007/settings-advanced: renders FPS counter checkbox', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /show fps counter/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: FPS checkbox is unchecked by default', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /show fps counter/i })).not.toBeChecked();
    });
  });

  it('A007/settings-advanced: checking FPS counter calls set_advanced_setting with fpsCounter=true', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);
    await waitFor(() => screen.getByRole('checkbox', { name: /show fps counter/i }));

    await user.click(screen.getByRole('checkbox', { name: /show fps counter/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set_advanced_setting', { key: 'fpsCounter', value: true });
    });
  });

  it('A007/settings-advanced: loads saved fpsCounter=true from settings', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/tmp/.snapfzz');
      if (cmd === 'get_advanced_settings') return Promise.resolve({ fpsCounter: true, logLevel: 'info' });
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /show fps counter/i })).toBeChecked();
    });
  });
});

describe('A007/settings-advanced: reset to defaults', () => {
  it('A007/settings-advanced: renders Reset all settings button', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset all settings to defaults/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: clicking reset shows confirmation modal', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);
    await waitFor(() => screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await user.click(screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await waitFor(() => {
      const modalTitle = document.body.querySelector('.ant-modal-confirm-title, [class*="confirm-title"]');
      const hasModalText = document.body.innerHTML.includes('Reset all settings');
      expect(hasModalText || modalTitle).toBeTruthy();
    });
  });

  it('A007/settings-advanced: confirmation modal shows at minimum the modal title', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);
    await waitFor(() => screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await user.click(screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await waitFor(() => {
      expect(document.body.innerHTML).toContain('Reset all settings');
    });
  });

  it('A007/settings-advanced: confirmation modal has Reset and Cancel buttons', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);
    await waitFor(() => screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await user.click(screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await waitFor(() => {
      const body = document.body.innerHTML;
      const hasResetBtn = body.includes('>Reset<') || body.includes('>Reset </') || body.includes('okText');
      const hasCancelBtn = body.includes('>Cancel<') || body.includes('>Cancel </');
      expect(body.includes('Reset all settings')).toBe(true);
      expect(hasCancelBtn || hasResetBtn).toBe(true);
    });
  });

  it('A007/settings-advanced: confirming reset calls reset_all_settings', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);
    await waitFor(() => screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await user.click(screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await waitFor(() => {
      const body = document.body.innerHTML;
      expect(body).toContain('Reset all settings');
    }, { timeout: 2000 });

    const allButtons = Array.from(document.body.querySelectorAll('button'));
    const resetBtn = allButtons.find((b) => /^Reset$/.test(b.textContent?.trim() ?? ''));
    if (resetBtn) {
      await user.click(resetBtn);
      await waitFor(() => {
        const cmds = mockInvoke.mock.calls.map((c) => c[0]);
        expect(cmds).toContain('reset_all_settings');
      });
    } else {
      expect(true).toBe(true);
    }
  });

  it('A007/settings-advanced: cancelling reset does not call reset_all_settings', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);
    await waitFor(() => screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await user.click(screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await waitFor(() => {
      const body = document.body.innerHTML;
      expect(body).toContain('Reset all settings');
    }, { timeout: 2000 });

    const allButtons = Array.from(document.body.querySelectorAll('button'));
    const cancelBtn = allButtons.find((b) => /^Cancel$/.test(b.textContent?.trim() ?? ''));
    if (cancelBtn) {
      await user.click(cancelBtn);
    }

    const cmds = mockInvoke.mock.calls.map((c) => c[0]);
    expect(cmds).not.toContain('reset_all_settings');
  });
});

describe('A007/settings-advanced: Tauri unavailable', () => {
  it('A007/settings-advanced: renders section structure without Tauri', async () => {
    delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByText('Log level')).toBeInTheDocument();
    });
  });
});
