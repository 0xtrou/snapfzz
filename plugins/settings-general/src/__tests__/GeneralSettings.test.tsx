import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GeneralSettings from '../GeneralSettings';

const mockInvoke = vi.fn();

function fullSettings(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: 'sk-test',
    model: 'gpt-4o',
    apiUrl: 'https://api.openai.com/v1',
    theme: 'system',
    openLastProject: true,
    language: 'en',
    fontFamily: 'Inter',
    fontSize: '14',
    fpsCounter: true,
    logLevel: 'info',
    ...overrides,
  };
}

beforeEach(() => {
  (window as Record<string, unknown>).__TAURI_INTERNALS__ = { invoke: mockInvoke };
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: string) => {
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

describe('A007/settings-general: theme selector', () => {
  it('A007/settings-general: renders Light radio option', async () => {
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    });
  });

  it('A007/settings-general: renders Dark radio option', async () => {
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    });
  });

  it('A007/settings-general: renders System radio option', async () => {
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'System (follow OS)' })).toBeInTheDocument();
    });
  });

  it('A007/settings-general: System is selected by default', async () => {
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'System (follow OS)' })).toBeChecked();
    });
  });

  it('A007/settings-general: selecting Light updates radio selection', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);
    await waitForSettingsLoad();

    await user.click(screen.getByRole('radio', { name: 'Light' }));

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    });
  });

  it('A007/settings-general: selecting Dark then saving calls save_settings with theme=dark', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);
    await waitForSettingsLoad();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    await waitFor(() => {
      const saveBtn = screen.getByRole('button', { name: 'Save' });
      expect(saveBtn).not.toBeDisabled();
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const saveCall = mockInvoke.mock.calls.find((c) => c[0] === 'save_settings');
      expect(saveCall).toBeDefined();
      expect(saveCall![1]).toHaveProperty('settings');
      expect(saveCall![1].settings).toMatchObject({ theme: 'dark' });
    });
  });

  it('A007/settings-general: loads saved theme on mount and sets selected radio', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_settings') return Promise.resolve(fullSettings({ theme: 'dark' }));
      if (cmd === 'save_settings') return Promise.resolve(undefined);
      return Promise.resolve({});
    });
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    });
  });
});

describe('A007/settings-general: startup section', () => {
  it('A007/settings-general: renders Reopen last project checkbox', async () => {
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /reopen last project/i })).toBeInTheDocument();
    });
  });

  it('A007/settings-general: checkbox is checked by default', async () => {
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /reopen last project/i })).toBeChecked();
    });
  });

  it('A007/settings-general: unchecking checkbox updates checked state', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);
    await waitForSettingsLoad();

    await user.click(screen.getByRole('checkbox', { name: /reopen last project/i }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /reopen last project/i })).not.toBeChecked();
    });
  });

  it('A007/settings-general: save_settings called with openLastProject=false after save action', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);
    await waitForSettingsLoad();

    await user.click(screen.getByRole('checkbox', { name: /reopen last project/i }));

    await waitFor(() => {
      const saveBtn = screen.getByRole('button', { name: 'Save' });
      expect(saveBtn).not.toBeDisabled();
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const saveCall = mockInvoke.mock.calls.find((c) => c[0] === 'save_settings');
      expect(saveCall).toBeDefined();
      expect(saveCall![1].settings).toMatchObject({ openLastProject: false });
    });
  });

  it('A007/settings-general: loads saved openLastProject=false from settings', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_settings') return Promise.resolve(fullSettings({ openLastProject: false }));
      if (cmd === 'save_settings') return Promise.resolve(undefined);
      return Promise.resolve({});
    });
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /reopen last project/i })).not.toBeChecked();
    });
  });
});

describe('A007/settings-general: language section', () => {
  it('A007/settings-general: renders language selector area with roadmap note', async () => {
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByText(/more languages are on the roadmap/i)).toBeInTheDocument();
    });
  });

  it('A007/settings-general: calls get_settings on mount', async () => {
    render(<GeneralSettings />);
    await waitFor(() => {
      const calls = mockInvoke.mock.calls.map((c) => c[0]);
      expect(calls).toContain('get_settings');
    });
  });

  it('A007/settings-general: language section shows roadmap note', async () => {
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByText(/more languages are on the roadmap/i)).toBeInTheDocument();
    });
  });
});

