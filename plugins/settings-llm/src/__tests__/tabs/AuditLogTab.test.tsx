// A013/UI/AuditLogTab: Spend logs viewer tests

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { message } from 'antd';
import AuditLogTab from '../../tabs/AuditLogTab';

const mockGetSpendLogs = vi.fn();
const mockGetBaseUrl = vi.fn();
const mockGetMasterKey = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({
    invoke: vi.fn(),
  }),
  fetchWithToast: async (fn: () => Promise<unknown>) => {
    try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err : new Error(String(err)) }; }
  },
  PretextList: ({ items, renderItem, keyExtractor }: any) => (
    <div data-testid="pretext-list">
      {(items ?? []).map((item: any, i: number) => (
        <div key={keyExtractor(item, i)}>{renderItem(item, i)}</div>
      ))}
    </div>
  ),
  PretextPaginatedList: ({ items, renderItem, keyExtractor }: any) => (
    <div data-testid="pretext-paginated-list">
      {(items ?? []).map((item: any, i: number) => (
        <div key={keyExtractor(item, i)}>{renderItem(item, i)}</div>
      ))}
    </div>
  ),
  AppButton: ({ children, onClick, ...props }: any) => (
    <button type="button" onClick={onClick} {...props}>{children}</button>
  ),
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  getBaseUrl: () => mockGetBaseUrl(),
  getMasterKey: () => mockGetMasterKey(),
  getSpendLogs: (...args: unknown[]) => mockGetSpendLogs(...args),
}));

describe('A013/UI/AuditLogTab', () => {
  beforeEach(() => {
    mockGetSpendLogs.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
  });

  it('renders loading state initially', () => {
    mockGetSpendLogs.mockImplementation(() => new Promise(() => {}));
    render(<AuditLogTab />);
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
  });

  it('shows empty state when no logs', async () => {
    mockGetSpendLogs.mockResolvedValue([]);
    render(<AuditLogTab />);
    
    await waitFor(() => {
      expect(screen.getByText('No spend logs found')).toBeInTheDocument();
    });
  });

  it('displays spend logs and filters by model', async () => {
    const user = userEvent.setup();
    mockGetSpendLogs.mockResolvedValue([
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
    mockGetSpendLogs.mockRejectedValue(new Error('log-failed'));

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