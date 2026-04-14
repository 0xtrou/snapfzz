// A013/UI/AnalyticsTab: LLM usage analytics dashboard tests
// Uses server-side aggregation endpoints (getSpendSummary, getSpendReport)

import { render, screen, waitFor } from '@testing-library/react';
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

const SAMPLE_SUMMARY = {
  total_spend: 0.10,
  total_tokens: 1450,
  prompt_tokens: 1000,
  completion_tokens: 450,
  api_requests: 3,
  per_model: {
    'openai/gpt-4o': { spend: 0.08, total_tokens: 1150, prompt_tokens: 800, completion_tokens: 350, api_requests: 2 },
    'anthropic/claude-sonnet': { spend: 0.02, total_tokens: 300, prompt_tokens: 200, completion_tokens: 100, api_requests: 1 },
  },
  per_provider: {
    'openai': { spend: 0.08, total_tokens: 1150, api_requests: 2 },
    'anthropic': { spend: 0.02, total_tokens: 300, api_requests: 1 },
  },
};

describe('A013/UI/AnalyticsTab', () => {
  beforeEach(() => {
    mockGetSpendSummary.mockReset();
    mockGetSpendReport.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
    mockGetSpendReport.mockResolvedValue([]);
  });

  it('A013/analytics/loading: renders skeleton while fetching', () => {
    mockGetSpendSummary.mockImplementation(() => new Promise(() => {}));
    render(<AnalyticsTab />);
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
  });

  it('A013/analytics/empty: shows empty state when no data', async () => {
    mockGetSpendSummary.mockResolvedValue(null);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('No usage data yet')).toBeInTheDocument();
    });
  });

  it('A013/analytics/overview: displays usage overview cards', async () => {
    mockGetSpendSummary.mockResolvedValue(SAMPLE_SUMMARY);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument();
    });

    expect(screen.getByText('INPUT TOKENS')).toBeInTheDocument();
    expect(screen.getByText('OUTPUT TOKENS')).toBeInTheDocument();
    expect(screen.getByText('EST. COST')).toBeInTheDocument();

    const statValues = document.querySelectorAll('.ant-statistic-content-value');
    const texts = Array.from(statValues).map((el) => el.textContent);
    expect(texts).toContain('1.4K');
    expect(texts).toContain('1.0K');
  });

  it('A013/analytics/models: shows model breakdown from summary', async () => {
    mockGetSpendSummary.mockResolvedValue(SAMPLE_SUMMARY);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('Model Breakdown')).toBeInTheDocument();
    });

    expect(screen.getByText('openai/gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('anthropic/claude-sonnet')).toBeInTheDocument();
  });

  it('A013/analytics/providers: shows provider breakdown from summary', async () => {
    mockGetSpendSummary.mockResolvedValue(SAMPLE_SUMMARY);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('Provider Breakdown')).toBeInTheDocument();
    });

    expect(screen.getAllByText('openai').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('anthropic').length).toBeGreaterThanOrEqual(1);
  });
});
