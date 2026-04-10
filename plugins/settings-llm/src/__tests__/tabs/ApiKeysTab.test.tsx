// A013/UI/ApiKeysTab: Virtual key management tests

import { cloneElement, isValidElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { message } from 'antd';
import ApiKeysTab from '../../tabs/ApiKeysTab';

const { mockListKeys, mockDeleteKey, mockGenerateKey, mockGetBaseUrl, writeTextMock } = vi.hoisted(() => ({
  mockListKeys: vi.fn(),
  mockDeleteKey: vi.fn(),
  mockGenerateKey: vi.fn(),
  mockGetBaseUrl: vi.fn(),
  writeTextMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({
    invoke: vi.fn(),
  }),
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
  listKeys: (...args: unknown[]) => mockListKeys(...args),
  deleteKey: (...args: unknown[]) => mockDeleteKey(...args),
  generateKey: (...args: unknown[]) => mockGenerateKey(...args),
}));

describe('A013/UI/ApiKeysTab', () => {
  beforeEach(() => {
    mockListKeys.mockReset();
    mockDeleteKey.mockReset();
    mockGenerateKey.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockListKeys.mockResolvedValue({ keys: [] });
    writeTextMock.mockClear();
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
      expect(screen.getByText('•••••')).toBeInTheDocument();
    });
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
    expect(screen.getByText(/^-$|^\s-\s$/)).toBeInTheDocument();
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
      expect(mockDeleteKey).toHaveBeenCalledWith('http://127.0.0.1:4000', 'sk-test12345678');
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

  it('creates key and copies generated key', async () => {
    const user = userEvent.setup();
    mockListKeys
      .mockResolvedValueOnce({ keys: [] })
      .mockResolvedValueOnce({
        keys: [
          {
            key: 'sk-new1234',
            models: ['gpt-4o'],
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

    await user.click(screen.getByRole('combobox', { name: 'Allowed Models' }));
    await user.click(screen.getByTitle('gpt-4o'));

    const budgetInput = screen.getByRole('spinbutton', { name: 'Max Budget ($)' });
    await user.clear(budgetInput);
    await user.type(budgetInput, '10');

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      expect(mockGenerateKey).toHaveBeenCalledWith(
        'http://127.0.0.1:4000',
        expect.objectContaining({
          models: ['gpt-4o'],
          max_budget: 10,
          budget_duration: '30d',
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
    const messageErrorSpy = vi.spyOn(message, 'error').mockImplementation(() => {
      return undefined as any;
    });

    mockGenerateKey.mockRejectedValue(new Error('boom'));

    render(<ApiKeysTab />);

    await waitFor(() => {
      expect(screen.getByText('No virtual keys created')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Create Key'));
    await user.click(screen.getByRole('combobox', { name: 'Allowed Models' }));
    await user.click(screen.getByTitle('gpt-4o'));
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      expect(messageErrorSpy).toHaveBeenCalledWith('Failed to create key: boom');
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
    await user.click(screen.getByRole('combobox', { name: 'Allowed Models' }));
    await user.click(screen.getByTitle('gpt-4o'));
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      expect(messageErrorSpy).toHaveBeenCalledWith('LiteLLM URL not configured');
    });
    expect(mockGenerateKey).not.toHaveBeenCalled();
  });
});
