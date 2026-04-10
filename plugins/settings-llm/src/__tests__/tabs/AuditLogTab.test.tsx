// A013/UI/AuditLogTab: Spend logs viewer tests

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { message } from 'antd';
import AuditLogTab from '../../tabs/AuditLogTab';

const mockInvoke = vi.fn();
const mockGetBaseUrl = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({
    invoke: vi.fn(),
  }),
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  getBaseUrl: () => mockGetBaseUrl(),
  getSpendLogs: () => mockInvoke(),
}));

describe('A013/UI/AuditLogTab', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
  });

  it('renders loading state initially', () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    render(<AuditLogTab />);
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
  });

  it('shows empty state when no logs', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<AuditLogTab />);
    
    await waitFor(() => {
      expect(screen.getByText('No spend logs found')).toBeInTheDocument();
    });
  });

  it('displays spend logs and filters by model', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue([
      {
        request_id: 'req-123',
        api_key: 'short',
        model: 'gpt-4o',
        spend: 0,
        timestamp: '2024-01-15T10:30:00Z',
      },
      {
        request_id: 'req-456',
        api_key: 'sk-very-long-secret-key',
        model: 'claude-sonnet',
        spend: 0.001234,
        timestamp: '2024-01-15T10:30:00Z',
      },
    ]);

    render(<AuditLogTab />);

    await waitFor(() => {
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });

    expect(screen.getByText('short')).toBeInTheDocument();
    expect(screen.getByText('sk-v...-key')).toBeInTheDocument();
    expect(screen.getByText('$0.000000')).toBeInTheDocument();
    expect(screen.getByText('$0.001234')).toBeInTheDocument();

    await user.click(screen.getByText('Filter by model'));
    await user.click(screen.getByTitle('gpt-4o'));

    await waitFor(() => {
      expect(screen.queryByText('req-456')).not.toBeInTheDocument();
    });
  });

  it('shows empty state when spend log fetch fails', async () => {
    mockInvoke.mockRejectedValue(new Error('log-failed'));

    render(<AuditLogTab />);

    await waitFor(() => {
      expect(screen.getByText('No spend logs found')).toBeInTheDocument();
    });
  });

  it('shows url error when base URL fetch fails', async () => {
    const messageErrorSpy = vi.spyOn(message, 'error').mockImplementation(() => {
      return undefined as any;
    });

    mockGetBaseUrl.mockRejectedValue(new Error('offline'));

    render(<AuditLogTab />);

    await waitFor(() => {
      expect(messageErrorSpy).toHaveBeenCalledWith('Failed to get LiteLLM URL');
    });
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
  });
});