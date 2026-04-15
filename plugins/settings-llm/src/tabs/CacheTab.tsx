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
  return 0;
}

function getCacheCreationTokens(log: SpendLog): number {
  // Anthropic returns cache_creation_input_tokens in usage
  const resp = log.response as Record<string, unknown> | undefined;
  if (resp) {
    const usage = resp['usage'] as Record<string, unknown> | undefined;
    if (usage) {
      const ct = usage['cache_creation_input_tokens'];
      if (typeof ct === 'number') return ct;
    }
  }
  return 0;
}

function providerOf(log: SpendLog): string {
  const mg = log.model_group || log.model || '';
  if (mg.includes('/')) return mg.split('/')[0];
  return 'unknown';
}

// --- cache status ---

interface CacheStatus {
  enabled: boolean;
  type: string;
  status?: string;
}

async function getCacheStatus(baseUrl: string, masterKey: string): Promise<CacheStatus> {
  try {
    const res = await fetch(`${baseUrl}/cache/ping`, {
      headers: { 'Authorization': `Bearer ${masterKey}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return { enabled: false, type: 'none' };
    const data = await res.json() as Record<string, unknown>;
    return {
      enabled: true,
      type: typeof data['cache_type'] === 'string' ? data['cache_type'] : 'unknown',
      status: typeof data['status'] === 'string' ? data['status'] : undefined,
    };
  } catch {
    return { enabled: false, type: 'none' };
  }
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
        background: 'var(--bg-default)',
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
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);

  const loadData = useCallback(async () => {
    if (!baseUrl || !masterKey) return;
    setLoading(true);
    try {
      const [raw, status] = await Promise.all([
        getSpendLogs(baseUrl, masterKey, {}),
        getCacheStatus(baseUrl, masterKey),
      ]);
      setLogs(raw.filter((l) => l.model && l.model.trim() !== ''));
      setCacheStatus(status);
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
  const { providerCache, responseCache, providerRows, hourRows, hasCacheData } = useMemo(() => {
    let totalRequests = 0;
    let cachedRequests = 0;
    let totalInputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;
    let cacheWriteTokens = 0;

    const providerMap = new Map<string, ProviderRow>();
    const hourMap = new Map<string, HourRow>();

    // 24h window
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;

    for (const log of logs) {
      const isCached = log.cache_hit === 'True';
      const pt = log.prompt_tokens ?? 0;
      const ct = getCachedTokens(log);
      const cct = getCacheCreationTokens(log);

      totalRequests++;
      if (isCached) cachedRequests++;
      totalInputTokens += pt;
      cacheReadTokens += ct;
      cacheCreationTokens += cct;
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

    // Provider cache savings: cached tokens cost ~10% of normal input price.
    // Estimate $1.50/1M input tokens average.
    const avgInputPricePer1M = 1.5;
    const savingsEstimate = (cacheReadTokens / 1_000_000) * avgInputPricePer1M * 0.9;

    const cacheReuseRatio = totalInputTokens > 0 ? (cacheReadTokens / totalInputTokens) * 100 : 0;

    // Response cache stats
    const cacheHitRate = totalRequests > 0 ? (cachedRequests / totalRequests) * 100 : 0;
    const cacheMisses = totalRequests - cachedRequests;

    const sortedHours = [...hourMap.values()].sort((a, b) => a.hour.localeCompare(b.hour));
    const sortedProviders = [...providerMap.values()].sort((a, b) => b.totalRequests - a.totalRequests);

    const hasCacheData = cachedRequests > 0;

    return {
      providerCache: {
        cacheReadTokens,
        cacheCreationTokens,
        cacheReuseRatio,
        savingsEstimate,
        totalInputTokens,
      },
      responseCache: {
        cacheHitRate,
        cachedRequests,
        cacheMisses,
        totalRequests,
        cacheWriteTokens,
      },
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, background: 'var(--bg-subtle)', borderRadius: 8, padding: 20 }}>

      {/* Section 0: Cache Status */}
      <Section title="Cache Status">
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
          Response cache stores complete API responses for identical requests. Provider cache optimizes token usage by caching prompt prefixes.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: cacheStatus?.enabled ? 'var(--color-success)' : 'var(--color-warning)',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-primary)', minWidth: 160 }}>
              Response Cache
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: cacheStatus?.enabled ? 'var(--color-success)' : 'var(--text-muted)',
              }}
            >
              {cacheStatus?.enabled ? 'Enabled' : 'Disabled'}
            </span>
            {cacheStatus?.enabled && cacheStatus.type && cacheStatus.type !== 'none' && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                — {cacheStatus.type}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--color-info)',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-primary)', minWidth: 160 }}>
              Provider Prompt Cache
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-info)' }}>
              Always available
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              — depends on provider support
            </span>
          </div>
        </div>
      </Section>

      {/* Section 1: Provider Prompt Cache */}
      <Section title="Provider Prompt Cache">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard
            label="Cache Read Tokens"
            value={fmt(providerCache.cacheReadTokens)}
            valueColor="var(--color-cyan)"
            subtitle="tokens served from provider cache"
          />
          <StatCard
            label="Cache Creation Tokens"
            value={fmt(providerCache.cacheCreationTokens)}
            valueColor="var(--color-warning)"
            subtitle="tokens written to provider cache"
          />
          <StatCard
            label="Reuse Ratio"
            value={fmtPct(providerCache.cacheReuseRatio)}
            valueColor="var(--color-info)"
            subtitle="cached / total input tokens"
          />
          <StatCard
            label="Est. Cost Saved"
            value={fmtCost(providerCache.savingsEstimate)}
            valueColor="var(--color-gold)"
            subtitle="at avg $1.50/1M tokens"
          />
        </div>
      </Section>

      {/* Section 2: Response Cache */}
      <Section title="Response Cache">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard
            label="Cache Hit Rate"
            value={fmtPct(responseCache.cacheHitRate)}
            valueColor="var(--color-success)"
            subtitle={`${responseCache.cachedRequests} / ${responseCache.totalRequests} requests`}
          />
          <StatCard
            label="Cached Responses"
            value={fmt(responseCache.cachedRequests)}
            valueColor="var(--color-success)"
            subtitle="complete responses served from cache"
          />
          <StatCard
            label="Cache Misses"
            value={fmt(responseCache.cacheMisses)}
            valueColor="var(--text-muted)"
            subtitle="requests forwarded to provider"
          />
        </div>
      </Section>

      {/* Section 3: Provider Breakdown */}
      <Section title="Breakdown by Provider">
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

      {/* Section 4: Cache Trend (24h) */}
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
            <div style={{ fontSize: 15, marginBottom: 8 }}>No cache activity detected</div>
            <div style={{ fontSize: 13 }}>Enable response caching in your gateway config or use providers that support native prompt caching.</div>
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
