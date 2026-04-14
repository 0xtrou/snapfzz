// A013/Analytics: LLM usage analytics dashboard — server-side aggregation.
// Composes analytics sub-components from ./analytics/.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, message, Radio, Skeleton } from 'antd';
import {
  getBaseUrl,
  getMasterKey,
  getSpendLogs,
  type SpendLog,
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
  const now = new Date();
  // Use tomorrow as end_date so records timestamped with timezone-shifted or
  // slightly future timestamps (e.g. UTC+N clocks) are not cut off by the filter.
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  let start: Date;
  if (range === 'YTD') {
    start = new Date(now.getFullYear(), 0, 1);
  } else {
    const days = range === '1D' ? 1 : 30;
    start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}


export default function AnalyticsTab() {
  const [baseUrl, setBaseUrl] = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [logs, setLogs] = useState<SpendLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30D');

  const loadData = useCallback(async () => {
    if (!baseUrl || !masterKey) return;
    setLoading(true);
    try {
      const { start, end } = dateRangeForFilter(timeRange);
      // /spend/logs with date filters — the only analytics endpoint available
      // without LiteLLM Enterprise. Fetch ALL logs (LiteLLM date filter is
      // unreliable) then filter client-side by date + non-empty model.
      const raw = await getSpendLogs(baseUrl, masterKey, {});
      const withModel = raw.filter((l) => l.model && l.model.trim() !== '');
      if (start) {
        const startMs = new Date(start).getTime();
        const endMs = end ? new Date(end).getTime() : Date.now();
        setLogs(withModel.filter((l) => {
          const ts = l.startTime || l.timestamp;
          if (!ts) return false;
          const t = new Date(ts).getTime();
          return t >= startMs && t <= endMs;
        }));
      } else {
        setLogs(withModel);
      }
    } catch (err) {
      console.error('[AnalyticsTab] Failed to load analytics:', err);
      message.error('Failed to load usage data');
      setLogs([]);
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

  // Single-pass client-side aggregation from spend logs.
  // /global/spend/report and /spend/logs?summarize=true require LiteLLM Enterprise.
  const computed = useMemo(() => {
    let totalTokens = 0, inputTokens = 0, outputTokens = 0, totalSpend = 0;
    const modelMap = new Map<string, { requests: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number }>();
    const providerMap = new Map<string, { requests: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number }>();
    const keyMap = new Map<string, { requests: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number }>();
    const dayMap = new Map<string, { tokens: number; requests: number; inputTokens: number; outputTokens: number; cost: number }>();

    for (const log of logs) {
      const pt = log.prompt_tokens ?? 0;
      const ct = log.completion_tokens ?? 0;
      const tt = log.total_tokens ?? (pt + ct);
      const spend = log.spend ?? 0;
      inputTokens += pt;
      outputTokens += ct;
      totalTokens += tt;
      totalSpend += spend;

      // Model breakdown
      const model = log.model_group || log.model || 'unknown';
      const me = modelMap.get(model) ?? { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
      me.requests++; me.inputTokens += pt; me.outputTokens += ct; me.totalTokens += tt; me.cost += spend;
      modelMap.set(model, me);

      // Provider breakdown
      const provider = log.custom_llm_provider || (model.includes('/') ? model.split('/')[0] : model);
      const pe = providerMap.get(provider) ?? { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
      pe.requests++; pe.inputTokens += pt; pe.outputTokens += ct; pe.totalTokens += tt; pe.cost += spend;
      providerMap.set(provider, pe);

      // Key breakdown
      const key = log.api_key || 'unknown';
      const maskedKey = key.length > 12 ? `${key.slice(0, 4)}...${key.slice(-4)}` : key;
      const ke = keyMap.get(maskedKey) ?? { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
      ke.requests++; ke.inputTokens += pt; ke.outputTokens += ct; ke.totalTokens += tt; ke.cost += spend;
      keyMap.set(maskedKey, ke);

      // Daily breakdown
      const ts = log.startTime || log.timestamp;
      const day = ts ? new Date(ts).toISOString().slice(0, 10) : 'unknown';
      if (day !== 'unknown') {
        const de = dayMap.get(day) ?? { tokens: 0, requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
        de.tokens += tt; de.requests++; de.inputTokens += pt; de.outputTokens += ct; de.cost += spend;
        dayMap.set(day, de);
      }
    }

    const toRows = (map: Map<string, { requests: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number }>) => {
      const entries = [...map.entries()].map(([name, v]) => ({ name, ...v, share: 0 }));
      const grand = entries.reduce((s, e) => s + e.totalTokens, 0);
      for (const e of entries) e.share = grand > 0 ? (e.totalTokens / grand) * 100 : 0;
      return entries.sort((a, b) => b.totalTokens - a.totalTokens);
    };

    return { totalTokens, inputTokens, outputTokens, totalSpend, modelRows: toRows(modelMap), providerRows: toRows(providerMap), keyRows: toRows(keyMap), dayMap };
  }, [logs]);

  const { totalTokens, inputTokens, outputTokens, totalSpend, modelRows, providerRows, keyRows } = computed;
  const totalRequests = logs.length;

  // Heatmap data
  const heatmapData = useMemo(() =>
    [...computed.dayMap.entries()].map(([date, d]) => ({ date, tokens: d.tokens, requests: d.requests })),
    [computed.dayMap],
  );

  // Trend data
  const trendData = useMemo(() =>
    [...computed.dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, inputTokens: d.inputTokens, outputTokens: d.outputTokens, cost: d.cost })),
    [computed.dayMap],
  );

  // Model usage over time
  const modelTimeData = useMemo(() => {
    const byDate = new Map<string, Record<string, number>>();
    for (const log of logs) {
      const ts = log.startTime || log.timestamp;
      const day = ts ? new Date(ts).toISOString().slice(0, 10) : null;
      if (!day) continue;
      if (!byDate.has(day)) byDate.set(day, {});
      const models = byDate.get(day)!;
      const model = log.model_group || log.model || 'unknown';
      models[model] = (models[model] || 0) + (log.total_tokens ?? 0);
    }
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, models]) => ({ date, models }));
  }, [logs]);

  // Donut slices
  const providerDonutSlices = useMemo(() =>
    providerRows.map((r, i) => ({ label: r.name, value: r.cost, color: SHARE_COLORS[i % SHARE_COLORS.length] })),
    [providerRows],
  );

  const accountEntries = useMemo(() =>
    keyRows.map((r) => ({ label: r.name, value: r.totalTokens })),
    [keyRows],
  );

  // Metrics
  const metrics = useMemo(() => {
    const avgTokens = totalRequests > 0 ? totalTokens / totalRequests : 0;
    const costPerReq = totalRequests > 0 ? totalSpend / totalRequests : 0;
    const ioRatio = outputTokens > 0 ? inputTokens / outputTokens : 0;
    const topModel = modelRows[0]?.name || '—';
    const topProvider = providerRows[0]?.name || '—';
    let busiestDay = '—', maxTokens = 0;
    for (const [day, d] of computed.dayMap) { if (d.tokens > maxTokens) { maxTokens = d.tokens; busiestDay = day; } }

    const modelTokens = modelRows.map((r) => r.totalTokens);
    const total = modelTokens.reduce((a, b) => a + b, 0);
    let diversity = 0;
    if (total > 0 && modelTokens.length > 1) {
      let entropy = 0;
      for (const t of modelTokens) { if (t > 0) { const p = t / total; entropy -= p * Math.log2(p); } }
      diversity = (entropy / Math.log2(modelTokens.length)) * 100;
    } else if (modelTokens.length === 1) diversity = 100;

    return {
      infrastructure: { accounts: keyRows.length, providers: providerRows.length, apiKeys: keyRows.length, models: modelRows.length },
      performance: { avgTokensPerReq: avgTokens, costPerReq, ioRatio, fallbackRate: 100 },
      highlights: { topModel, topProvider, busiestDay, diversity },
    };
  }, [totalRequests, totalTokens, totalSpend, inputTokens, outputTokens, modelRows, providerRows, keyRows, computed.dayMap]);

  if (loading) {
    return <Skeleton active paragraph={{ rows: 12 }} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, overflow: 'hidden' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16 }}>
        <div style={{ minHeight: 0 }}><TokenCostTrend data={trendData} /></div>
        <div style={{ minHeight: 0 }}><DonutChart title="COST BY PROVIDER" slices={providerDonutSlices} totalLabel={formatCost(totalSpend)} /></div>
      </div>

      {/* Model Usage Over Time */}
      <ModelUsageChart data={modelTimeData} />

      {/* Donut row: By Account + By API Key */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
        <div style={{ minHeight: 0 }}><BreakdownDonut title="BY ACCOUNT" entries={accountEntries} /></div>
        <div style={{ minHeight: 0 }}><BreakdownDonut title="BY API KEY" entries={accountEntries} /></div>
      </div>

      {/* Provider Breakdown */}
      <BreakdownTable title="PROVIDER BREAKDOWN" rows={providerRows} nameHeader="PROVIDER" />

      {/* Model Breakdown */}
      <BreakdownTable
        title="MODEL BREAKDOWN"
        rows={modelRows}
        nameHeader="MODEL"
      />

      {/* API Key Breakdown */}
      <BreakdownTable title="API KEY BREAKDOWN" rows={keyRows} nameHeader="API KEY" filterPlaceholder="Filter API key..." />
    </div>
  );
}
