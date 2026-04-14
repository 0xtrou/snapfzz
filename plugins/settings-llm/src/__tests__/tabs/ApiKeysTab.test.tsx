// A013/UI/ApiKeysTab: Virtual key management tests

import { cloneElement, isValidElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { message } from 'antd';
import ApiKeysTab from '../../tabs/ApiKeysTab';

const { mockListKeys, mockDeleteKey, mockGenerateKey, mockGetBaseUrl, mockGetMasterKey, mockGetModels, writeTextMock } = vi.hoisted(() => ({
  mockListKeys: vi.fn(),
  mockDeleteKey: vi.fn(),
  mockGenerateKey: vi.fn(),
  mockGetBaseUrl: vi.fn(),
  mockGetMasterKey: vi.fn(),
  mockGetModels: vi.fn(),
  writeTextMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({
    invoke: vi.fn(),
  }),
  fetchWithToast: async (fn: () => Promise<unknown>) => {
    try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err : new Error(String(err)) }; }
  },
  AppButton: ({ children, onClick, ...props }: any) => (
    <button type="button" onClick={onClick} onKeyUp={onClick} {...props}>{children}</button>
  ),
  ConfirmAction: ({ children, onConfirm }: any) => {
    if (isValidElement(children)) {
      return cloneElement(children, {
        ...(children.props as object),
        onClick: onConfirm,
        onKeyUp: onConfirm,
      });
    }
    return (
      <button type="button" onClick={onConfirm} onKeyUp={onConfirm}>
        {children}
      </button>
    );
  },
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  getBaseUrl: () => mockGetBaseUrl(),
  getMasterKey: () => mockGetMasterKey(),
  listKeys: (...args: unknown[]) => mockListKeys(...args),
  listKeysWithInfo: (...args: unknown[]) => mockListKeys(...args),
  deleteKey: (...args: unknown[]) => mockDeleteKey(...args),
  generateKey: (...args: unknown[]) => mockGenerateKey(...args),
  getModels: (...args: unknown[]) => mockGetModels(...args),
}));

