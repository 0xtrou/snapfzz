// A013/UI/ApiKeysTab: Virtual key management tests

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ApiKeysTab from '../../tabs/ApiKeysTab';

const mockInvoke = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({
    invoke: vi.fn(),
  }),
  AppButton: ({ children, onClick }: any) => (
    <button type="button" onClick={onClick} onKeyUp={onClick}>{children}</button>
  ),
  ConfirmAction: ({ children, onConfirm }: any) => (
    <button type="button" onClick={onConfirm} onKeyUp={onConfirm}>{children}</button>
  ),
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  listKeys: () => mockInvoke(),
  deleteKey: () => mockInvoke(),
  generateKey: () => mockInvoke(),
}));

describe('A013/UI/ApiKeysTab', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('renders loading state initially', () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    render(<ApiKeysTab />);
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
  });

  it('shows empty state when no keys', async () => {
    mockInvoke.mockResolvedValue({ keys: [] });
    render(<ApiKeysTab />);
    
    await waitFor(() => {
      expect(screen.getByText('No virtual keys created')).toBeInTheDocument();
    });
  });

  it('lists virtual keys', async () => {
    mockInvoke.mockResolvedValue({
      keys: [
        {
          key: 'sk-test12345678',
          models: ['gpt-4o'],
          spend: 1.23,
          max_budget: 100,
          budget_duration: '30d',
        },
      ],
    });
    
    render(<ApiKeysTab />);
    
    await waitFor(() => {
      expect(screen.getByText(/gpt-4o/)).toBeInTheDocument();
    });
  });

  it('opens create key modal', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({ keys: [] });
    
    render(<ApiKeysTab />);
    
    await waitFor(() => {
      expect(screen.getByText('No virtual keys created')).toBeInTheDocument();
    });
    
    await user.click(screen.getByText('Create Key'));
    expect(screen.getByText('Create Virtual Key')).toBeInTheDocument();
  });
});