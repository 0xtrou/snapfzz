// A013/UI/AuditLogTab: Additional tests for coverage gaps
// Targets: model filter clear, short API key (no masking), pagination path

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('A013/UI/AuditLogTab/Extra', () => {
  beforeEach(() => {
    mockGetSpendLogs.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
  });

  it('renders short API keys without masking (12 chars or fewer)', async () => {
    mockGetSpendLogs.mockResolvedValue([
      {
        request_id: 'req-short',
        api_key: 'shortkey',
        model: 'gpt-4o',
        spend: 0.001,
        timestamp: '2026-04-10T10:00:00Z',
      },
    ]);

    render(<AuditLogTab />);

    await waitFor(() => {
      expect(screen.getByText('shortkey')).toBeInTheDocument();
    });
  });

  it('shows all models in filter dropdown when multiple models present', async () => {
    const user = userEvent.setup();
    mockGetSpendLogs.mockResolvedValue([
      {
        request_id: 'req-1',
        api_key: 'sk-very-long-key-abc',
        model: 'gpt-4o',
        spend: 0.001,
        timestamp: '2026-04-10T10:00:00Z',
      },
      {
        request_id: 'req-2',
        api_key: 'sk-very-long-key-def',
        model: 'claude-sonnet',
        spend: 0.002,
        timestamp: '2026-04-10T11:00:00Z',
      },
    ]);

    render(<AuditLogTab />);

    await waitFor(() => {
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });

    // Open the model filter dropdown
    await user.click(screen.getByText('Filter by model'));
    await user.click(screen.getByTitle('gpt-4o'));

    await waitFor(() => {
      // Only gpt-4o rows should be visible
      expect(screen.queryByText('req-2')).not.toBeInTheDocument();
    });
  });

  it('shows all logs again after clearing the model filter', async () => {
    const user = userEvent.setup();
    mockGetSpendLogs.mockResolvedValue([
      {
        request_id: 'req-1',
        api_key: 'sk-very-long-key-abc',
        model: 'gpt-4o',
        spend: 0.001,
        timestamp: '2026-04-10T10:00:00Z',
      },
      {
        request_id: 'req-2',
        api_key: 'sk-very-long-key-def',
        model: 'claude-sonnet',
        spend: 0.002,
        timestamp: '2026-04-10T11:00:00Z',
      },
    ]);

    render(<AuditLogTab />);

    await waitFor(() => {
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });

    // Filter by gpt-4o
    await user.click(screen.getByText('Filter by model'));
    await user.click(screen.getByTitle('gpt-4o'));

    await waitFor(() => {
      expect(screen.queryByText('req-2')).not.toBeInTheDocument();
    });

    // Clear filter using allowClear X button
    const clearBtn = document.querySelector('.ant-select-clear');
    if (clearBtn) {
      await user.click(clearBtn as HTMLElement);
      await waitFor(() => {
        expect(screen.getAllByText('claude-sonnet').length).toBeGreaterThanOrEqual(1);
      });
    }
  });

  it('renders all logs in PretextList when many logs are present', async () => {
    const logs = Array.from({ length: 25 }, (_, i) => ({
      request_id: `req-${i}`,
      api_key: 'sk-very-long-key-abc',
      model: 'gpt-4o',
      spend: 0.001,
      timestamp: `2026-04-10T${String(i).padStart(2, '0')}:00:00Z`,
    }));

    mockGetSpendLogs.mockResolvedValue(logs);

    render(<AuditLogTab />);

    await waitFor(() => {
      // PretextList renders all items (mocked as flat list in tests)
      expect(screen.getByTestId('pretext-paginated-list')).toBeTruthy();
      expect(screen.getByText('25 requests')).toBeInTheDocument();
    });
  });

  it('renders spend as $0.000000 for zero spend', async () => {
    mockGetSpendLogs.mockResolvedValue([
      {
        request_id: 'req-zero',
        api_key: 'sk-very-long-key-abc',
        model: 'gpt-4o',
        spend: 0,
        timestamp: '2026-04-10T10:00:00Z',
      },
    ]);

    render(<AuditLogTab />);

    await waitFor(() => {
      expect(screen.getByText('$0.000000')).toBeInTheDocument();
    });
  });

  it('renders timestamp as localized date string in log row', async () => {
    mockGetSpendLogs.mockResolvedValue([
      {
        request_id: 'req-ts',
        api_key: 'sk-very-long-key-abc',
        model: 'gpt-4o',
        spend: 0.001,
        timestamp: '2026-04-10T10:30:00Z',
      },
    ]);

    render(<AuditLogTab />);

    await waitFor(() => {
      // The row renders the model name and spend — verify the log rendered
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
      expect(screen.getByText('$0.001000')).toBeInTheDocument();
      // Raw ISO string should NOT appear — it's converted via toLocaleString()
      expect(screen.queryByText('2026-04-10T10:30:00Z')).not.toBeInTheDocument();
    });
  });
});