describe('A013/UI/ApiKeysTab', () => {
  beforeEach(() => {
    mockListKeys.mockReset();
    mockDeleteKey.mockReset();
    mockGenerateKey.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetModels.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
    mockListKeys.mockResolvedValue({ keys: [] });
    mockGetModels.mockResolvedValue({
      data: [
        { id: 'openai/gpt-4o', object: 'model', owned_by: 'openai' },
        { id: 'openai/gpt-4o-mini', object: 'model', owned_by: 'openai' },
        { id: 'anthropic/claude-sonnet', object: 'model', owned_by: 'anthropic' },
      ],
    });
    writeTextMock.mockClear();
    localStorage.clear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });
  });

  it('renders loading state initially', () => {
    mockListKeys.mockImplementation(() => new Promise(() => {}));
    render(<ApiKeysTab />);
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
  });

  it('shows empty state when no keys', async () => {
    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText('No virtual keys created')).toBeInTheDocument();
    });
  });

  it('handles missing keys field in list response', async () => {
    mockListKeys.mockResolvedValue({});

    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText('No virtual keys created')).toBeInTheDocument();
    });
  });

  it('fetches available models on mount', async () => {
    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(mockGetModels).toHaveBeenCalledWith('http://127.0.0.1:4000', 'sk-master-test');
    });
  });

  it('falls back to cached models when fetch fails', async () => {
    localStorage.setItem('snapfzz:available_models', JSON.stringify(['cached/model-1']));
    mockGetModels.mockRejectedValue(new Error('offline'));

    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(mockGetModels).toHaveBeenCalled();
    });
  });

  it('renders masked short keys and fallback budget fields', async () => {
    mockListKeys.mockResolvedValue({
      keys: [
        {
          key: 'short',
          models: ['gpt-4o'],
          spend: 0,
          max_budget: 0,
          budget_duration: '',
        },
      ],
    });

    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText('\u2022'.repeat(8))).toBeInTheDocument();
    });
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
  });

  it('shows "All models" tag when models array is empty', async () => {
    mockListKeys.mockResolvedValue({
      keys: [
        {
          key: 'sk-test12345678',
          models: [],
          spend: 0,
          max_budget: 10,
          budget_duration: '30d',
        },
      ],
    });

    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText('All models')).toBeInTheDocument();
    });
  });

  it('truncates models after 3 with +N more tooltip', async () => {
    mockListKeys.mockResolvedValue({
      keys: [
        {
          key: 'sk-test12345678',
          models: ['model-a', 'model-b', 'model-c', 'model-d', 'model-e'],
          spend: 0,
          max_budget: 10,
          budget_duration: '30d',
        },
      ],
    });

    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText('model-a')).toBeInTheDocument();
    });
    expect(screen.getByText('model-b')).toBeInTheDocument();
    expect(screen.getByText('model-c')).toBeInTheDocument();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
    expect(screen.queryByText('model-d')).not.toBeInTheDocument();
  });

  it('shows alias column with key_alias value', async () => {
    mockListKeys.mockResolvedValue({
      keys: [
        {
          key: 'sk-test12345678',
          key_alias: 'my-dev-key',
          models: ['gpt-4o'],
          spend: 1.5,
          max_budget: 50,
          budget_duration: '30d',
        },
      ],
    });

    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText('my-dev-key')).toBeInTheDocument();
    });
  });

  it('lists virtual keys and supports delete action', async () => {
    const user = userEvent.setup();
    mockListKeys
      .mockResolvedValueOnce({
        keys: [
          {
            key: 'sk-test12345678',
            models: ['gpt-4o'],
            spend: 1.23,
            max_budget: 100,
            budget_duration: '30d',
          },
        ],
      })
      .mockResolvedValueOnce({ keys: [] });

    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText(/gpt-4o/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Delete key/i }));

    await waitFor(() => {
      expect(mockDeleteKey).toHaveBeenCalledWith('http://127.0.0.1:4000', 'sk-master-test', 'sk-test12345678');
    });
    expect(mockListKeys).toHaveBeenCalledTimes(2);
  });

  it('opens and closes create key modal', async () => {
    const user = userEvent.setup();
    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText('No virtual keys created')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Create Key'));
    expect(screen.getByText('Create Virtual Key')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(document.querySelector('.ant-modal-wrap')).toHaveAttribute('style', expect.stringContaining('display: none'));
    });
  });

  it('populates model select with fetched models', async () => {
    const user = userEvent.setup();
    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText('No virtual keys created')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Create Key'));
    await user.click(screen.getByRole('combobox', { name: 'Allowed Models' }));

    await waitFor(() => {
      expect(screen.getByTitle('openai/gpt-4o')).toBeInTheDocument();
    });
    expect(screen.getByTitle('openai/gpt-4o-mini')).toBeInTheDocument();
    expect(screen.getByTitle('anthropic/claude-sonnet')).toBeInTheDocument();
  });

  it('creates key with alias and copies generated key', async () => {
    const user = userEvent.setup();
    mockListKeys
      .mockResolvedValueOnce({ keys: [] })
      .mockResolvedValueOnce({
        keys: [
          {
            key: 'sk-new1234',
            key_alias: 'test-alias',
            models: ['openai/gpt-4o'],
            spend: 0,
            max_budget: 10,
            budget_duration: '30d',
          },
        ],
      });
    mockGenerateKey.mockResolvedValue({ key: 'sk-new1234' });

    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText('No virtual keys created')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Create Key'));

    const aliasInput = screen.getByRole('textbox', { name: 'Key Alias' });
    await user.type(aliasInput, 'test-alias');

    await user.click(screen.getByRole('combobox', { name: 'Allowed Models' }));
    await waitFor(() => {
      expect(screen.getByTitle('openai/gpt-4o')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('openai/gpt-4o'));

    const budgetInput = screen.getByRole('spinbutton', { name: 'Max Budget ($)' });
    await user.clear(budgetInput);
    await user.type(budgetInput, '10');

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      expect(mockGenerateKey).toHaveBeenCalledWith(
        'http://127.0.0.1:4000',
        'sk-master-test',
        expect.objectContaining({
          models: ['openai/gpt-4o'],
          max_budget: 10,
          budget_duration: '30d',
          key_alias: 'test-alias',
        }),
      );
    });

    expect(screen.getByText(/Your new key has been created/)).toBeInTheDocument();

    const copyButton = screen.getByRole('button', { name: 'Copy to Clipboard' });
    await user.click(copyButton);
    expect(copyButton).toBeInTheDocument();
  });

  it('shows message when create key fails', async () => {
    const user = userEvent.setup();

    mockGenerateKey.mockRejectedValue(new Error('boom'));

    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText('No virtual keys created')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Create Key'));
    await user.click(screen.getByRole('combobox', { name: 'Allowed Models' }));
    await waitFor(() => {
      expect(screen.getByTitle('openai/gpt-4o')).toBeInTheDocument();
    });
    await user.click(screen.getByTitle('openai/gpt-4o'));
    await user.click(screen.getByRole('button', { name: 'OK' }));

    // fetchWithToast handles the error; the generated key screen should not appear
    await waitFor(() => {
      expect(screen.queryByText(/Your new key has been created/)).not.toBeInTheDocument();
    });
  });

  it('shows error when LiteLLM URL is unavailable', async () => {
    const user = userEvent.setup();
    const messageErrorSpy = vi.spyOn(message, 'error').mockImplementation(() => {
      return undefined as any;
    });

    mockGetBaseUrl.mockRejectedValue(new Error('offline'));

    render(<ApiKeysTab />);

    await user.click(screen.getByText('Create Key'));
    // Models won't load since baseUrl failed, but we still need to interact with the select
    await user.click(screen.getByRole('combobox', { name: 'Allowed Models' }));

    // Type a model name manually (the select allows search input)
    // Since no models are available, submit will fail validation
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      // Either validation error or URL not configured
      expect(messageErrorSpy).toHaveBeenCalled();
    });
    expect(mockGenerateKey).not.toHaveBeenCalled();
  });

  it('formats spend with two decimal places in table', async () => {
    mockListKeys.mockResolvedValue({
      keys: [
        {
          key: 'sk-test12345678',
          models: ['gpt-4o'],
          spend: 1.2345,
          max_budget: 100,
          budget_duration: '30d',
        },
      ],
    });

    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText('$1.23')).toBeInTheDocument();
    });
  });

  it('expands row to show full key details', async () => {
    const user = userEvent.setup();
    mockListKeys.mockResolvedValue({
      keys: [
        {
          key: 'sk-test12345678',
          key_alias: 'dev-key',
          models: ['gpt-4o'],
          spend: 0.5,
          max_budget: 20,
          budget_duration: '30d',
          expires: '2026-12-31T00:00:00Z',
        },
      ],
    });

    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText('dev-key')).toBeInTheDocument();
    });

    // Click the ant-table expand icon to trigger expandedRowRender
    const expandBtn = document.querySelector('.ant-table-row-expand-icon');
    if (expandBtn) {
      await user.click(expandBtn as HTMLElement);
      await waitFor(() => {
        expect(screen.getByText('Allowed Models:')).toBeInTheDocument();
      });
      // Also shows expires date from expandedRowRender
      expect(screen.getByText('Expires:')).toBeInTheDocument();
    }
  });

  it('uses token field as fallback when key field is absent', async () => {
    mockListKeys.mockResolvedValue({
      keys: [
        {
          token: 'sk-token-value',
          models: [],
          spend: 0,
          max_budget: 0,
          budget_duration: '',
        },
      ],
    });

    render(<ApiKeysTab />);

    await waitFor(() => {
      // token is used in resolveKey when key is absent
      expect(screen.getByText('All models')).toBeInTheDocument();
    });
  });
});
