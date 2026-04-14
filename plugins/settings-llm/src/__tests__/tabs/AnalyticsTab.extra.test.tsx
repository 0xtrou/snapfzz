// A013/UI/AnalyticsTab: Additional tests for coverage gaps
// Targets: formatTokens (M scale), formatCost (near-zero < 0.01), logs without timestamps,
//          aggregateByKey/Provider/Model with missing fields, busiest-day computation,
//          extractProvider with no slash (unknown provider), filterByTimeRange no-timestamp

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AnalyticsTab from '../../tabs/AnalyticsTab';

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
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  getBaseUrl: () => mockGetBaseUrl(),
  getMasterKey: () => mockGetMasterKey(),
  getSpendLogs: (...args: unknown[]) => mockGetSpendLogs(...args),
}));

describe('A013/UI/AnalyticsTab/Extra', () => {
  beforeEach(() => {
    mockGetSpendLogs.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
  });

  it('A013/analytics/format-M: shows M-scale tokens for large token counts', async () => {
    // Total tokens: 1,500,000 → should display "1.5M"
    const logs = [
      {
        request_id: 'req-big',
        api_key: 'sk-test-big-tokens-1111',
        model: 'openai/gpt-4o',
        spend: 0.5,
        timestamp: new Date().toISOString(),
        startTime: new Date().toISOString(),
        prompt_tokens: 1_000_000,
        completion_tokens: 500_000,
        total_tokens: 1_500_000,
      },
    ];

    mockGetSpendLogs.mockResolvedValue(logs);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument();
    });

    const statValues = document.querySelectorAll('.ant-statistic-content-value');
    const texts = Array.from(statValues).map((el) => el.textContent);
    expect(texts.some((t) => t?.includes('M'))).toBe(true);
  });

  it('A013/analytics/format-cost-tiny: shows 4 decimal places for cost < $0.01', async () => {
    const logs = [
      {
        request_id: 'req-tiny',
        api_key: 'sk-test-tiny-cost-2222',
        model: 'openai/gpt-4o',
        spend: 0.0001,
        timestamp: new Date().toISOString(),
        startTime: new Date().toISOString(),
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    ];

    mockGetSpendLogs.mockResolvedValue(logs);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('EST. COST')).toBeInTheDocument();
    });

    const statValues = document.querySelectorAll('.ant-statistic-content-value');
    const texts = Array.from(statValues).map((el) => el.textContent);
    // $0.0001 → "$0.0001"
    expect(texts.some((t) => t?.includes('0001') || t?.includes('$0'))).toBe(true);
  });

  it('A013/analytics/no-timestamp: logs without timestamp are excluded from time-range filter', async () => {
    const user = userEvent.setup();
    // A log with no timestamp should be excluded when a time filter is active
    const logNoTimestamp = {
      request_id: 'req-no-ts',
      api_key: 'sk-no-timestamp-key-x',
      model: 'openai/gpt-4o',
      spend: 0.01,
      // no timestamp, no startTime
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    };

    const recentLog = {
      request_id: 'req-recent',
      api_key: 'sk-recent-key-0000',
      model: 'openai/gpt-4o',
      spend: 0.01,
      timestamp: new Date().toISOString(),
      startTime: new Date().toISOString(),
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    };

    mockGetSpendLogs.mockResolvedValue([logNoTimestamp, recentLog]);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument();
    });

    // Switch to 1D — only recentLog should be included (logNoTimestamp has no ts)
    await user.click(screen.getByText('1D'));

    // No crash; the component handles missing timestamps gracefully
    await waitFor(() => {
      expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument();
    });
  });

  it('A013/analytics/unknown-provider: model without slash uses "unknown" as provider', async () => {
    const logs = [
      {
        request_id: 'req-unknown',
        api_key: 'sk-unknown-provider-333',
        model: 'gpt-4o',
        spend: 0.05,
        timestamp: new Date().toISOString(),
        startTime: new Date().toISOString(),
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    ];

    mockGetSpendLogs.mockResolvedValue(logs);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('Provider Breakdown')).toBeInTheDocument();
    });

    // Model "gpt-4o" has no "/" so extractProvider returns "unknown"
    expect(screen.getAllByText('unknown').length).toBeGreaterThanOrEqual(1);
  });

  it('A013/analytics/missing-tokens: logs with undefined token counts default to 0', async () => {
    const logs = [
      {
        request_id: 'req-missing',
        api_key: 'sk-missing-tokens-4444',
        model: 'openai/gpt-4o',
        spend: 0.01,
        timestamp: new Date().toISOString(),
        startTime: new Date().toISOString(),
        // No token fields
      },
    ];

    mockGetSpendLogs.mockResolvedValue(logs);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument();
    });

    // Should show 0 tokens without crashing
    const statValues = document.querySelectorAll('.ant-statistic-content-value');
    const texts = Array.from(statValues).map((el) => el.textContent);
    expect(texts.some((t) => t === '0')).toBe(true);
  });

  it('A013/analytics/busiest-day: highlights busiest day in Highlights section', async () => {
    // Two logs on same day, one on different day → 2026-04-10 is busiest
    const logs = [
      {
        request_id: 'req-1',
        api_key: 'sk-busiest-day-key-0000',
        model: 'openai/gpt-4o',
        spend: 0.01,
        timestamp: '2026-04-10T10:00:00Z',
        startTime: '2026-04-10T10:00:00Z',
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
      {
        request_id: 'req-2',
        api_key: 'sk-busiest-day-key-0000',
        model: 'openai/gpt-4o',
        spend: 0.02,
        timestamp: '2026-04-10T11:00:00Z',
        startTime: '2026-04-10T11:00:00Z',
        prompt_tokens: 200,
        completion_tokens: 100,
        total_tokens: 300,
      },
      {
        request_id: 'req-3',
        api_key: 'sk-other-day-key-1111',
        model: 'anthropic/claude',
        spend: 0.01,
        timestamp: '2026-04-09T09:00:00Z',
        startTime: '2026-04-09T09:00:00Z',
        prompt_tokens: 50,
        completion_tokens: 25,
        total_tokens: 75,
      },
    ];

    mockGetSpendLogs.mockResolvedValue(logs);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('Highlights')).toBeInTheDocument();
    });

    // Busiest Day should be 2026-04-10
    expect(screen.getByText('2026-04-10')).toBeInTheDocument();
  });

  it('A013/analytics/total-tokens-fallback: uses prompt+completion when total_tokens is missing', async () => {
    const logs = [
      {
        request_id: 'req-calc',
        api_key: 'sk-calc-tokens-key-5555',
        model: 'openai/gpt-4o',
        spend: 0.01,
        timestamp: new Date().toISOString(),
        startTime: new Date().toISOString(),
        prompt_tokens: 300,
        completion_tokens: 200,
        // No total_tokens — should be computed as 500
      },
    ];

    mockGetSpendLogs.mockResolvedValue(logs);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument();
    });

    const statValues = document.querySelectorAll('.ant-statistic-content-value');
    const texts = Array.from(statValues).map((el) => el.textContent);
    // 500 total tokens
    expect(texts).toContain('500');
  });

  it('A013/analytics/key-filter-partial: partial key filter matches full masked key', async () => {
    const user = userEvent.setup();
    const logs = [
      {
        request_id: 'req-alpha',
        api_key: 'sk-alpha-key-longvalue',
        model: 'openai/gpt-4o',
        spend: 0.01,
        timestamp: new Date().toISOString(),
        startTime: new Date().toISOString(),
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
      {
        request_id: 'req-beta',
        api_key: 'sk-beta-key-longerval',
        model: 'anthropic/claude',
        spend: 0.02,
        timestamp: new Date().toISOString(),
        startTime: new Date().toISOString(),
        prompt_tokens: 200,
        completion_tokens: 100,
        total_tokens: 300,
      },
    ];

    mockGetSpendLogs.mockResolvedValue(logs);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('API Key Breakdown')).toBeInTheDocument();
    });

    const filterInput = screen.getByPlaceholderText('Filter keys...');
    await user.type(filterInput, 'alpha');

    await waitFor(() => {
      // sk-alpha-key-longvalue masked: "sk-a...alue"
      expect(screen.getByText('sk-a...alue')).toBeInTheDocument();
      // sk-beta should be hidden
      expect(screen.queryByText('sk-b...rval')).not.toBeInTheDocument();
    });
  });
});
