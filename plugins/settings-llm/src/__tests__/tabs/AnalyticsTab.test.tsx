// A013/UI/AnalyticsTab: LLM usage analytics dashboard tests
// Uses client-side aggregation from /spend/logs (Enterprise endpoints not available)

import { render, screen, waitFor } from '@testing-library/react';
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
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  getBaseUrl: () => mockGetBaseUrl(),
  getMasterKey: () => mockGetMasterKey(),
  getSpendLogs: (...args: unknown[]) => mockGetSpendLogs(...args),
  getModelInfo: () => Promise.resolve({ data: [] }),
  loadCustomProviders: () => Promise.resolve([]),
}));

const SAMPLE_LOGS = [
  { request_id: 'req-1', api_key: 'sk-test-key-alpha-1234', model: 'openai/gpt-4o', model_group: 'gpt-4o', api_base: 'https://api.openai.com/v1', spend: 0.05, startTime: '2026-04-10T10:00:00Z', prompt_tokens: 500, completion_tokens: 200, total_tokens: 700 },
  { request_id: 'req-2', api_key: 'sk-test-key-alpha-1234', model: 'openai/gpt-4o', model_group: 'gpt-4o', api_base: 'https://api.openai.com/v1', spend: 0.03, startTime: '2026-04-10T11:00:00Z', prompt_tokens: 300, completion_tokens: 150, total_tokens: 450 },
  { request_id: 'req-3', api_key: 'sk-other-key-beta-5678', model: 'anthropic/claude-sonnet', model_group: 'claude-sonnet', api_base: 'https://api.anthropic.com', spend: 0.02, startTime: '2026-04-09T09:00:00Z', prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
];

describe('A013/UI/AnalyticsTab', () => {
  beforeEach(() => {
    mockGetSpendLogs.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
  });

  it('A013/analytics/loading: renders skeleton while fetching', () => {
    mockGetSpendLogs.mockImplementation(() => new Promise(() => {}));
    render(<AnalyticsTab />);
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
  });

  it('A013/analytics/overview: displays usage overview cards', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS);
    render(<AnalyticsTab />);
    await waitFor(() => { expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument(); });
    expect(screen.getByText('INPUT TOKENS')).toBeInTheDocument();
    expect(screen.getByText('OUTPUT TOKENS')).toBeInTheDocument();
    expect(screen.getByText('EST. COST')).toBeInTheDocument();
  });

  it('A013/analytics/models: shows model breakdown', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS);
    render(<AnalyticsTab />);
    await waitFor(() => { expect(screen.getByText('MODEL BREAKDOWN')).toBeInTheDocument(); });
    // Model shows as provider/model_group (e.g. openai.com/gpt-4o)
    expect(screen.getAllByText(/gpt-4o/).length).toBeGreaterThanOrEqual(1);
  });

  it('A013/analytics/providers: shows provider breakdown', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS);
    render(<AnalyticsTab />);
    await waitFor(() => { expect(screen.getByText('PROVIDER BREAKDOWN')).toBeInTheDocument(); });
    // Provider resolved from api_base hostname
    expect(screen.getAllByText(/openai/).length).toBeGreaterThanOrEqual(1);
  });

  it('A013/analytics/empty: shows charts with empty state when no logs', async () => {
    mockGetSpendLogs.mockResolvedValue([]);
    render(<AnalyticsTab />);
    await waitFor(() => { expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument(); });
    // Charts should still render (with empty state)
    // Charts render with empty state — title may be mixed case depending on component
    expect(screen.getByText(/token.*cost.*trend/i)).toBeInTheDocument();
  });
});
