// A013/Analytics: LLM usage analytics dashboard — uses server-side aggregation.
// No client-side log processing. All data comes pre-computed from LiteLLM endpoints:
//   GET /spend/logs?summarize=true  — overview totals
//   GET /global/spend/report        — provider/model/key breakdowns

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, message, Radio, Skeleton, Statistic, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import {
  getBaseUrl,
  getMasterKey,
  getSpendSummary,
  getSpendReport,
  type SpendSummary,
  type SpendReportEntry,
} from '../hooks/useLlmCommands';

const { Text } = Typography;

type TimeRange = '1D' | '7D' | '30D' | 'All';

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

function dateRangeForFilter(range: TimeRange): { start?: string; end?: string } {
  if (range === 'All') return {};
  const days = range === '1D' ? 1 : range === '7D' ? 7 : 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

// -- Share bar --

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
      <div style={{ width: `${Math.max(pct, 2)}%`, maxWidth: 80, height: 6, borderRadius: 3, background: color }} />
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{pct.toFixed(1)}%</span>
    </div>
  );
}

// -- Stat card --

function StatCard({ label, value, subtitle, valueColor }: {
  label: string;
  value: string;
  subtitle?: string;
  valueColor?: string;
}) {
  return (
    <div style={{
      background: 'var(--bg-default)',
      border: '1px solid var(--border-default)',
      borderRadius: 8,
      padding: '16px 20px',
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <Statistic
        value={value}
        valueStyle={{ fontSize: 24, fontWeight: 700, color: valueColor || 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
      />
      {subtitle && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{subtitle}</div>}
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

// -- Breakdown row types --

interface BreakdownRow {
  name: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  share: number;
}

function buildBreakdownRows(data: Record<string, { spend: number; total_tokens?: number; prompt_tokens?: number; completion_tokens?: number; api_requests?: number }> | undefined): BreakdownRow[] {
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

// -- Main component --

export default function AnalyticsTab() {
  const [baseUrl, setBaseUrl] = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [summary, setSummary] = useState<SpendSummary | null>(null);
  const [report, setReport] = useState<SpendReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('All');

  const loadData = useCallback(async () => {
    if (!baseUrl || !masterKey) return;
    setLoading(true);
    try {
      const { start, end } = dateRangeForFilter(timeRange);
      const [summaryResult, reportResult] = await Promise.all([
        getSpendSummary(baseUrl, masterKey, start, end).catch(() => null),
        getSpendReport(baseUrl, masterKey, start, end).catch(() => []),
      ]);
      setSummary(summaryResult);
      setReport(reportResult);
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

  // Build breakdown rows from summary's per_model / per_provider / per_api_key
  const modelRows = useMemo(() => buildBreakdownRows(summary?.per_model), [summary]);
  const providerRows = useMemo(() => buildBreakdownRows(summary?.per_provider), [summary]);
  const keyRows = useMemo(() => buildBreakdownRows(summary?.per_api_key), [summary]);

  // Fallback: if summary doesn't have breakdowns, try from report entries
  const reportRows = useMemo<BreakdownRow[]>(() => {
    if (modelRows.length > 0 || report.length === 0) return [];
    const entries = report
      .filter((r) => r.model || r.provider)
      .map((r) => ({
        name: r.model || r.provider || 'unknown',
        requests: r.api_requests ?? 0,
        inputTokens: r.prompt_tokens ?? 0,
        outputTokens: r.completion_tokens ?? 0,
        totalTokens: r.total_tokens ?? 0,
        cost: r.spend ?? 0,
        share: 0,
      }));
    const grandTotal = entries.reduce((sum, e) => sum + e.totalTokens, 0);
    for (const e of entries) {
      e.share = grandTotal > 0 ? (e.totalTokens / grandTotal) * 100 : 0;
    }
    return entries.sort((a, b) => b.totalTokens - a.totalTokens);
  }, [modelRows, report]);

  const totalRequests = summary?.api_requests ?? 0;
  const totalTokens = summary?.total_tokens ?? 0;
  const inputTokens = summary?.prompt_tokens ?? 0;
  const outputTokens = summary?.completion_tokens ?? 0;
  const totalSpend = summary?.total_spend ?? 0;

  const breakdownColumns: TableColumnsType<BreakdownRow> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, _: BreakdownRow, index: number) => (
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
      render: (pct: number, _: BreakdownRow, index: number) => <ShareBar pct={pct} colorIndex={index} />,
    },
  ];

  if (loading) {
    return <Skeleton active paragraph={{ rows: 12 }} />;
  }

  if (!summary && report.length === 0) {
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

      {/* Overview cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="TOTAL TOKENS" value={formatTokens(totalTokens)} subtitle={`${totalRequests} requests`} />
        <StatCard label="INPUT TOKENS" value={formatTokens(inputTokens)} valueColor="var(--color-success)" />
        <StatCard label="OUTPUT TOKENS" value={formatTokens(outputTokens)} valueColor="var(--color-cyan)" />
        <StatCard label="EST. COST" value={formatCost(totalSpend)} valueColor="var(--color-gold)" />
      </div>

      {/* Model Breakdown */}
      {(modelRows.length > 0 || reportRows.length > 0) && (
        <div>
          <SectionHeader title="Model Breakdown" />
          <Table<BreakdownRow>
            rowKey="name"
            columns={breakdownColumns}
            dataSource={modelRows.length > 0 ? modelRows : reportRows}
            pagination={false}
            size="small"
          />
        </div>
      )}

      {/* Provider Breakdown */}
      {providerRows.length > 0 && (
        <div>
          <SectionHeader title="Provider Breakdown" />
          <Table<BreakdownRow>
            rowKey="name"
            columns={breakdownColumns}
            dataSource={providerRows}
            pagination={false}
            size="small"
          />
        </div>
      )}

      {/* API Key Breakdown */}
      {keyRows.length > 0 && (
        <div>
          <SectionHeader title="API Key Breakdown" />
          <Table<BreakdownRow>
            rowKey="name"
            columns={breakdownColumns}
            dataSource={keyRows}
            pagination={false}
            size="small"
          />
        </div>
      )}
    </div>
  );
}
