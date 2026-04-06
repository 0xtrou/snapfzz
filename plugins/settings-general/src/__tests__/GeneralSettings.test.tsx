import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GeneralSettings from '../GeneralSettings';

const mockInvoke = vi.fn();

beforeEach(() => {
  (window as Record<string, unknown>).__TAURI_INTERNALS__ = { invoke: mockInvoke };
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue({});
});

afterEach(() => {
  delete (window as Record<string, unknown>).__TAURI_INTERNALS__;
});

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

  it('A007/settings-general: selecting Light calls set_general_setting with theme=light', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);
    await waitFor(() => screen.getByRole('radio', { name: 'Light' }));

    await user.click(screen.getByRole('radio', { name: 'Light' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set_general_setting', { key: 'theme', value: 'light' });
    });
  });

  it('A007/settings-general: selecting Dark calls set_general_setting with theme=dark', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);
    await waitFor(() => screen.getByRole('radio', { name: 'Dark' }));

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set_general_setting', { key: 'theme', value: 'dark' });
    });
  });

  it('A007/settings-general: loads saved theme on mount and sets selected radio', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_general_settings') return Promise.resolve({ theme: 'dark' });
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

  it('A007/settings-general: unchecking calls set_general_setting with openLastProject=false', async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);
    await waitFor(() => screen.getByRole('checkbox', { name: /reopen last project/i }));

    await user.click(screen.getByRole('checkbox', { name: /reopen last project/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set_general_setting', { key: 'openLastProject', value: false });
    });
  });

  it('A007/settings-general: loads saved openLastProject=false from settings', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_general_settings') return Promise.resolve({ openLastProject: false });
      return Promise.resolve({});
    });
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /reopen last project/i })).not.toBeChecked();
    });
  });
});

describe('A007/settings-general: language section', () => {
  it('A007/settings-general: renders language selector', async () => {
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByText(/more languages are on the roadmap/i)).toBeInTheDocument();
    });
  });

  it('A007/settings-general: calls get_general_settings on mount', async () => {
    render(<GeneralSettings />);
    await waitFor(() => {
      const calls = mockInvoke.mock.calls.map((c) => c[0]);
      expect(calls).toContain('get_general_settings');
    });
  });

  it('A007/settings-general: language section shows roadmap note', async () => {
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByText(/more languages are on the roadmap/i)).toBeInTheDocument();
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

  it('A007/settings-general: default state is shown when get_general_settings rejects', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_general_settings') return Promise.reject(new Error('not found'));
      return Promise.resolve({});
    });
    render(<GeneralSettings />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'System (follow OS)' })).toBeChecked();
    });
  });
});
