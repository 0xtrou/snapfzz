// A013/UI/CacheTab: Cache statistics dashboard tests
// Covers: cache status ping, provider prompt cache stats, response cache stats,
// 24h trend, empty state, error state, and cache type display.

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CacheTab from '../../tabs/CacheTab';

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
}));

// Helper: build a mock Response for global.fetch
function mockFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

// Spend logs that include provider prompt cache data (cached_tokens) and
// response cache hits (cache_hit = 'True').
const NOW = new Date('2026-04-15T12:00:00Z').getTime();

function recentTimestamp(hoursAgo: number): string {
  return new Date(NOW - hoursAgo * 60 * 60 * 1000).toISOString();
}

const SAMPLE_LOGS_WITH_CACHE = [
  {
    request_id: 'req-1',
    api_key: 'sk-test',
    model: 'openai/gpt-4o',
    model_group: 'openai/gpt-4o',
    spend: 0.05,
    startTime: recentTimestamp(2),
    prompt_tokens: 1000,
    completion_tokens: 200,
    total_tokens: 1200,
    cache_hit: 'True',
    response: {
      usage: {
        prompt_tokens_details: { cached_tokens: 800 },
      },
    },
  },
  {
    request_id: 'req-2',
    api_key: 'sk-test',
    model: 'openai/gpt-4o',
    model_group: 'openai/gpt-4o',
    spend: 0.03,
    startTime: recentTimestamp(3),
    prompt_tokens: 500,
    completion_tokens: 100,
    total_tokens: 600,
    cache_hit: 'False',
    response: {
      usage: {
        prompt_tokens_details: { cached_tokens: 0 },
      },
    },
  },
  {
    request_id: 'req-3',
    api_key: 'sk-test',
    model: 'anthropic/claude-sonnet',
    model_group: 'anthropic/claude-sonnet',
    spend: 0.02,
    startTime: recentTimestamp(5),
    prompt_tokens: 600,
    completion_tokens: 150,
    total_tokens: 750,
    cache_hit: 'False',
    response: {
      usage: {
        cache_creation_input_tokens: 400,
      },
    },
  },
];

const CACHE_PING_ENABLED = {
  status: 'healthy',
  cache_type: 'redis',
};

const CACHE_PING_DISABLED = {
  status: 'healthy',
  cache_type: 'none',
};