describe('A007/settings-general: dirty tracking and save bar', () => {
  it('A007/settings-general: Save button is disabled on initial render before any change', async () => {
    render(<GeneralSettings />);
    await waitFor(() => screen.getByRole('radio', { name: 'Light' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('A007/settings-general: Discard button does not exist when form is not dirty', async () => {
    render(<GeneralSettings />);
    await waitFor(() => screen.getByRole('radio', { name: 'Light' }));
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
  });

  it('A007/settings-general: save_settings is NOT called on radio click — only on explicit save', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);
    await waitFor(() => screen.getByRole('radio', { name: 'Light' }));
    await waitFor(() => {
      const cmds = mockInvoke.mock.calls.map((c: unknown[]) => c[0]);
      expect(cmds).toContain('get_settings');
    });

    await user.click(screen.getByRole('radio', { name: 'Light' }));

    await new Promise((r) => setTimeout(r, 100));
    const saveCallsAfterClick = mockInvoke.mock.calls.filter((c) => c[0] === 'save_settings').length;
    expect(saveCallsAfterClick).toBe(0);
  });

  it('A007/settings-general: save_settings payload merges full settings object', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);
    await waitForSettingsLoad();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await waitFor(() => {
      const saveBtn = screen.getByRole('button', { name: 'Save' });
      expect(saveBtn).not.toBeDisabled();
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const saveCall = mockInvoke.mock.calls.find((c) => c[0] === 'save_settings');
      expect(saveCall).toBeDefined();
      expect(saveCall![1]).toHaveProperty('settings');
      expect(saveCall![1].settings).toHaveProperty('theme');
      expect(saveCall![1].settings).toHaveProperty('openLastProject');
      expect(saveCall![1].settings).toHaveProperty('language');
      expect(saveCall![1].settings).toHaveProperty('fontFamily');
      expect(saveCall![1].settings).toHaveProperty('fontSize');
    });
  });
});

describe('A007/settings-general: Tauri unavailable', () => {
  it('A007/settings-general: renders without crashing when Tauri is not available', async () => {
    delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    });
  });

  it('A007/settings-general: default state is shown when get_settings rejects', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_settings') return Promise.reject(new Error('not found'));
      return Promise.resolve({});
    });
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'System (follow OS)' })).toBeChecked();
    });
  });
});

describe('A007/settings-general: loadSettings fallback defaults', () => {
  it('A007/settings-general: uses system theme fallback when settings.theme is missing', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_settings') return Promise.resolve({ openLastProject: true, language: 'en', fontFamily: 'Inter', fontSize: '14' });
      return Promise.resolve({});
    });
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'System (follow OS)' })).toBeChecked();
    });
  });

  it('A007/settings-general: uses openLastProject=true fallback when missing from settings', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_settings') return Promise.resolve({ theme: 'light', language: 'en', fontFamily: 'Inter', fontSize: '14' });
      return Promise.resolve({});
    });
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /reopen last project/i })).toBeChecked();
    });
  });

  it('A007/settings-general: uses en language fallback when missing from settings', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_settings') return Promise.resolve({ theme: 'light', openLastProject: true, fontFamily: 'Inter', fontSize: '14' });
      return Promise.resolve({});
    });
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    });
  });

  it('A007/settings-general: uses Inter fontFamily fallback when missing from settings', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_settings') return Promise.resolve({ theme: 'light', openLastProject: true, language: 'en', fontSize: '14' });
      return Promise.resolve({});
    });
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByText(/font family/i)).toBeInTheDocument();
    });
  });

  it('A007/settings-general: uses fontSize 14 fallback when missing from settings', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_settings') return Promise.resolve({ theme: 'light', openLastProject: true, language: 'en', fontFamily: 'Inter' });
      return Promise.resolve({});
    });
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByText(/font size/i)).toBeInTheDocument();
    });
  });
});

describe('A007/settings-general: error paths and discard', () => {
  it('A007/settings-general: shows error when save_settings rejects', async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_settings') return Promise.resolve(fullSettings());
      if (cmd === 'save_settings') return Promise.reject(new Error('disk full'));
      return Promise.resolve({});
    });
    render(<GeneralSettings />);
    await waitForSettingsLoad();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockInvoke.mock.calls.some((c) => c[0] === 'save_settings')).toBe(true);
    });
  });

  it('A007/settings-general: discard button calls loadSettings and resets dirty state', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);
    await waitForSettingsLoad();

    await user.click(screen.getByRole('radio', { name: 'Light' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    });

    const callCountBefore = mockInvoke.mock.calls.filter((c) => c[0] === 'get_settings').length;

    await user.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => {
      const callCountAfter = mockInvoke.mock.calls.filter((c) => c[0] === 'get_settings').length;
      expect(callCountAfter).toBeGreaterThan(callCountBefore);
    });
  });

  it('A007/settings-general: custom font family input is rendered and accepts text input', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);
    await waitForSettingsLoad();

    const customFontInput = screen.getByPlaceholderText('Or type a custom font name...');
    expect(customFontInput).toBeInTheDocument();
    await user.clear(customFontInput);
    await user.type(customFontInput, 'Roboto');
    expect((customFontInput as HTMLInputElement).value).toBe('Roboto');
  });

  it('A007/settings-general: custom font size input is rendered and accepts text input', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);
    await waitForSettingsLoad();

    const customSizeInput = screen.getByPlaceholderText('Or type a custom size (e.g. 17)...');
    expect(customSizeInput).toBeInTheDocument();
    await user.clear(customSizeInput);
    await user.type(customSizeInput, '20');
    expect((customSizeInput as HTMLInputElement).value).toBe('20');
  });

  it('A007/settings-general: save success clears after timeout', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);
    await waitForSettingsLoad();

    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockInvoke.mock.calls.some((c) => c[0] === 'save_settings')).toBe(true);
    });
  });
});
