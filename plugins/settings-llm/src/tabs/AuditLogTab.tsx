import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Empty, message, Popconfirm, Select, Skeleton, Tag, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { AppButton, PretextPaginatedList } from '@snapfzz/shared';
import { createTauriBridge } from '@snapfzz/shared';
import { getSpendLogs, getBaseUrl, getMasterKey, type SpendLog } from '../hooks/useLlmCommands';

const bridge = createTauriBridge();

const { Text } = Typography;

const ROW_HEIGHT = 40;
const EXPANDED_HEIGHT = 320;

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
const ExpandedDetail = React.memo(function ExpandedDetail({ record }: { record: SpendLog }) {
  const details = [
    { label: 'Request ID', value: record.request_id },
    { label: 'Status', value: record.status ?? '—' },
    { label: 'Call Type', value: record.call_type ?? '—' },
    { label: 'Model Group', value: record.model_group ?? '—' },
    { label: 'Provider', value: record.custom_llm_provider ?? '—' },
    { label: 'API Base', value: record.api_base ?? '—' },
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
    maxHeight: 160,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  };

  return (
    <div style={{ padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 24px' }}>
        {details.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', gap: 8 }}>
            <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>{label}:</Text>
            <Text style={{ fontSize: 12, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{value}</Text>
          </div>
        ))}
      </div>
      {record.messages && (
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Messages (Request)</Text>
          <pre style={preStyle}>{tryFormatJson(typeof record.messages === 'string' ? record.messages : JSON.stringify(record.messages))}</pre>
        </div>
      )}
      {record.response && (
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Response</Text>
          <pre style={preStyle}>{tryFormatJson(typeof record.response === 'string' ? record.response : JSON.stringify(record.response))}</pre>
        </div>
      )}
    </div>
  );
});

// A013/AuditLog: Single log row
const LogRow = React.memo(function LogRow({
  log,
  expanded,
  onToggle,
}: {
  log: SpendLog;
  expanded: boolean;
  onToggle: (id: string) => void;
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
          gridTemplateColumns: '170px 80px 1fr 110px 80px 90px',
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
        <Text ellipsis style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{log.model}</Text>
        <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{maskKey(log.api_key)}</Text>
        <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'right' }}>{formatTokens(log.total_tokens)}</Text>
        <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'right' }}>${(log.spend || 0).toFixed(6)}</Text>
      </div>
      {expanded && <ExpandedDetail record={log} />}
    </div>
  );
});

export default function AuditLogTab() {
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [masterKey, setMasterKey] = useState<string>('');
  const [logs, setLogs] = useState<SpendLog[]>([]);
  const [modelFilter, setModelFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const loadLogs = useCallback(async () => {
    if (!baseUrl || !masterKey) return;
    setLoading(true);
    try {
      const result = await getSpendLogs(baseUrl, masterKey, {});
      setLogs(result);
    } catch (err) {
      console.error('[AuditLogTab] Failed to load spend logs:', err);
      message.error('Failed to load spend logs');
      setLogs([]);
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
      .catch(() => message.error('Failed to get LiteLLM URL'));
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleClearLogs = useCallback(async (keepDays: number) => {
    try {
      const deleted = await bridge.invoke<number>('llm_cleanup_spend_logs', { keepDays });
      message.success(`Cleared ${deleted} log${deleted !== 1 ? 's' : ''} older than ${keepDays} day${keepDays !== 1 ? 's' : ''}`);
      await loadLogs();
    } catch (err) {
      message.error(`Failed to clear logs: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [loadLogs]);

  const uniqueModels = useMemo(
    () => [...new Set(logs.map((l) => l.model).filter((m) => m && m.trim() !== ''))].sort(),
    [logs],
  );

  const filteredLogs = useMemo(() => {
    // Filter out empty-model entries (LiteLLM internal probes/health checks)
    let list = logs.filter((log) => log.model && log.model.trim() !== '');
    if (modelFilter) {
      list = list.filter((log) => log.model === modelFilter);
    }
    return list.sort((a, b) => parseTimestamp(b).getTime() - parseTimestamp(a).getTime());
  }, [logs, modelFilter]);

  const estimateHeight = useCallback(
    (log: SpendLog) => expandedIds.has(log.request_id) ? ROW_HEIGHT + EXPANDED_HEIGHT : ROW_HEIGHT,
    [expandedIds],
  );

  const renderItem = useCallback(
    (log: SpendLog) => (
      <LogRow log={log} expanded={expandedIds.has(log.request_id)} onToggle={handleToggle} />
    ),
    [expandedIds, handleToggle],
  );

  const keyExtractor = useCallback((log: SpendLog) => log.request_id, []);

  return (
    <div>
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

        <Text type="secondary" style={{ fontSize: 12 }}>
          {filteredLogs.length} request{filteredLogs.length !== 1 ? 's' : ''}
        </Text>

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

      {/* Column headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '170px 80px 1fr 110px 80px 90px',
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
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>API Key</Text>
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textAlign: 'right' }}>Tokens</Text>
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textAlign: 'right' }}>Spend</Text>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : filteredLogs.length === 0 ? (
        <Empty description="No spend logs found" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 32 }} />
      ) : (
        <PretextPaginatedList
          items={filteredLogs}
          estimateHeight={estimateHeight}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          pageSize={20}
          pageSizeOptions={[10, 20, 50, 100]}
          style={{ height: 560, display: 'flex', flexDirection: 'column' }}
        />
      )}
    </div>
  );
}
