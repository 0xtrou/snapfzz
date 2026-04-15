import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, message, Popconfirm, Radio, Select, Skeleton, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { AppButton, fetchWithToast, PretextPaginatedList } from '@snapfzz/shared';
import { createTauriBridge } from '@snapfzz/shared';
import { getSpendLogs, getBaseUrl, getMasterKey, getModelInfo, loadCustomProviders, type SpendLog } from '../hooks/useLlmCommands';
import { buildProviderLookup, resolveProviderName, type ProviderLookup } from '../lib/modelNames';

const bridge = createTauriBridge();

const { Text } = Typography;

const ROW_HEIGHT = 40;
const EXPANDED_HEIGHT = 700;

function formatTokens(n?: number): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function statusTag(status?: string) {
  if (!status) return <Tag>Unknown</Tag>;
  const s = status.toLowerCase();
  if (s === 'success' || s === '200') return <Tag color="success">Success</Tag>;
  if (s.startsWith('4')) return <Tag color="warning">{status}</Tag>;
  if (s.startsWith('5')) return <Tag color="error">{status}</Tag>;
  return <Tag>{status}</Tag>;
}

function tryFormatJson(raw?: string): string {
  if (!raw) return '—';
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(raw);
  }
}

// A013/AuditLog: LiteLLM returns timestamps in varying formats —
// ISO string, Unix epoch (seconds), Unix epoch (ms), or startTime field.
function parseTimestamp(log: SpendLog): Date {
  // Try startTime first (often more reliable than timestamp)
  const raw = log.startTime || log.timestamp;
  if (!raw) return new Date(0);

  // If it's a number or numeric string, treat as epoch
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!isNaN(num) && num > 0) {
    // Epoch in seconds (< 1e12) vs milliseconds (>= 1e12)
    return new Date(num < 1e12 ? num * 1000 : num);
  }

  // Try as ISO/date string
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return parsed;

  return new Date(0);
}

function formatTimestamp(log: SpendLog): string {
  const date = parseTimestamp(log);
  if (date.getTime() === 0) return '—';
  return date.toLocaleString();
}

function maskKey(key?: string): string {
  if (!key) return '—';
  if (key.length > 12) return `${key.slice(0, 4)}...${key.slice(-4)}`;
  return key;
}

