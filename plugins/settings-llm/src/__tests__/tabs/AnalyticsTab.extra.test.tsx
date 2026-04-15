// A013/UI/AnalyticsTab: Additional tests for client-side analytics aggregation

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AnalyticsTab from '../../tabs/AnalyticsTab';

const mockGetSpendLogs = vi.fn();
const mockGetBaseUrl = vi.fn();
const mockGetMasterKey = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({ invoke: vi.fn() }),
  fetchWithToast: async (fn: () => Promise<unknown>) => {
    try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err : new Error(String(err)) }; }
  },
  AppButton: ({ children, onClick, loading, ...props }: any) => (
    <button type="button" onClick={onClick} disabled={loading} {...props}>{children}</button>
  ),
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  getBaseUrl: () => mockGetBaseUrl(),
  getMasterKey: () => mockGetMasterKey(),
  getSpendLogs: (...args: unknown[]) => mockGetSpendLogs(...args),
  getModelInfo: () => Promise.resolve({ data: [] }),
  loadCustomProviders: () => Promise.resolve([]),
}));

describe('A013/UI/AnalyticsTab/Extra', () => {
  beforeEach(() => {
    mockGetSpendLogs.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
  });

  it('A013/analytics/format-M: shows M-scale tokens for large counts', async () => {
    mockGetSpendLogs.mockResolvedValue([{
      request_id: 'req-big', api_key: 'sk-big', model: 'openai/gpt-4o', spend: 5.0,
      startTime: new Date().toISOString(), prompt_tokens: 1_000_000, completion_tokens: 500_000, total_tokens: 1_500_000,
    }]);
    render(<AnalyticsTab />);
    await waitFor(() => { expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument(); });
    const statValues = document.querySelectorAll('.ant-statistic-content-value');
    const texts = Array.from(statValues).map((el) => el.textContent);
    expect(texts.some((t) => t?.includes('M'))).toBe(true);
  });

  it('A013/analytics/format-cost-tiny: shows 4 decimal places for cost < $0.01', async () => {
    mockGetSpendLogs.mockResolvedValue([{
      request_id: 'req-tiny', api_key: 'sk-tiny', model: 'openai/gpt-4o', spend: 0.0001,
      startTime: new Date().toISOString(), prompt_tokens: 10, completion_tokens: 5, total_tokens: 15,
    }]);
    render(<AnalyticsTab />);
    await waitFor(() => { expect(screen.getByText('EST. COST')).toBeInTheDocument(); });
    const statValues = document.querySelectorAll('.ant-statistic-content-value');
    const texts = Array.from(statValues).map((el) => el.textContent);
    expect(texts.some((t) => t?.includes('0001'))).toBe(true);
  });

  it('A013/analytics/time-range: switching time range triggers reload', async () => {
    const user = userEvent.setup();
    mockGetSpendLogs.mockResolvedValue([{
      request_id: 'req-1', api_key: 'sk-1', model: 'openai/gpt-4o', spend: 0.01,
      startTime: new Date().toISOString(), prompt_tokens: 100, completion_tokens: 50, total_tokens: 150,
    }]);
    render(<AnalyticsTab />);
    await waitFor(() => { expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument(); });
    await user.click(screen.getByText('YTD'));
    await waitFor(() => { expect(mockGetSpendLogs).toHaveBeenCalledTimes(2); });
  });

  it('A013/analytics/zero-tokens: handles logs with zero values', async () => {
    mockGetSpendLogs.mockResolvedValue([{
      request_id: 'req-zero', api_key: 'sk-zero', model: 'openai/gpt-4o', spend: 0,
      startTime: new Date().toISOString(), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
    }]);
    render(<AnalyticsTab />);
    await waitFor(() => { expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument(); });
    const statValues = document.querySelectorAll('.ant-statistic-content-value');
    const texts = Array.from(statValues).map((el) => el.textContent);
    expect(texts).toContain('0');
    expect(texts).toContain('$0.00');
  });

  it('A013/analytics/error: handles getSpendLogs failure', async () => {
    mockGetSpendLogs.mockRejectedValue(new Error('network'));
    render(<AnalyticsTab />);
    await waitFor(() => { expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument(); });
  });
});
