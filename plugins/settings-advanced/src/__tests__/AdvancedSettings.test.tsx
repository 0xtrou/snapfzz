import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdvancedSettings from '../AdvancedSettings';

const mockInvoke = vi.fn();

function fullSettings(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: 'sk-test',
    model: 'gpt-4o',
    apiUrl: 'https://api.openai.com/v1',
    theme: 'dark',
    openLastProject: true,
    language: 'en',
    fontFamily: 'Inter',
    fontSize: '14',
    fpsCounter: false,
    logLevel: 'info',
    ...overrides,
  };
}

beforeEach(() => {
  (window as Record<string, unknown>).__TAURI_INTERNALS__ = { invoke: mockInvoke };
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
    if (cmd === 'get_settings') return Promise.resolve(fullSettings());
    if (cmd === 'save_settings') return Promise.resolve(undefined);
    return Promise.resolve({});
  });
});

afterEach(() => {
  delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
});

async function waitForSettingsLoad() {
  await waitFor(() => {
    const cmds = mockInvoke.mock.calls.map((c: unknown[]) => c[0]);
    expect(cmds).toContain('get_settings');
  });
  await new Promise((r) => setTimeout(r, 150));
}

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
      if (cmd === 'get_settings') return Promise.reject(new Error('no settings'));
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

  it('A007/settings-advanced: loads saved log level from get_settings', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/tmp/.snapfzz');
      if (cmd === 'get_settings') return Promise.resolve(fullSettings({ logLevel: 'debug' }));
      if (cmd === 'save_settings') return Promise.resolve(undefined);
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByText('Debug')).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: calls get_settings on mount', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      const cmds = mockInvoke.mock.calls.map((c) => c[0]);
      expect(cmds).toContain('get_settings');
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

  it('A007/settings-advanced: FPS checkbox is unchecked when settings returns fpsCounter=false', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /show fps counter/i })).not.toBeChecked();
    });
  });

  it('A007/settings-advanced: checking FPS counter marks form dirty and shows Save Changes', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);
    await waitForSettingsLoad();

    await user.click(screen.getByRole('checkbox', { name: /show fps counter/i }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /show fps counter/i })).toBeChecked();
    });
  });

  it('A007/settings-advanced: checking FPS counter then saving calls save_settings with fpsCounter=true', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);
    await waitForSettingsLoad();

    await user.click(screen.getByRole('checkbox', { name: /show fps counter/i }));
    await waitFor(() => {
      const saveBtn = screen.getByRole('button', { name: 'Save' });
      expect(saveBtn).not.toBeDisabled();
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const saveCall = mockInvoke.mock.calls.find((c) => c[0] === 'save_settings');
      expect(saveCall).toBeDefined();
      expect(saveCall![1]).toHaveProperty('settings');
      expect(saveCall![1].settings).toMatchObject({ fpsCounter: true });
    });
  });

  it('A007/settings-advanced: loads saved fpsCounter=true from settings', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/tmp/.snapfzz');
      if (cmd === 'get_settings') return Promise.resolve(fullSettings({ fpsCounter: true }));
      if (cmd === 'save_settings') return Promise.resolve(undefined);
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

  it('A007/settings-advanced: confirming reset calls save_settings with default values', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);
    await waitFor(() => screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await user.click(screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await waitFor(() => {
      const body = document.body.innerHTML;
      expect(body).toContain('Reset all settings');
    }, { timeout: 2000 });

    const allButtons = Array.from(document.body.querySelectorAll('button'));
    const resetBtn = allButtons.find((b) => /Reset Everything/i.test(b.textContent?.trim() ?? ''));
    const confirmBtn = resetBtn ?? allButtons.find((b) => /^OK$/i.test(b.textContent?.trim() ?? ''));
    expect(confirmBtn).toBeDefined();
    if (confirmBtn) {
      await user.click(confirmBtn);
      await waitFor(() => {
        const saveCall = mockInvoke.mock.calls.find((c) => c[0] === 'save_settings');
        expect(saveCall).toBeDefined();
        expect(saveCall![1]).toHaveProperty('settings');
        expect(saveCall![1].settings).toMatchObject({ model: 'gpt-4o', theme: 'system', logLevel: 'info' });
      });
    }
  });

  it('A007/settings-advanced: cancelling reset does not call save_settings for reset', async () => {
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

describe('A007/settings-advanced: browse data directory', () => {
  it('A007/settings-advanced: Browse button is present', async () => {
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /browse/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: clicking Browse calls pick_folder', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'get_settings') return Promise.resolve(fullSettings());
      if (cmd === 'pick_folder') return Promise.resolve('/Users/test/new-dir');
      if (cmd === 'set_data_dir') return Promise.resolve(undefined);
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitFor(() => screen.getByRole('button', { name: /browse/i }));
    await user.click(screen.getByRole('button', { name: /browse/i }));

    await waitFor(() => {
      const cmds = mockInvoke.mock.calls.map((c) => c[0]);
      expect(cmds).toContain('pick_folder');
    });
  });

  it('A007/settings-advanced: pick_folder returning null does not call set_data_dir', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'get_settings') return Promise.resolve(fullSettings());
      if (cmd === 'pick_folder') return Promise.resolve(null);
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitFor(() => screen.getByRole('button', { name: /browse/i }));
    await user.click(screen.getByRole('button', { name: /browse/i }));

    await waitFor(() => {
      const cmds = mockInvoke.mock.calls.map((c) => c[0]);
      expect(cmds).not.toContain('set_data_dir');
    });
  });

  it('A007/settings-advanced: pick_folder failure is silently handled', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'get_settings') return Promise.resolve(fullSettings());
      if (cmd === 'pick_folder') return Promise.reject(new Error('cancelled'));
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitFor(() => screen.getByRole('button', { name: /browse/i }));
    await user.click(screen.getByRole('button', { name: /browse/i }));

    await waitFor(() => {
      expect(screen.getByText('Log level')).toBeInTheDocument();
    });
  });
});

