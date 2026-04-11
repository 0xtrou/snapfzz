// A013/UI/AnalyticsTab: LLM usage analytics dashboard tests

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { message } from 'antd';
import AnalyticsTab from '../../tabs/AnalyticsTab';

const mockGetSpendLogs = vi.fn();
const mockGetBaseUrl = vi.fn();
const mockGetMasterKey = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({
    invoke: vi.fn(),
  }),
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  getBaseUrl: () => mockGetBaseUrl(),
  getMasterKey: () => mockGetMasterKey(),
  getSpendLogs: (...args: unknown[]) => mockGetSpendLogs(...args),
}));

const SAMPLE_LOGS = [
  {
    request_id: 'req-001',
    api_key: 'sk-test-key-alpha-1234',
    model: 'openai/gpt-4o',
    spend: 0.05,
    timestamp: '2026-04-10T10:00:00Z',
    startTime: '2026-04-10T10:00:00Z',
    prompt_tokens: 500,
    completion_tokens: 200,
    total_tokens: 700,
  },
  {
    request_id: 'req-002',
    api_key: 'sk-test-key-alpha-1234',
    model: 'openai/gpt-4o',
    spend: 0.03,
    timestamp: '2026-04-10T11:00:00Z',
    startTime: '2026-04-10T11:00:00Z',
    prompt_tokens: 300,
    completion_tokens: 150,
    total_tokens: 450,
  },
  {
    request_id: 'req-003',
    api_key: 'sk-other-key-beta-5678',
    model: 'anthropic/claude-sonnet',
    spend: 0.02,
    timestamp: '2026-04-09T09:00:00Z',
    startTime: '2026-04-09T09:00:00Z',
    prompt_tokens: 200,
    completion_tokens: 100,
    total_tokens: 300,
  },
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

  it('A013/analytics/empty: shows empty state when no logs', async () => {
    mockGetSpendLogs.mockResolvedValue([]);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('No usage data yet')).toBeInTheDocument();
    });
  });

  it('A013/analytics/overview: displays usage overview cards with formatted values', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('TOTAL TOKENS')).toBeInTheDocument();
    });

    expect(screen.getByText('INPUT TOKENS')).toBeInTheDocument();
    expect(screen.getByText('OUTPUT TOKENS')).toBeInTheDocument();
    expect(screen.getByText('EST. COST')).toBeInTheDocument();

    // 700 + 450 + 300 = 1450 → "1.5K"
    expect(screen.getByText('1.5K')).toBeInTheDocument();
    // 500 + 300 + 200 = 1000 → "1.0K"
    expect(screen.getByText('1.0K')).toBeInTheDocument();

    // 3 requests subtitle
    const reqSubtitles = screen.getAllByText('3 requests');
    expect(reqSubtitles.length).toBe(4);
  });

  it('A013/analytics/providers: shows provider breakdown table', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('Provider Breakdown')).toBeInTheDocument();
    });

    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('anthropic')).toBeInTheDocument();
  });

  it('A013/analytics/models: shows model breakdown table with colored dots', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('Model Breakdown')).toBeInTheDocument();
    });

    expect(screen.getByText('openai/gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('anthropic/claude-sonnet')).toBeInTheDocument();
  });

  it('A013/analytics/keys: shows API key breakdown with masked keys', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('API Key Breakdown')).toBeInTheDocument();
    });

    // sk-test-key-alpha-1234 → "sk-t...1234"
    expect(screen.getByText('sk-t...1234')).toBeInTheDocument();
    // sk-other-key-beta-5678 → "sk-o...5678"
    expect(screen.getByText('sk-o...5678')).toBeInTheDocument();
  });

  it('A013/analytics/key-filter: filters API key table by search input', async () => {
    const user = userEvent.setup();
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('sk-t...1234')).toBeInTheDocument();
    });

    const filterInput = screen.getByPlaceholderText('Filter keys...');
    await user.type(filterInput, 'alpha');

    await waitFor(() => {
      expect(screen.getByText('sk-t...1234')).toBeInTheDocument();
      expect(screen.queryByText('sk-o...5678')).not.toBeInTheDocument();
    });
  });

  it('A013/analytics/time-range: time range filter restricts visible data', async () => {
    const user = userEvent.setup();
    // One log from today, one from 60 days ago
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
    const oldLog = {
      request_id: 'req-old',
      api_key: 'sk-old-key-long-9999',
      model: 'anthropic/claude-sonnet',
      spend: 0.02,
      timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      startTime: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      prompt_tokens: 200,
      completion_tokens: 100,
      total_tokens: 300,
    };

    mockGetSpendLogs.mockResolvedValue([recentLog, oldLog]);
    render(<AnalyticsTab />);

    // Wait for "All" to show both
    await waitFor(() => {
      expect(screen.getByText('sk-r...0000')).toBeInTheDocument();
    });
    expect(screen.getByText('sk-o...9999')).toBeInTheDocument();

    // Click 1D — should only show recent
    await user.click(screen.getByText('1D'));

    await waitFor(() => {
      expect(screen.getByText('sk-r...0000')).toBeInTheDocument();
      expect(screen.queryByText('sk-o...9999')).not.toBeInTheDocument();
    });
  });

  it('A013/analytics/metrics: displays infrastructure and performance sections', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS);
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(screen.getByText('Infrastructure')).toBeInTheDocument();
    });

    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Highlights')).toBeInTheDocument();

    // Infrastructure: 2 providers, 2 API keys, 2 models
    expect(screen.getByText('Providers')).toBeInTheDocument();
    expect(screen.getByText('API Keys')).toBeInTheDocument();
    expect(screen.getByText('Models')).toBeInTheDocument();
  });

  it('A013/analytics/error: shows error toast on fetch failure', async () => {
    const messageErrorSpy = vi.spyOn(message, 'error').mockImplementation(() => {
      return undefined as any;
    });

    mockGetSpendLogs.mockRejectedValue(new Error('network-error'));
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(messageErrorSpy).toHaveBeenCalledWith('Failed to load usage data');
    });
  });

  it('A013/analytics/connect-error: shows error toast when base URL fails', async () => {
    const messageErrorSpy = vi.spyOn(message, 'error').mockImplementation(() => {
      return undefined as any;
    });

    mockGetBaseUrl.mockRejectedValue(new Error('offline'));
    render(<AnalyticsTab />);

    await waitFor(() => {
      expect(messageErrorSpy).toHaveBeenCalledWith('Failed to connect to LLM gateway');
    });
  });
});
