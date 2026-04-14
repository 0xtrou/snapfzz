// A013/Analytics: LLM usage analytics dashboard — server-side aggregation.
// Composes analytics sub-components from ./analytics/.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, message, Radio, Skeleton } from 'antd';
import {
  getBaseUrl,
  getMasterKey,
  getSpendSummary,
  getSpendReport,
  getDailyActivity,
  type SpendSummary,
  type SpendReportEntry,
  type DailyActivity,
} from '../hooks/useLlmCommands';
import {
  OverviewCards,
  MetricRows,
  ActivityHeatmap,
  TokenCostTrend,
  DonutChart,
  ModelUsageChart,
  BreakdownTable,
  BreakdownDonut,
} from './analytics';
import { formatTokens, formatCost, SHARE_COLORS } from './analytics/shared';

type TimeRange = '1D' | '30D' | 'YTD' | 'All';

function dateRangeForFilter(range: TimeRange): { start?: string; end?: string } {
  if (range === 'All') return {};
  const end = new Date();
  let start: Date;
  if (range === 'YTD') {
    start = new Date(end.getFullYear(), 0, 1);
  } else {
    const days = range === '1D' ? 1 : 30;
    start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  }
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function buildBreakdownRows(data: Record<string, { spend: number; total_tokens?: number; prompt_tokens?: number; completion_tokens?: number; api_requests?: number }> | undefined) {
  if (!data) return [];
  const entries = Object.entries(data).map(([name, v]) => ({
    name,
    requests: v.api_requests ?? 0,
    inputTokens: v.prompt_tokens ?? 0,
    outputTokens: v.completion_tokens ?? 0,
    totalTokens: v.total_tokens ?? 0,
    cost: v.spend ?? 0,
    share: 0,
  }));
  const grandTotal = entries.reduce((sum, e) => sum + e.totalTokens, 0);
  for (const e of entries) {
    e.share = grandTotal > 0 ? (e.totalTokens / grandTotal) * 100 : 0;
  }
  return entries.sort((a, b) => b.totalTokens - a.totalTokens);
}

export default function AnalyticsTab() {
  const [baseUrl, setBaseUrl] = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [summary, setSummary] = useState<SpendSummary | null>(null);
  const [report, setReport] = useState<SpendReportEntry[]>([]);
  const [dailyData, setDailyData] = useState<DailyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30D');

  const loadData = useCallback(async () => {
    if (!baseUrl || !masterKey) return;
    setLoading(true);
    try {
      const { start, end } = dateRangeForFilter(timeRange);
      const [s, r, d] = await Promise.all([
        getSpendSummary(baseUrl, masterKey, start, end).catch(() => null),
        getSpendReport(baseUrl, masterKey, start, end).catch(() => []),
        getDailyActivity(baseUrl, masterKey, start || '2025-01-01', end || new Date().toISOString().slice(0, 10)).catch(() => []),
      ]);
      setSummary(s);
      setReport(r);
      setDailyData(d);
    } catch (err) {
      console.error('[AnalyticsTab] Failed to load analytics:', err);
      message.error('Failed to load usage data');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, masterKey, timeRange]);

  useEffect(() => {
    Promise.all([getBaseUrl(), getMasterKey()])
      .then(([url, key]) => { setBaseUrl(url); setMasterKey(key); })
      .catch(() => message.error('Failed to connect to LLM gateway'));
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // Breakdowns from summary
  const modelRows = useMemo(() => buildBreakdownRows(summary?.per_model), [summary]);
  const providerRows = useMemo(() => buildBreakdownRows(summary?.per_provider), [summary]);
  const keyRows = useMemo(() => buildBreakdownRows(summary?.per_api_key), [summary]);

  // Fallback from report if summary lacks breakdowns
  const reportRows = useMemo(() => {
    if (modelRows.length > 0 || report.length === 0) return [];
    return buildBreakdownRows(
      Object.fromEntries(
        report.filter((r) => r.model || r.provider).map((r) => [
          r.model || r.provider || 'unknown',
          { spend: r.spend, total_tokens: r.total_tokens, prompt_tokens: r.prompt_tokens, completion_tokens: r.completion_tokens, api_requests: r.api_requests },
        ]),
      ),
    );
  }, [modelRows, report]);

  // Heatmap data
  const heatmapData = useMemo(() =>
    dailyData.map((d) => ({ date: d.date, tokens: d.total_tokens, requests: d.api_requests })),
    [dailyData],
  );

  // Token & Cost trend
  const trendData = useMemo(() =>
    dailyData.map((d) => ({ date: d.date, inputTokens: d.prompt_tokens, outputTokens: d.completion_tokens, cost: d.spend })),
    [dailyData],
  );

  // Model usage over time (for stacked area chart)
  const modelTimeData = useMemo(() => {
    if (!dailyData.length) return [];
    // Group by date, collect per-model tokens
    const byDate = new Map<string, Record<string, number>>();
    for (const d of dailyData) {
      const key = d.date;
      if (!byDate.has(key)) byDate.set(key, {});
      const models = byDate.get(key)!;
      const modelName = d.model || 'unknown';
      models[modelName] = (models[modelName] || 0) + d.total_tokens;
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, models]) => ({ date, models }));
  }, [dailyData]);

  // Donut data for cost by provider
  const providerDonutSlices = useMemo(() =>
    providerRows.map((r, i) => ({ label: r.name, value: r.cost, color: SHARE_COLORS[i % SHARE_COLORS.length] })),
    [providerRows],
  );

  // Donut data for by account / by API key
  const accountEntries = useMemo(() =>
    keyRows.map((r) => ({ label: r.name.length > 20 ? `${r.name.slice(0, 8)}...${r.name.slice(-4)}` : r.name, value: r.totalTokens })),
    [keyRows],
  );

  // Computed metrics
  const totalRequests = summary?.api_requests ?? 0;
  const totalTokens = summary?.total_tokens ?? 0;
  const inputTokens = summary?.prompt_tokens ?? 0;
  const outputTokens = summary?.completion_tokens ?? 0;
  const totalSpend = summary?.total_spend ?? 0;

  const metrics = useMemo(() => {
    const uniqueProviders = providerRows.length;
    const uniqueModels = modelRows.length || reportRows.length;
    const uniqueKeys = keyRows.length;
    const avgTokens = totalRequests > 0 ? totalTokens / totalRequests : 0;
    const costPerReq = totalRequests > 0 ? totalSpend / totalRequests : 0;
    const ioRatio = outputTokens > 0 ? inputTokens / outputTokens : 0;
    const topModel = modelRows[0]?.name || reportRows[0]?.name || '—';
    const topProvider = providerRows[0]?.name || '—';

    // Find busiest day
    let busiestDay = '—';
    let maxTokens = 0;
    for (const d of dailyData) {
      if (d.total_tokens > maxTokens) {
        maxTokens = d.total_tokens;
        busiestDay = d.date;
      }
    }

    // Diversity: how evenly distributed across models (Shannon entropy normalized)
    const modelTokens = (modelRows.length > 0 ? modelRows : reportRows).map((r) => r.totalTokens);
    const total = modelTokens.reduce((a, b) => a + b, 0);
    let diversity = 0;
    if (total > 0 && modelTokens.length > 1) {
      let entropy = 0;
      for (const t of modelTokens) {
        if (t > 0) {
          const p = t / total;
          entropy -= p * Math.log2(p);
        }
      }
      diversity = (entropy / Math.log2(modelTokens.length)) * 100;
    } else if (modelTokens.length === 1) {
      diversity = 100;
    }

    return {
      infrastructure: { accounts: uniqueKeys, providers: uniqueProviders, apiKeys: uniqueKeys, models: uniqueModels },
      performance: { avgTokensPerReq: avgTokens, costPerReq, ioRatio, fallbackRate: 100 },
      highlights: { topModel, topProvider, busiestDay, diversity },
    };
  }, [totalRequests, totalTokens, totalSpend, inputTokens, outputTokens, modelRows, providerRows, keyRows, reportRows, dailyData]);

  if (loading) {
    return <Skeleton active paragraph={{ rows: 12 }} />;
  }

  if (!summary && report.length === 0) {
    return <Empty description="No usage data yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Time range selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700 }}>Usage Analytics</div>
        <Radio.Group value={timeRange} onChange={(e) => setTimeRange(e.target.value)} size="small">
          <Radio.Button value="1D">1D</Radio.Button>
          <Radio.Button value="30D">30D</Radio.Button>
          <Radio.Button value="YTD">YTD</Radio.Button>
          <Radio.Button value="All">All</Radio.Button>
        </Radio.Group>
      </div>

      {/* Overview cards */}
      <OverviewCards
        totalTokens={totalTokens}
        inputTokens={inputTokens}
        outputTokens={outputTokens}
        totalSpend={totalSpend}
        requestCount={totalRequests}
      />

      {/* Metric rows */}
      <MetricRows
        infrastructure={metrics.infrastructure}
        performance={metrics.performance}
        highlights={metrics.highlights}
      />

      {/* Activity heatmap */}
      <ActivityHeatmap dailyData={heatmapData} />

      {/* Charts row: Token & Cost Trend + Cost by Provider */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <TokenCostTrend data={trendData} />
        <DonutChart title="COST BY PROVIDER" slices={providerDonutSlices} totalLabel={formatCost(totalSpend)} />
      </div>

      {/* Model Usage Over Time */}
      <ModelUsageChart data={modelTimeData} />

      {/* Donut row: By Account + By API Key */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <BreakdownDonut title="BY ACCOUNT" entries={accountEntries} />
        <BreakdownDonut title="BY API KEY" entries={accountEntries} />
      </div>

      {/* Provider Breakdown */}
      <BreakdownTable title="PROVIDER BREAKDOWN" rows={providerRows} nameHeader="PROVIDER" />

      {/* Model Breakdown */}
      <BreakdownTable
        title="MODEL BREAKDOWN"
        rows={modelRows.length > 0 ? modelRows : reportRows}
        nameHeader="MODEL"
      />

      {/* API Key Breakdown */}
      <BreakdownTable title="API KEY BREAKDOWN" rows={keyRows} nameHeader="API KEY" filterPlaceholder="Filter API key..." />
    </div>
  );
}
