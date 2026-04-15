// Cache tab: prompt cache statistics computed from spend logs.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Skeleton, Statistic, message } from 'antd';
import { getBaseUrl, getMasterKey, getSpendLogs, type SpendLog } from '../hooks/useLlmCommands';

// --- helpers ---

function fmt(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtCost(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function getCachedTokens(log: SpendLog): number {
  // Try response.usage.prompt_tokens_details.cached_tokens
  const resp = log.response as Record<string, unknown> | undefined;
  if (resp) {
    const usage = resp['usage'] as Record<string, unknown> | undefined;
    if (usage) {
      const details = usage['prompt_tokens_details'] as Record<string, unknown> | undefined;
      if (details) {
        const ct = details['cached_tokens'];
        if (typeof ct === 'number') return ct;
      }
    }
  }
  // Fallback: if cache_hit === "True", use all prompt_tokens as cached
  if (log.cache_hit === 'True') return log.prompt_tokens ?? 0;
  return 0;
}

function providerOf(log: SpendLog): string {
  const mg = log.model_group || log.model || '';
  if (mg.includes('/')) return mg.split('/')[0];
  return 'unknown';
}

// --- stat card ---

interface StatCardProps {
  label: string;
  value: string;
  valueColor?: string;
  subtitle?: string;
}

function StatCard({ label, value, valueColor, subtitle }: StatCardProps) {
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
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <Statistic
        value={value}
        valueStyle={{
          fontSize: 22,
          fontWeight: 700,
          color: valueColor ?? 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
        }}
      />
      {subtitle && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{subtitle}</div>
      )}
    </div>
  );
}

// --- section wrapper ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '20px 24px',
      }}
    >
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 16,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

// --- table helpers ---

const TH_STYLE: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  padding: '6px 12px',
  textAlign: 'left',
  borderBottom: '1px solid var(--border-default)',
};

const TD_STYLE: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border-subtle)',
};

// --- main component ---

