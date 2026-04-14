// A013/UI/AnalyticsTab: Additional tests for server-side analytics
// Targets: time range switching, fallback to report data, empty summary fields,
//          formatTokens M-scale, formatCost tiny values, error handling

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AnalyticsTab from '../../tabs/AnalyticsTab';

const mockGetSpendSummary = vi.fn();
const mockGetSpendReport = vi.fn();
const mockGetBaseUrl = vi.fn();
const mockGetMasterKey = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({ invoke: vi.fn() }),
  fetchWithToast: async (fn: () => Promise<unknown>) => {
    try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err : new Error(String(err)) }; }
  },
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  getBaseUrl: () => mockGetBaseUrl(),
  getMasterKey: () => mockGetMasterKey(),
  getSpendSummary: (...args: unknown[]) => mockGetSpendSummary(...args),
  getSpendReport: (...args: unknown[]) => mockGetSpendReport(...args),
}));

describe('A013/UI/AnalyticsTab/Extra', () => {
  beforeEach(() => {
    mockGetSpendSummary.mockReset();
    mockGetSpendReport.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
    mockGetSpendReport.mockResolvedValue([]);
  });

  it('A013/analytics/format-M: shows M-scale tokens for large counts', async () => {
    mockGetSpendSummary.mockResolvedValue({
      total_spend: 5.0,
      total_tokens: 1_500_000,
      prompt_tokens: 1_000_000,
      completion_tokens: 500_000,
      api_requests: 100,
    });
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument();
    });

    const statValues = document.querySelectorAll('.ant-statistic-content-value');
    const texts = Array.from(statValues).map((el) => el.textContent);
    expect(texts.some((t) => t?.includes('M'))).toBe(true);
  });

  it('A013/analytics/format-cost-tiny: shows 4 decimal places for cost < $0.01', async () => {
    mockGetSpendSummary.mockResolvedValue({
      total_spend: 0.0001,
      total_tokens: 15,
      prompt_tokens: 10,
      completion_tokens: 5,
      api_requests: 1,
    });
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('EST. COST')).toBeInTheDocument();
    });

    const statValues = document.querySelectorAll('.ant-statistic-content-value');
    const texts = Array.from(statValues).map((el) => el.textContent);
    expect(texts.some((t) => t?.includes('0001'))).toBe(true);
  });

  it('A013/analytics/time-range: switching time range triggers reload', async () => {
    const user = userEvent.setup();
    mockGetSpendSummary.mockResolvedValue({
      total_spend: 1.0,
      total_tokens: 1000,
      prompt_tokens: 600,
      completion_tokens: 400,
      api_requests: 10,
    });
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument();
    });

    // Switch to 7D — should trigger a new fetch
    await user.click(screen.getByText('7D'));

    await waitFor(() => {
      // getSpendSummary called again with date range params
      expect(mockGetSpendSummary).toHaveBeenCalledTimes(2);
    });
  });

  it('A013/analytics/report-fallback: uses report data when summary has no breakdowns', async () => {
    mockGetSpendSummary.mockResolvedValue({
      total_spend: 0.05,
      total_tokens: 500,
      prompt_tokens: 300,
      completion_tokens: 200,
      api_requests: 2,
      // No per_model, per_provider, per_api_key
    });
    mockGetSpendReport.mockResolvedValue([
      { model: 'openai/gpt-4o', spend: 0.03, total_tokens: 300, prompt_tokens: 200, completion_tokens: 100, api_requests: 1 },
      { model: 'anthropic/claude', spend: 0.02, total_tokens: 200, prompt_tokens: 100, completion_tokens: 100, api_requests: 1 },
    ]);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('Model Breakdown')).toBeInTheDocument();
    });

    expect(screen.getByText('openai/gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('anthropic/claude')).toBeInTheDocument();
  });

  it('A013/analytics/summary-error: handles getSpendSummary failure gracefully', async () => {
    mockGetSpendSummary.mockRejectedValue(new Error('network error'));
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('No usage data yet')).toBeInTheDocument();
    });
  });

  it('A013/analytics/zero-tokens: handles summary with zero values', async () => {
    mockGetSpendSummary.mockResolvedValue({
      total_spend: 0,
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      api_requests: 0,
    });
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument();
    });

    const statValues = document.querySelectorAll('.ant-statistic-content-value');
    const texts = Array.from(statValues).map((el) => el.textContent);
    expect(texts).toContain('0');
    expect(texts).toContain('$0.00');
  });
});
