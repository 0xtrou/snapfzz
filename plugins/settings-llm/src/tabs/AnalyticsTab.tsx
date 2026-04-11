// A013/Analytics: LLM usage analytics dashboard tab

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, Input, message, Radio, Skeleton, Statistic, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { getSpendLogs, getBaseUrl, getMasterKey, type SpendLog } from '../hooks/useLlmCommands';

const { Text } = Typography;

// A013/Analytics: Time range filter options
type TimeRange = '1D' | '7D' | '30D' | 'All';

// -- Aggregation types --

interface UsageOverview {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  requestCount: number;
}

interface ProviderBreakdown {
  provider: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  share: number;
}

interface ModelBreakdown {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  share: number;
}

interface KeyBreakdown {
  apiKey: string;
  maskedKey: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

// -- Formatting utilities --

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatCost(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function maskKey(key: string): string {
  if (key.length > 12) return `${key.slice(0, 4)}...${key.slice(-4)}`;
  return key;
}

function extractProvider(model: string): string {
  const parts = model.split('/');
  return parts.length > 1 ? parts[0] : 'unknown';
}

// -- Aggregation functions (per A002: computed outside render path) --

function filterByTimeRange(logs: SpendLog[], range: TimeRange): SpendLog[] {
  if (range === 'All') return logs;
  const now = Date.now();
  const days = range === '1D' ? 1 : range === '7D' ? 7 : 30;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return logs.filter((log) => {
    const ts = log.startTime || log.timestamp;
    if (!ts) return false;
    return new Date(ts).getTime() >= cutoff;
  });
}

function computeOverview(logs: SpendLog[]): UsageOverview {
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let estimatedCost = 0;
  for (const log of logs) {
    inputTokens += log.prompt_tokens || 0;
    outputTokens += log.completion_tokens || 0;
    totalTokens += log.total_tokens || (log.prompt_tokens || 0) + (log.completion_tokens || 0);
    estimatedCost += log.spend || 0;
  }
  return { totalTokens, inputTokens, outputTokens, estimatedCost, requestCount: logs.length };
}

function aggregateByProvider(logs: SpendLog[]): ProviderBreakdown[] {
  const map = new Map<string, Omit<ProviderBreakdown, 'share'>>();
  for (const log of logs) {
    const provider = extractProvider(log.model);
    const entry = map.get(provider) || { provider, requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
    entry.requests += 1;
    entry.inputTokens += log.prompt_tokens || 0;
    entry.outputTokens += log.completion_tokens || 0;
    entry.totalTokens += log.total_tokens || (log.prompt_tokens || 0) + (log.completion_tokens || 0);
    entry.cost += log.spend || 0;
    map.set(provider, entry);
  }
  const entries = [...map.values()];
  const grandTotal = entries.reduce((sum, e) => sum + e.totalTokens, 0);
  return entries
    .map((e) => ({ ...e, share: grandTotal > 0 ? (e.totalTokens / grandTotal) * 100 : 0 }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

function aggregateByModel(logs: SpendLog[]): ModelBreakdown[] {
  const map = new Map<string, Omit<ModelBreakdown, 'share'>>();
  for (const log of logs) {
    const entry = map.get(log.model) || { model: log.model, requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
    entry.requests += 1;
    entry.inputTokens += log.prompt_tokens || 0;
    entry.outputTokens += log.completion_tokens || 0;
    entry.totalTokens += log.total_tokens || (log.prompt_tokens || 0) + (log.completion_tokens || 0);
    entry.cost += log.spend || 0;
    map.set(log.model, entry);
  }
  const entries = [...map.values()];
  const grandTotal = entries.reduce((sum, e) => sum + e.totalTokens, 0);
  return entries
    .map((e) => ({ ...e, share: grandTotal > 0 ? (e.totalTokens / grandTotal) * 100 : 0 }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

function aggregateByKey(logs: SpendLog[]): KeyBreakdown[] {
  const map = new Map<string, KeyBreakdown>();
  for (const log of logs) {
    const entry = map.get(log.api_key) || {
      apiKey: log.api_key,
      maskedKey: maskKey(log.api_key),
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cost: 0,
    };
    entry.requests += 1;
    entry.inputTokens += log.prompt_tokens || 0;
    entry.outputTokens += log.completion_tokens || 0;
    entry.totalTokens += log.total_tokens || (log.prompt_tokens || 0) + (log.completion_tokens || 0);
    entry.cost += log.spend || 0;
    map.set(log.api_key, entry);
  }
  return [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens);
}

// -- Share bar component --

// Per A013/Analytics: deterministic color assignment for provider/model share bars
const SHARE_COLORS = [
  'var(--color-info)',
  'var(--color-success)',
  'var(--color-cyan)',
  'var(--color-gold)',
  'var(--color-warning)',
  'var(--color-error)',
];

function ShareBar({ pct, colorIndex }: { pct: number; colorIndex: number }) {
  const color = SHARE_COLORS[colorIndex % SHARE_COLORS.length];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
      <div
        style={{
          width: `${Math.max(pct, 2)}%`,
          maxWidth: 80,
          height: 6,
          borderRadius: 3,
          background: color,
        }}
      />
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

// -- Stat card --

function StatCard({
  label,
  value,
  subtitle,
  valueColor,
}: {
  label: string;
  value: string;
  subtitle?: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '16px 20px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <Statistic
        value={value}
        valueStyle={{
          fontSize: 24,
          fontWeight: 700,
          color: valueColor || 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
        }}
      />
      {subtitle && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{subtitle}</div>
      )}
    </div>
  );
}

// -- Infrastructure / Performance / Highlights --

function MetricGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
      {items.map((item) => (
        <div key={item.label} style={{ padding: '8px 0' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {item.label}
          </div>
          <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 500, fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border-default)' }}>
      {title}
    </div>
  );
}

// -- Main component --

export default function AnalyticsTab() {
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [masterKey, setMasterKey] = useState<string>('');
  const [allLogs, setAllLogs] = useState<SpendLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('All');
  const [keyFilter, setKeyFilter] = useState('');

  const loadLogs = useCallback(async () => {
    if (!baseUrl || !masterKey) return;
    setLoading(true);
    try {
      const result = await getSpendLogs(baseUrl, masterKey, {});
      setAllLogs(result);
    } catch (err) {
      console.error('[AnalyticsTab] Failed to load spend logs:', err);
      message.error('Failed to load usage data');
      setAllLogs([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, masterKey]);

  useEffect(() => {
    Promise.all([getBaseUrl(), getMasterKey()])
      .then(([url, key]) => {
        setBaseUrl(url);
        setMasterKey(key);
      })
      .catch(() => message.error('Failed to connect to LLM gateway'));
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  // Per A002/Zone3: aggregate data in useMemo, not in render path
  const filteredLogs = useMemo(() => filterByTimeRange(allLogs, timeRange), [allLogs, timeRange]);
  const overview = useMemo(() => computeOverview(filteredLogs), [filteredLogs]);
  const providerData = useMemo(() => aggregateByProvider(filteredLogs), [filteredLogs]);
  const modelData = useMemo(() => aggregateByModel(filteredLogs), [filteredLogs]);
  const keyData = useMemo(() => aggregateByKey(filteredLogs), [filteredLogs]);

  const filteredKeyData = useMemo(() => {
    if (!keyFilter) return keyData;
    const lower = keyFilter.toLowerCase();
    return keyData.filter((k) => k.maskedKey.toLowerCase().includes(lower) || k.apiKey.toLowerCase().includes(lower));
  }, [keyData, keyFilter]);

  // Per A013/Analytics: compute infrastructure, performance, and highlight metrics
  const infraMetrics = useMemo(() => {
    const uniqueKeys = new Set(filteredLogs.map((l) => l.api_key));
    const uniqueProviders = new Set(filteredLogs.map((l) => extractProvider(l.model)));
    const uniqueModels = new Set(filteredLogs.map((l) => l.model));
    return [
      { label: 'Providers', value: String(uniqueProviders.size) },
      { label: 'API Keys', value: String(uniqueKeys.size) },
      { label: 'Models', value: String(uniqueModels.size) },
      { label: 'Requests', value: String(filteredLogs.length) },
    ];
  }, [filteredLogs]);

  const perfMetrics = useMemo(() => {
    const count = filteredLogs.length || 1;
    const avgTokens = overview.totalTokens / count;
    const avgCost = overview.estimatedCost / count;
    const ioRatio = overview.outputTokens > 0 ? (overview.inputTokens / overview.outputTokens).toFixed(2) : 'N/A';
    return [
      { label: 'Avg Tokens/Req', value: formatTokens(Math.round(avgTokens)) },
      { label: 'Avg Cost/Req', value: formatCost(avgCost) },
      { label: 'I/O Ratio', value: String(ioRatio) },
    ];
  }, [filteredLogs.length, overview]);

  const highlightMetrics = useMemo(() => {
    if (filteredLogs.length === 0) return [
      { label: 'Top Model', value: '-' },
      { label: 'Top Provider', value: '-' },
      { label: 'Busiest Day', value: '-' },
    ];
    const topModel = modelData[0]?.model || '-';
    const topProvider = providerData[0]?.provider || '-';

    const dayMap = new Map<string, number>();
    for (const log of filteredLogs) {
      const ts = log.startTime || log.timestamp;
      if (!ts) continue;
      const day = new Date(ts).toISOString().slice(0, 10);
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }
    let busiestDay = '-';
    let maxReqs = 0;
    for (const [day, count] of dayMap) {
      if (count > maxReqs) {
        maxReqs = count;
        busiestDay = day;
      }
    }

    return [
      { label: 'Top Model', value: topModel },
      { label: 'Top Provider', value: topProvider },
      { label: 'Busiest Day', value: busiestDay },
    ];
  }, [filteredLogs, modelData, providerData]);

  // -- Table columns --

  const providerColumns: TableColumnsType<ProviderBreakdown> = [
    { title: 'Provider', dataIndex: 'provider', key: 'provider', render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Requests', dataIndex: 'requests', key: 'requests', align: 'right' },
    { title: 'Input', dataIndex: 'inputTokens', key: 'inputTokens', align: 'right', render: (v: number) => formatTokens(v) },
    { title: 'Output', dataIndex: 'outputTokens', key: 'outputTokens', align: 'right', render: (v: number) => formatTokens(v) },
    { title: 'Total', dataIndex: 'totalTokens', key: 'totalTokens', align: 'right', render: (v: number) => formatTokens(v) },
    { title: 'Cost', dataIndex: 'cost', key: 'cost', align: 'right', render: (v: number) => <Text style={{ fontFamily: 'var(--font-mono)' }}>{formatCost(v)}</Text> },
    {
      title: 'Share',
      dataIndex: 'share',
      key: 'share',
      width: 140,
      align: 'right' as const,
      render: (_: number, _record: ProviderBreakdown, index: number) => <ShareBar pct={_} colorIndex={index} />,
    },
  ];

  const modelColumns: TableColumnsType<ModelBreakdown> = [
    {
      title: 'Model',
      dataIndex: 'model',
      key: 'model',
      render: (v: string, _: ModelBreakdown, index: number) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: SHARE_COLORS[index % SHARE_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
          <Text strong>{v}</Text>
        </span>
      ),
    },
    { title: 'Requests', dataIndex: 'requests', key: 'requests', align: 'right' },
    { title: 'Input', dataIndex: 'inputTokens', key: 'inputTokens', align: 'right', render: (v: number) => formatTokens(v) },
    { title: 'Output', dataIndex: 'outputTokens', key: 'outputTokens', align: 'right', render: (v: number) => formatTokens(v) },
    { title: 'Total', dataIndex: 'totalTokens', key: 'totalTokens', align: 'right', render: (v: number) => formatTokens(v) },
    { title: 'Cost', dataIndex: 'cost', key: 'cost', align: 'right', render: (v: number) => <Text style={{ fontFamily: 'var(--font-mono)' }}>{formatCost(v)}</Text> },
    {
      title: 'Share',
      dataIndex: 'share',
      key: 'share',
      width: 140,
      align: 'right' as const,
      render: (_: number, _record: ModelBreakdown, index: number) => <ShareBar pct={_} colorIndex={index} />,
    },
  ];

  const keyColumns: TableColumnsType<KeyBreakdown> = [
    {
      title: 'API Key',
      dataIndex: 'maskedKey',
      key: 'maskedKey',
      render: (v: string) => <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm, 13px)' }}>{v}</Text>,
    },
    { title: 'Requests', dataIndex: 'requests', key: 'requests', align: 'right' },
    { title: 'Input', dataIndex: 'inputTokens', key: 'inputTokens', align: 'right', render: (v: number) => formatTokens(v) },
    { title: 'Output', dataIndex: 'outputTokens', key: 'outputTokens', align: 'right', render: (v: number) => formatTokens(v) },
    { title: 'Total Tokens', dataIndex: 'totalTokens', key: 'totalTokens', align: 'right', render: (v: number) => formatTokens(v) },
    { title: 'Cost', dataIndex: 'cost', key: 'cost', align: 'right', render: (v: number) => <Text style={{ fontFamily: 'var(--font-mono)' }}>{formatCost(v)}</Text> },
  ];

  if (loading) {
    return <Skeleton active paragraph={{ rows: 12 }} />;
  }

  if (allLogs.length === 0) {
    return <Empty description="No usage data yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Time range selector */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Radio.Group value={timeRange} onChange={(e) => setTimeRange(e.target.value)} size="small">
          <Radio.Button value="1D">1D</Radio.Button>
          <Radio.Button value="7D">7D</Radio.Button>
          <Radio.Button value="30D">30D</Radio.Button>
          <Radio.Button value="All">All</Radio.Button>
        </Radio.Group>
      </div>

      {/* Usage overview cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard
          label="TOTAL TOKENS"
          value={formatTokens(overview.totalTokens)}
          subtitle={`${overview.requestCount} requests`}
        />
        <StatCard
          label="INPUT TOKENS"
          value={formatTokens(overview.inputTokens)}
          subtitle={`${overview.requestCount} requests`}
          valueColor="var(--color-success)"
        />
        <StatCard
          label="OUTPUT TOKENS"
          value={formatTokens(overview.outputTokens)}
          subtitle={`${overview.requestCount} requests`}
          valueColor="var(--color-cyan)"
        />
        <StatCard
          label="EST. COST"
          value={formatCost(overview.estimatedCost)}
          subtitle={`${overview.requestCount} requests`}
          valueColor="var(--color-gold)"
        />
      </div>

      {/* Infrastructure + Performance + Highlights */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, background: 'var(--bg-default)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 16 }}>
          <SectionHeader title="Infrastructure" />
          <MetricGrid items={infraMetrics} />
        </div>
        <div style={{ flex: 1, minWidth: 200, background: 'var(--bg-default)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 16 }}>
          <SectionHeader title="Performance" />
          <MetricGrid items={perfMetrics} />
        </div>
        <div style={{ flex: 1, minWidth: 200, background: 'var(--bg-default)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 16 }}>
          <SectionHeader title="Highlights" />
          <MetricGrid items={highlightMetrics} />
        </div>
      </div>

      {/* Provider Breakdown */}
      <div>
        <SectionHeader title="Provider Breakdown" />
        <Table<ProviderBreakdown>
          rowKey="provider"
          columns={providerColumns}
          dataSource={providerData}
          pagination={false}
          size="small"
        />
      </div>

      {/* Model Breakdown */}
      <div>
        <SectionHeader title="Model Breakdown" />
        <Table<ModelBreakdown>
          rowKey="model"
          columns={modelColumns}
          dataSource={modelData}
          pagination={false}
          size="small"
        />
      </div>

      {/* API Key Breakdown */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <SectionHeader title="API Key Breakdown" />
          <Input
            placeholder="Filter keys..."
            value={keyFilter}
            onChange={(e) => setKeyFilter(e.target.value)}
            style={{ width: 200 }}
            size="small"
            allowClear
          />
        </div>
        <Table<KeyBreakdown>
          rowKey="apiKey"
          columns={keyColumns}
          dataSource={filteredKeyData}
          pagination={false}
          size="small"
        />
      </div>
    </div>
  );
}