// A013/AuditLog: Expanded detail panel
const ExpandedDetail = React.memo(function ExpandedDetail({ record, providerLookup }: { record: SpendLog; providerLookup: ProviderLookup }) {
  const providerName = resolveProviderName(record, providerLookup);

  // Full-width rows for long values
  const fullWidthDetails = [
    { label: 'Request ID', value: record.request_id },
    { label: 'API Base', value: record.api_base ?? '—' },
  ];

  // Grid rows for short values
  const details = [
    { label: 'Status', value: record.status ?? '—' },
    { label: 'Call Type', value: record.call_type ?? '—' },
    { label: 'Model Group', value: record.model_group ?? '—' },
    { label: 'Combo', value: record.model_group && !record.model_group.includes('/') ? record.model_group : '—' },
    { label: 'Provider', value: providerName !== 'unknown' ? providerName : '—' },
    { label: 'API Type', value: record.custom_llm_provider ?? '—' },
    { label: 'Duration', value: record.request_duration_ms != null ? `${record.request_duration_ms}ms` : '—' },
    { label: 'Cache Hit', value: record.cache_hit ?? '—' },
    { label: 'Prompt Tokens', value: record.prompt_tokens != null ? String(record.prompt_tokens) : '—' },
    { label: 'Completion Tokens', value: record.completion_tokens != null ? String(record.completion_tokens) : '—' },
    { label: 'Total Tokens', value: record.total_tokens != null ? String(record.total_tokens) : '—' },
    { label: 'Start', value: record.startTime ?? '—' },
    { label: 'End', value: record.endTime ?? '—' },
  ];

  const preStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border-default)',
    borderRadius: 6,
    padding: '8px 12px',
    margin: 0,
    maxHeight: 200,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  };

  return (
    <div style={{ padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Full-width rows for long text (Request ID, API Base) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {fullWidthDetails.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', gap: 8 }}>
            <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>{label}:</Text>
            <Text style={{ fontSize: 12, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{value}</Text>
          </div>
        ))}
      </div>
      {/* Grid for short fields */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 24px' }}>
        {details.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', gap: 8 }}>
            <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>{label}:</Text>
            <Text style={{ fontSize: 12, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{value}</Text>
          </div>
        ))}
      </div>
      {(() => {
        // Raw request: from proxy_server_request, strip internal metadata
        const rawReq = record.proxy_server_request as Record<string, unknown> | undefined;
        const reqPayload = rawReq ? { model: rawReq.model, messages: rawReq.messages, max_tokens: rawReq.max_tokens, temperature: rawReq.temperature, stream: rawReq.stream } : null;
        // Remove undefined fields
        if (reqPayload) { for (const k of Object.keys(reqPayload)) { if ((reqPayload as Record<string, unknown>)[k] === undefined) delete (reqPayload as Record<string, unknown>)[k]; } }
        const hasReq = reqPayload && reqPayload.messages;

        // Raw response: full payload
        const rawResp = record.response as Record<string, unknown> | undefined;
        const hasResp = rawResp && Object.keys(rawResp).length > 0;

        // Error: extract just the message and code
        const meta = record.metadata as Record<string, unknown> | undefined;
        const errInfo = meta?.error_information as Record<string, unknown> | undefined;
        const errorPayload = errInfo ? { error_code: errInfo.error_code, error_message: errInfo.error_message, llm_provider: errInfo.llm_provider } : null;
        const hasError = errorPayload && errorPayload.error_message;

        return (
          <>
            {hasReq && (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Request Payload</Text>
                <pre style={preStyle}>{tryFormatJson(JSON.stringify(reqPayload))}</pre>
              </div>
            )}
            {hasResp && (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Response Payload</Text>
                <pre style={preStyle}>{tryFormatJson(JSON.stringify(rawResp))}</pre>
              </div>
            )}
            {hasError && !hasResp && (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Error</Text>
                <pre style={preStyle}>{tryFormatJson(JSON.stringify(errorPayload))}</pre>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
});

// A013/AuditLog: Single log row
const LogRow = React.memo(function LogRow({
  log,
  expanded,
  onToggle,
  providerLookup,
}: {
  log: SpendLog;
  expanded: boolean;
  onToggle: (id: string) => void;
  providerLookup: ProviderLookup;
}) {
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggle(log.request_id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(log.request_id); } }}
        style={{
          display: 'grid',
          gridTemplateColumns: '170px 80px 1fr 100px 55px 110px 80px 90px',
          gap: 8,
          alignItems: 'center',
          padding: '0 16px',
          height: ROW_HEIGHT,
          cursor: 'pointer',
          background: expanded ? 'var(--bg-subtle)' : 'transparent',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <Text style={{ fontSize: 12 }}>{formatTimestamp(log)}</Text>
        {statusTag(log.status)}
        <Text ellipsis style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{log.model_group || log.model || '—'}</Text>
        <Text ellipsis style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {log.model_group && !log.model_group.includes('/') ? log.model_group : '—'}
        </Text>
        <span style={{ fontSize: 14, textAlign: 'center' }}>
          {log.cache_hit === 'True'
            ? <CheckCircleOutlined style={{ color: 'var(--color-success)' }} />
            : <CloseCircleOutlined style={{ color: 'var(--text-muted)', opacity: 0.4 }} />}
        </span>
        <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{maskKey(log.api_key)}</Text>
        <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'right' }}>{formatTokens(log.total_tokens)}</Text>
        <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'right' }}>${(log.spend || 0).toFixed(6)}</Text>
      </div>
      {expanded && <ExpandedDetail record={log} providerLookup={providerLookup} />}
    </div>
  );
});

export default function AuditLogTab({ active }: { active?: boolean }) {
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [masterKey, setMasterKey] = useState<string>('');
  const [logs, setLogs] = useState<SpendLog[]>([]);
  const [providerLookup, setProviderLookup] = useState<ProviderLookup>({ byModelId: new Map(), byApiBase: new Map(), providerNames: new Set() });
  const [modelFilter, setModelFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failure'>('all');
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const loadLogs = useCallback(async () => {
    if (!baseUrl || !masterKey) return;
    setLoading(true);
    const [spendResult, providersResult, modelInfoResult] = await Promise.allSettled([
      getSpendLogs(baseUrl, masterKey, {}),
      loadCustomProviders(),
      getModelInfo(baseUrl, masterKey),
    ]);
    if (spendResult.status === 'fulfilled') setLogs(spendResult.value);
    else setLogs([]);
    if (providersResult.status === 'fulfilled' && modelInfoResult.status === 'fulfilled') {
      setProviderLookup(buildProviderLookup(providersResult.value, modelInfoResult.value.data ?? []));
    }
    setLoading(false);
  }, [baseUrl, masterKey]);

  useEffect(() => {
    Promise.all([getBaseUrl(), getMasterKey()])
      .then(([url, key]) => {
        setBaseUrl(url);
        setMasterKey(key);
      })
      .catch(() => message.error('Failed to get gateway URL'));
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  // Refresh data when tab becomes active (tab switch, not remount)
  useEffect(() => {
    if (active) void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleClearLogs = useCallback(async (keepDays: number) => {
    const { data: deleted } = await fetchWithToast(
      () => bridge.invoke<number>('llm_cleanup_spend_logs', { keepDays }),
      {
        successMessage: `Cleared logs older than ${keepDays} day${keepDays !== 1 ? 's' : ''}`,
        errorMessage: 'Failed to clear logs',
      },
    );
    if (deleted != null) await loadLogs();
  }, [loadLogs]);

  const uniqueModels = useMemo(
    () => [...new Set(logs.map((l) => l.model_group || l.model).filter((m): m is string => !!m && m.trim() !== ''))].sort(),
    [logs],
  );

  const filteredLogs = useMemo(() => {
    // Filter out empty-model entries (LiteLLM internal probes/health checks)
    let list = logs.filter((log) => log.model && log.model.trim() !== '');
    if (modelFilter) {
      list = list.filter((log) => (log.model_group || log.model) === modelFilter);
    }
    if (statusFilter === 'success') {
      list = list.filter((log) => log.status?.toLowerCase() === 'success' || log.status === '200');
    } else if (statusFilter === 'failure') {
      list = list.filter((log) => log.status?.toLowerCase() !== 'success' && log.status !== '200');
    }
    return list.sort((a, b) => parseTimestamp(b).getTime() - parseTimestamp(a).getTime());
  }, [logs, modelFilter, statusFilter]);

  const estimateHeight = useCallback(
    (log: SpendLog) => expandedIds.has(log.request_id) ? ROW_HEIGHT + EXPANDED_HEIGHT : ROW_HEIGHT,
    [expandedIds],
  );

  const renderItem = useCallback(
    (log: SpendLog) => (
      <LogRow log={log} expanded={expandedIds.has(log.request_id)} onToggle={handleToggle} providerLookup={providerLookup} />
    ),
    [expandedIds, handleToggle, providerLookup],
  );

  const keyExtractor = useCallback((log: SpendLog) => log.request_id, []);

  return (
    <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 20 }}>
      {/* Toolbar: filter + retention controls */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select
          allowClear
          placeholder="Filter by model"
          style={{ width: 240 }}
          value={modelFilter}
          onChange={setModelFilter}
          showSearch
          filterOption={(input, option) =>
            (option?.value as string).toLowerCase().includes(input.toLowerCase())
          }
        >
          {uniqueModels.map((m) => (
            <Select.Option key={m} value={m}>
              {m}
            </Select.Option>
          ))}
        </Select>

        <Radio.Group
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'success' | 'failure')}
          optionType="button"
          buttonStyle="solid"
          size="small"
        >
          <Radio.Button value="all">All</Radio.Button>
          <Radio.Button value="success">Success</Radio.Button>
          <Radio.Button value="failure">Failure</Radio.Button>
        </Radio.Group>

        <Text type="secondary" style={{ fontSize: 12 }}>
          {filteredLogs.length} request{filteredLogs.length !== 1 ? 's' : ''}
        </Text>

        <AppButton variant="text" icon={<ReloadOutlined />} loading={loading} onClick={() => void loadLogs()}>Refresh</AppButton>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Popconfirm
            title="Clear logs older than 1 day?"
            onConfirm={() => void handleClearLogs(1)}
            okText="Clear"
            placement="bottom"
          >
            <AppButton size="small" icon={<DeleteOutlined />} variant="danger">
              Keep 1 day
            </AppButton>
          </Popconfirm>
          <Popconfirm
            title="Clear logs older than 7 days?"
            onConfirm={() => void handleClearLogs(7)}
            okText="Clear"
            placement="bottom"
          >
            <AppButton size="small" icon={<DeleteOutlined />}>
              Keep 7 days
            </AppButton>
          </Popconfirm>
          <Popconfirm
            title="Clear logs older than 30 days?"
            onConfirm={() => void handleClearLogs(30)}
            okText="Clear"
            placement="bottom"
          >
            <AppButton size="small" icon={<DeleteOutlined />}>
              Keep 30 days
            </AppButton>
          </Popconfirm>
        </div>
      </div>

      {/* Column headers + log list card */}
      <div style={{ background: 'var(--bg-default)', border: '1px solid var(--border-default)', borderRadius: 8, overflow: 'hidden' }}>
        {/* Column headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '170px 80px 1fr 100px 55px 110px 80px 90px',
            gap: 8,
            padding: '0 16px',
            height: 32,
            alignItems: 'center',
            borderBottom: '2px solid var(--border-default)',
            background: 'var(--bg-subtle)',
          }}
        >
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Timestamp</Text>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Status</Text>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Model</Text>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Combo</Text>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Cached</Text>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>API Key</Text>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textAlign: 'right' }}>Tokens</Text>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textAlign: 'right' }}>Spend</Text>
        </div>

        {loading ? (
          <div style={{ padding: 16 }}><Skeleton active paragraph={{ rows: 6 }} /></div>
        ) : filteredLogs.length === 0 ? (
          <Empty description="No spend logs found" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '32px 0' }} />
        ) : (
          <PretextPaginatedList
            items={filteredLogs}
            estimateHeight={estimateHeight}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            pageSize={20}
            pageSizeOptions={[10, 20, 50, 100]}
            style={{ display: 'flex', flexDirection: 'column' }}
          />
        )}
      </div>
    </div>
  );
}