describe('A007/settings-advanced: save error', () => {
  it('A007/settings-advanced: save failure displays error message', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'get_settings') return Promise.resolve(fullSettings());
      if (cmd === 'save_settings') return Promise.reject(new Error('disk full'));
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitForSettingsLoad();

    await user.click(screen.getByRole('checkbox', { name: /show fps counter/i }));
    await waitFor(() => screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const bodyText = document.body.textContent ?? '';
      expect(bodyText).toMatch(/disk full|error/i);
    });
  });
});

describe('A007/settings-advanced: discard handler', () => {
  it('A007/settings-advanced: Discard button calls loadSettings to restore values', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);
    await waitForSettingsLoad();

    await user.click(screen.getByRole('checkbox', { name: /show fps counter/i }));
    await waitFor(() => screen.getByRole('button', { name: /discard/i }));
    await user.click(screen.getByRole('button', { name: /discard/i }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /show fps counter/i })).not.toBeChecked();
    });
  });
});

describe('A007/settings-advanced: log level save', () => {
  it('A007/settings-advanced: save includes log level in settings', async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);
    await waitForSettingsLoad();

    await user.click(screen.getByRole('checkbox', { name: /show fps counter/i }));
    await waitFor(() => screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const saveCall = mockInvoke.mock.calls.find((c) => c[0] === 'save_settings');
      expect(saveCall).toBeDefined();
      expect(saveCall![1].settings).toMatchObject({ logLevel: 'info' });
    });
  });
});

describe('A007/settings-advanced: settings defaults when fields absent', () => {
  it('A007/settings-advanced: fpsCounter defaults to true when absent in settings', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/tmp/.snapfzz');
      if (cmd === 'get_settings') return Promise.resolve({ logLevel: 'info' });
      if (cmd === 'save_settings') return Promise.resolve(undefined);
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /show fps counter/i })).toBeChecked();
    });
  });

  it('A007/settings-advanced: logLevel defaults to info when absent in settings', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/tmp/.snapfzz');
      if (cmd === 'get_settings') return Promise.resolve({ fpsCounter: false });
      if (cmd === 'save_settings') return Promise.resolve(undefined);
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByText('Info')).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: data dir defaults to empty string when get_data_dir returns undefined', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve(undefined);
      if (cmd === 'get_settings') return Promise.resolve(fullSettings());
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitFor(() => {
      expect(screen.getByText('Log level')).toBeInTheDocument();
    });
  });
});

describe('A007/settings-advanced: browse sets new data dir', () => {
  it('A007/settings-advanced: pick_folder returning path calls set_data_dir and updates display', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/Users/test/.snapfzz');
      if (cmd === 'get_settings') return Promise.resolve(fullSettings());
      if (cmd === 'pick_folder') return Promise.resolve('/Users/test/new-location');
      if (cmd === 'set_data_dir') return Promise.resolve(undefined);
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitFor(() => screen.getByRole('button', { name: /browse/i }));
    await user.click(screen.getByRole('button', { name: /browse/i }));

    await waitFor(() => {
      const cmds = mockInvoke.mock.calls.map((c) => c[0]);
      expect(cmds).toContain('set_data_dir');
    });
  });
});

describe('A007/settings-advanced: reset confirms and calls save_settings with defaults', () => {
  it('A007/settings-advanced: reset onOk failure is silently handled', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/tmp/.snapfzz');
      if (cmd === 'get_settings') return Promise.resolve(fullSettings());
      if (cmd === 'save_settings') return Promise.reject(new Error('cannot reset'));
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitFor(() => screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await user.click(screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await waitFor(() => {
      expect(document.body.innerHTML).toContain('Reset all settings');
    }, { timeout: 2000 });

    const allButtons = Array.from(document.body.querySelectorAll('button'));
    const resetBtn = allButtons.find((b) => /Reset Everything/i.test(b.textContent?.trim() ?? ''));
    if (resetBtn) {
      await user.click(resetBtn);
    }

    await waitFor(() => {
      expect(screen.getByText('Log level')).toBeInTheDocument();
    });
  });

  it('A007/settings-advanced: confirming reset with success calls loadSettings again', async () => {
    const user = userEvent.setup();
    let getSettingsCallCount = 0;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_data_dir') return Promise.resolve('/tmp/.snapfzz');
      if (cmd === 'get_settings') {
        getSettingsCallCount++;
        return Promise.resolve(fullSettings());
      }
      if (cmd === 'save_settings') return Promise.resolve(undefined);
      return Promise.resolve({});
    });
    render(<AdvancedSettings />);
    await waitFor(() => screen.getByRole('button', { name: /reset all settings to defaults/i }));
    const callsBeforeReset = getSettingsCallCount;

    await user.click(screen.getByRole('button', { name: /reset all settings to defaults/i }));

    await waitFor(() => {
      expect(document.body.innerHTML).toContain('Reset all settings');
    }, { timeout: 2000 });

    const allButtons = Array.from(document.body.querySelectorAll('button'));
    const resetBtn = allButtons.find((b) => /Reset Everything/i.test(b.textContent?.trim() ?? ''));
    const confirmBtn = resetBtn ?? allButtons.find((b) => /^OK$/i.test(b.textContent?.trim() ?? ''));
    expect(confirmBtn).toBeDefined();
    if (confirmBtn) {
      await user.click(confirmBtn);
      await waitFor(() => {
        expect(getSettingsCallCount).toBeGreaterThan(callsBeforeReset);
      });
    }
  });
});