interface ProviderRow {
  provider: string;
  totalRequests: number;
  cachedRequests: number;
  totalInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

interface HourRow {
  hour: string; // "YYYY-MM-DDTHH"
  requests: number;
  cachedRequests: number;
  cacheReadTokens: number;
}

export default function CacheTab() {
  const [baseUrl, setBaseUrl] = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [logs, setLogs] = useState<SpendLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!baseUrl || !masterKey) return;
    setLoading(true);
    try {
      const raw = await getSpendLogs(baseUrl, masterKey, {});
      setLogs(raw.filter((l) => l.model && l.model.trim() !== ''));
    } catch {
      message.error('Failed to load spend logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, masterKey]);

  useEffect(() => {
    Promise.all([getBaseUrl(), getMasterKey()])
      .then(([url, key]) => { setBaseUrl(url); setMasterKey(key); })
      .catch(() => message.error('Failed to connect to LLM gateway'));
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // --- aggregation ---
  const { overview, providerRows, hourRows, hasCacheData } = useMemo(() => {
    let totalRequests = 0;
    let cachedRequests = 0;
    let totalInputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;

    const providerMap = new Map<string, ProviderRow>();
    const hourMap = new Map<string, HourRow>();

    // 24h window
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;

    for (const log of logs) {
      const isCached = log.cache_hit === 'True';
      const pt = log.prompt_tokens ?? 0;
      const ct = getCachedTokens(log);

      totalRequests++;
      if (isCached) cachedRequests++;
      totalInputTokens += pt;
      cacheReadTokens += ct;
      if (!isCached) cacheWriteTokens += pt;

      // provider
      const provider = providerOf(log);
      const pr = providerMap.get(provider) ?? {
        provider,
        totalRequests: 0,
        cachedRequests: 0,
        totalInputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };
      pr.totalRequests++;
      if (isCached) pr.cachedRequests++;
      pr.totalInputTokens += pt;
      pr.cacheReadTokens += ct;
      if (!isCached) pr.cacheWriteTokens += pt;
      providerMap.set(provider, pr);

      // hourly (24h)
      const ts = log.startTime || log.timestamp;
      if (ts) {
        const t = new Date(ts).getTime();
        if (t >= cutoff24h) {
          const d = new Date(ts);
          const hour = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}`;
          const hr = hourMap.get(hour) ?? { hour, requests: 0, cachedRequests: 0, cacheReadTokens: 0 };
          hr.requests++;
          if (isCached) hr.cachedRequests++;
          hr.cacheReadTokens += ct;
          hourMap.set(hour, hr);
        }
      }
    }

    // Cache savings estimate: cached tokens cost ~10% of normal input price.
    // We don't have per-model pricing, so estimate $1.50/1M input tokens average.
    const avgInputPricePer1M = 1.5;
    const savingsEstimate = (cacheReadTokens / 1_000_000) * avgInputPricePer1M * 0.9;

    const cacheRate = totalRequests > 0 ? (cachedRequests / totalRequests) * 100 : 0;
    const cacheReuseRatio = totalInputTokens > 0 ? (cacheReadTokens / totalInputTokens) * 100 : 0;

    const sortedHours = [...hourMap.values()].sort((a, b) => a.hour.localeCompare(b.hour));
    const sortedProviders = [...providerMap.values()].sort((a, b) => b.totalRequests - a.totalRequests);

    const hasCacheData = cachedRequests > 0;

    return {
      overview: { totalRequests, cachedRequests, totalInputTokens, cacheReadTokens, cacheWriteTokens, cacheRate, cacheReuseRatio, savingsEstimate },
      providerRows: sortedProviders,
      hourRows: sortedHours,
      hasCacheData,
    };
  }, [logs]);

  if (loading) return <Skeleton active paragraph={{ rows: 10 }} />;

  // 24h summary stats
  const total24h = hourRows.reduce((s, h) => s + h.requests, 0);
  const cached24h = hourRows.reduce((s, h) => s + h.cachedRequests, 0);
  const maxHourRequests = Math.max(...hourRows.map((h) => h.requests), 1);
  const busiestHour = hourRows.reduce<HourRow | null>((best, h) => (!best || h.requests > best.requests ? h : best), null);
  const peakCacheRate = hourRows.reduce((best, h) => {
    const r = h.requests > 0 ? (h.cachedRequests / h.requests) * 100 : 0;
    return r > best ? r : best;
  }, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Section 1: Overview */}
      <Section title="Prompt Cache Overview">
        {/* Stat cards */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard
            label="Cache Rate"
            value={fmtPct(overview.cacheRate)}
            valueColor="var(--color-success)"
            subtitle={`${overview.cachedRequests} / ${overview.totalRequests} requests`}
          />
          <StatCard
            label="Cache Reuse Ratio"
            value={fmtPct(overview.cacheReuseRatio)}
            valueColor="var(--color-info)"
            subtitle="cached / total input tokens"
          />
          <StatCard
            label="Cache Read Tokens"
            value={fmt(overview.cacheReadTokens)}
            valueColor="var(--color-cyan)"
          />
          <StatCard
            label="Cache Write Tokens"
            value={fmt(overview.cacheWriteTokens)}
            valueColor="var(--color-warning)"
          />
          <StatCard
            label="Est. Cost Saved"
            value={fmtCost(overview.savingsEstimate)}
            valueColor="var(--color-gold)"
            subtitle="at avg $1.50/1M tokens"
          />
        </div>

        {/* Provider breakdown table */}
        <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Breakdown by Provider
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(6, auto)', minWidth: 600 }}>
            {['Provider', 'Total Input', 'Cache Read', 'Cache Write', 'Cache Ratio', 'Cache Rate', 'Cached Reqs'].map((h) => (
              <div key={h} style={TH_STYLE}>{h}</div>
            ))}
            {providerRows.length === 0 ? (
              <div style={{ ...TD_STYLE, gridColumn: '1 / -1', color: 'var(--text-muted)' }}>No data</div>
            ) : (
              providerRows.map((r) => {
                const rate = r.totalRequests > 0 ? (r.cachedRequests / r.totalRequests) * 100 : 0;
                const ratio = r.totalInputTokens > 0 ? (r.cacheReadTokens / r.totalInputTokens) * 100 : 0;
                return (
                  <>
                    <div key={`${r.provider}-name`} style={TD_STYLE}>{r.provider}</div>
                    <div key={`${r.provider}-input`} style={{ ...TD_STYLE, textAlign: 'right' }}>{fmt(r.totalInputTokens)}</div>
                    <div key={`${r.provider}-read`} style={{ ...TD_STYLE, textAlign: 'right', color: 'var(--color-cyan)' }}>{fmt(r.cacheReadTokens)}</div>
                    <div key={`${r.provider}-write`} style={{ ...TD_STYLE, textAlign: 'right', color: 'var(--color-warning)' }}>{fmt(r.cacheWriteTokens)}</div>
                    <div key={`${r.provider}-ratio`} style={{ ...TD_STYLE, textAlign: 'right', color: 'var(--color-info)' }}>{fmtPct(ratio)}</div>
                    <div key={`${r.provider}-rate`} style={{ ...TD_STYLE, textAlign: 'right', color: 'var(--color-success)' }}>{fmtPct(rate)}</div>
                    <div key={`${r.provider}-reqs`} style={{ ...TD_STYLE, textAlign: 'right' }}>{r.cachedRequests}</div>
                  </>
                );
              })
            )}
          </div>
        </div>
      </Section>

      {/* Section 2: Cache Trend (24h) */}
      <Section title="Cache Trend (24h)">
        {/* Summary stats row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <StatCard
            label="Cached Requests (24h)"
            value={`${cached24h} / ${total24h}`}
            valueColor="var(--color-success)"
          />
          <StatCard
            label="Busiest Hour"
            value={busiestHour ? `${busiestHour.hour.slice(11)}:00 UTC` : '—'}
            subtitle={busiestHour ? `${busiestHour.requests} requests` : undefined}
          />
          <StatCard
            label="Peak Cache Rate"
            value={fmtPct(peakCacheRate)}
            valueColor="var(--color-info)"
          />
        </div>

        {!hasCacheData ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 15, marginBottom: 8 }}>Cache is not enabled</div>
            <div style={{ fontSize: 13 }}>Enable caching in LiteLLM config to see cache statistics</div>
          </div>
        ) : hourRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
            No activity in the last 24 hours
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', minWidth: 480 }}>
              {['Hour (UTC)', 'Activity', 'Cache Rate', 'Cache Read'].map((h) => (
                <div key={h} style={TH_STYLE}>{h}</div>
              ))}
              {hourRows.map((h) => {
                const rate = h.requests > 0 ? (h.cachedRequests / h.requests) * 100 : 0;
                const barWidth = Math.round((h.requests / maxHourRequests) * 100);
                return (
                  <>
                    <div key={`${h.hour}-h`} style={{ ...TD_STYLE, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {h.hour.slice(11)}:00
                    </div>
                    <div key={`${h.hour}-bar`} style={{ ...TD_STYLE, paddingRight: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            height: 12,
                            width: `${barWidth}%`,
                            minWidth: 2,
                            background: 'var(--color-info)',
                            borderRadius: 2,
                            opacity: 0.7,
                          }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{h.requests}</span>
                      </div>
                    </div>
                    <div key={`${h.hour}-rate`} style={{ ...TD_STYLE, textAlign: 'right', color: 'var(--color-success)' }}>{fmtPct(rate)}</div>
                    <div key={`${h.hour}-read`} style={{ ...TD_STYLE, textAlign: 'right', color: 'var(--color-cyan)' }}>{fmt(h.cacheReadTokens)}</div>
                  </>
                );
              })}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