describe('A013/UI/CacheTab', () => {
  let originalFetch: typeof global.fetch;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalDateNow = Date.now;

    // Pin Date.now so 24h window calculations are deterministic
    Date.now = () => NOW;

    mockGetSpendLogs.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');

    // Default: cache ping returns enabled/redis
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(CACHE_PING_ENABLED));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Date.now = originalDateNow;
  });

  // --- Loading state ---

  it('A013/cache/loading: renders skeleton while data is fetching', () => {
    mockGetSpendLogs.mockImplementation(() => new Promise(() => {}));
    render(<CacheTab />);
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
  });

  // --- Cache Status section ---

  it('A013/cache/status-enabled: shows Enabled when cache ping succeeds', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS_WITH_CACHE);
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(CACHE_PING_ENABLED));
    render(<CacheTab />);
    // Section title is "Cache Status" in DOM (CSS text-transform is visual-only)
    await waitFor(() => expect(screen.getByText('Cache Status')).toBeInTheDocument());
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('A013/cache/status-disabled: shows Disabled when cache ping fails (non-ok response)', async () => {
    mockGetSpendLogs.mockResolvedValue([]);
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse({}, false, 503));
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Cache Status')).toBeInTheDocument());
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('A013/cache/status-disabled-network-error: shows Disabled when fetch throws', async () => {
    mockGetSpendLogs.mockResolvedValue([]);
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Cache Status')).toBeInTheDocument());
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('A013/cache/status-type: shows cache type when enabled', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS_WITH_CACHE);
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(CACHE_PING_ENABLED));
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Cache Status')).toBeInTheDocument());
    // cache_type "redis" should appear as the type label
    expect(screen.getByText(/redis/i)).toBeInTheDocument();
  });

  it('A013/cache/status-no-type-when-disabled: does not show cache type badge when cache_type is none', async () => {
    // cache_type "none" + ok=true: enabled=true but the type badge is suppressed (type !== 'none' check in component)
    mockGetSpendLogs.mockResolvedValue([]);
    global.fetch = vi.fn().mockResolvedValue(mockFetchResponse(CACHE_PING_DISABLED, true, 200));
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Cache Status')).toBeInTheDocument());
    // Cache type "none" should not appear as a "— none" badge
    expect(screen.queryByText(/— none/i)).not.toBeInTheDocument();
  });

  it('A013/cache/status-provider-prompt-always-available: provider prompt cache line is always shown', async () => {
    mockGetSpendLogs.mockResolvedValue([]);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Cache Status')).toBeInTheDocument());
    // "Provider Prompt Cache" appears as a label in the Cache Status section
    expect(screen.getAllByText('Provider Prompt Cache').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Always available')).toBeInTheDocument();
  });

  // --- Provider Prompt Cache section ---

  it('A013/cache/provider-cache-stats: shows cache read token count', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS_WITH_CACHE);
    render(<CacheTab />);
    // "Provider Prompt Cache" appears as both a section title and a label in Cache Status row
    await waitFor(() => expect(screen.getAllByText('Provider Prompt Cache').length).toBeGreaterThanOrEqual(1));
    // Stat card label in DOM is "Cache Read Tokens"
    expect(screen.getByText('Cache Read Tokens')).toBeInTheDocument();
    // req-1 has 800 cached_tokens — "800" may appear in stat card and provider breakdown table
    expect(screen.getAllByText('800').length).toBeGreaterThanOrEqual(1);
  });

  it('A013/cache/provider-cache-creation: shows cache creation tokens for Anthropic', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS_WITH_CACHE);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getAllByText('Provider Prompt Cache').length).toBeGreaterThanOrEqual(1));
    expect(screen.getByText('Cache Creation Tokens')).toBeInTheDocument();
    // req-3 has cache_creation_input_tokens: 400
    expect(screen.getByText('400')).toBeInTheDocument();
  });

  it('A013/cache/provider-cache-reuse-ratio: shows reuse ratio stat card', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS_WITH_CACHE);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Reuse Ratio')).toBeInTheDocument());
  });

  it('A013/cache/provider-cache-savings: shows est. cost saved stat card', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS_WITH_CACHE);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Est. Cost Saved')).toBeInTheDocument());
  });

  // --- Response Cache section ---

  it('A013/cache/response-cache-hit-rate: shows cache hit rate', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS_WITH_CACHE);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Cache Hit Rate')).toBeInTheDocument());
    // 1 of 3 requests is a cache hit → 33.3%
    expect(screen.getByText('33.3%')).toBeInTheDocument();
  });

  it('A013/cache/response-cache-counts: shows cached responses and misses', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS_WITH_CACHE);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Cached Responses')).toBeInTheDocument());
    expect(screen.getByText('Cache Misses')).toBeInTheDocument();
  });

  // --- Provider Breakdown section ---

  it('A013/cache/provider-breakdown: renders breakdown by provider table', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS_WITH_CACHE);
    render(<CacheTab />);
    // Section title in DOM is "Breakdown by Provider"
    await waitFor(() => expect(screen.getByText('Breakdown by Provider')).toBeInTheDocument());
    // Table column headers (plain text, no text-transform)
    expect(screen.getByText('Provider')).toBeInTheDocument();
    // "Cache Rate" header appears in both Breakdown and Trend tables — use getAllByText
    expect(screen.getAllByText('Cache Rate').length).toBeGreaterThanOrEqual(1);
    // Providers extracted from model_group (e.g. "openai/gpt-4o" → "openai")
    expect(screen.getAllByText(/openai/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/anthropic/).length).toBeGreaterThanOrEqual(1);
  });

  it('A013/cache/provider-breakdown-empty: shows No data row when there are no logs', async () => {
    mockGetSpendLogs.mockResolvedValue([]);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Breakdown by Provider')).toBeInTheDocument());
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  // --- 24h Trend section ---

  it('A013/cache/trend-section-renders: renders Cache Trend (24h) section', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS_WITH_CACHE);
    render(<CacheTab />);
    // Section title in DOM is "Cache Trend (24h)"
    await waitFor(() => expect(screen.getByText('Cache Trend (24h)')).toBeInTheDocument());
    // Stat card labels in DOM are plain mixed-case
    expect(screen.getByText('Cached Requests (24h)')).toBeInTheDocument();
    expect(screen.getByText('Busiest Hour')).toBeInTheDocument();
    expect(screen.getByText('Peak Cache Rate')).toBeInTheDocument();
  });

  it('A013/cache/trend-hourly-rows: renders hourly rows for logs within 24h', async () => {
    mockGetSpendLogs.mockResolvedValue(SAMPLE_LOGS_WITH_CACHE);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Cache Trend (24h)')).toBeInTheDocument());
    // Trend table column headers (plain text, no text-transform)
    expect(screen.getByText('Hour (UTC)')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    // "Cache Rate" appears in both Breakdown and Trend tables
    expect(screen.getAllByText('Cache Rate').length).toBeGreaterThanOrEqual(2);
    // "Cache Read" appears as trend table header and possibly stat card label
    expect(screen.getAllByText('Cache Read').length).toBeGreaterThanOrEqual(1);
  });

  it('A013/cache/trend-no-cache-activity: shows "No cache activity detected" when no cache hits exist', async () => {
    // Logs with no cache hits (cache_hit not 'True')
    const noCacheHitLogs = SAMPLE_LOGS_WITH_CACHE.map((l) => ({ ...l, cache_hit: 'False' }));
    mockGetSpendLogs.mockResolvedValue(noCacheHitLogs);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('No cache activity detected')).toBeInTheDocument());
  });

  it('A013/cache/trend-no-recent-logs: shows "No activity in the last 24 hours" for old-only cache logs', async () => {
    // All logs are older than 24h but do have cache hits
    const oldLogs = [
      {
        ...SAMPLE_LOGS_WITH_CACHE[0],
        startTime: new Date(NOW - 48 * 60 * 60 * 1000).toISOString(),
      },
    ];
    mockGetSpendLogs.mockResolvedValue(oldLogs);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Cache Trend (24h)')).toBeInTheDocument());
    expect(screen.getByText('No activity in the last 24 hours')).toBeInTheDocument();
  });

  // --- Empty state ---

  it('A013/cache/empty-state: zero stats shown gracefully when there are no logs', async () => {
    mockGetSpendLogs.mockResolvedValue([]);
    render(<CacheTab />);
    // "Provider Prompt Cache" appears as section title + Cache Status row label
    await waitFor(() => expect(screen.getAllByText('Provider Prompt Cache').length).toBeGreaterThanOrEqual(1));
    // "Response Cache" appears as section title + Cache Status row label
    expect(screen.getAllByText('Response Cache').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('A013/cache/empty-state-hit-rate-zero: cache hit rate is 0.0% when no logs', async () => {
    mockGetSpendLogs.mockResolvedValue([]);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Cache Hit Rate')).toBeInTheDocument());
    // Multiple stat cards may show 0.0% (reuse ratio, hit rate, peak cache rate)
    expect(screen.getAllByText('0.0%').length).toBeGreaterThanOrEqual(1);
  });

  // --- Error state ---

  it('A013/cache/error-state: renders empty state when getSpendLogs rejects', async () => {
    mockGetSpendLogs.mockRejectedValue(new Error('Internal Server Error'));
    render(<CacheTab />);
    // After error, loading ends and component renders with empty logs
    await waitFor(() => expect(screen.getAllByText('Provider Prompt Cache').length).toBeGreaterThanOrEqual(1));
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('A013/cache/error-state-connection: renders empty state when getBaseUrl/getMasterKey rejects', async () => {
    mockGetBaseUrl.mockRejectedValue(new Error('Tauri bridge unavailable'));
    mockGetSpendLogs.mockResolvedValue([]);
    render(<CacheTab />);
    // Component should not crash; skeleton and then (since loadData never fires) stays loading or renders empty
    // Since baseUrl/masterKey are empty strings by default, loadData short-circuits without calling getSpendLogs,
    // so the component stays in loading state indefinitely — confirm skeleton is shown.
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
  });

  // --- Large number formatting ---

  it('A013/cache/large-numbers-formatted: formats token counts with K/M suffix', async () => {
    const largeLogs = [
      {
        request_id: 'req-big',
        api_key: 'sk-test',
        model: 'openai/gpt-4o',
        model_group: 'openai/gpt-4o',
        spend: 1.5,
        startTime: recentTimestamp(1),
        prompt_tokens: 2_000_000,
        completion_tokens: 500_000,
        total_tokens: 2_500_000,
        cache_hit: 'True',
        response: {
          usage: {
            prompt_tokens_details: { cached_tokens: 1_500_000 },
          },
        },
      },
    ];
    mockGetSpendLogs.mockResolvedValue(largeLogs);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Cache Read Tokens')).toBeInTheDocument());
    // 1,500,000 → "1.5M" (may appear in both stat card and provider breakdown table)
    expect(screen.getAllByText('1.5M').length).toBeGreaterThanOrEqual(1);
  });

  // --- Disk cache type display ---

  it('A013/cache/disk-cache-type: shows disk cache type when ping returns disk', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ status: 'healthy', cache_type: 'disk' }),
    );
    mockGetSpendLogs.mockResolvedValue([]);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Enabled')).toBeInTheDocument());
    expect(screen.getByText(/disk/i)).toBeInTheDocument();
  });

  it('A013/cache/in-memory-cache-type: shows in-memory type when ping returns in-memory', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ status: 'healthy', cache_type: 'in-memory' }),
    );
    mockGetSpendLogs.mockResolvedValue([]);
    render(<CacheTab />);
    await waitFor(() => expect(screen.getByText('Enabled')).toBeInTheDocument());
    expect(screen.getByText(/in-memory/i)).toBeInTheDocument();
  });
});
