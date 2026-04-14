// A008/SupervisedDomain: Zone 3 render — reads live process snapshots from Rust via shared TauriBridge,
// refreshes every 2s, displays process table with detail panels, logs, and controls.
import { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Tag,
  Space,
  Typography,
  Tooltip,
} from 'antd';
import {
  ReloadOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  DeleteOutlined,
  CopyOutlined,
  LinkOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import { createTauriBridge, SettingsHeader, ConfirmAction, AppButton } from '@snapfzz/shared';
import AnsiLogViewer from './AnsiLogViewer';

const { Text } = Typography;

// A008/SupervisedDomain: mirrors serde camelCase output of ProcessSnapshot in metrics.rs
export interface ProcessSnapshot {
  name: string;
  pid: number | null;
  status: 'starting' | 'online' | 'unhealthy' | 'restarting' | 'stopped' | 'errored';
  rssMb: number | null;
  cpuPct: number | null;
  restartCount: number;
  consecutiveFailures: number;
  uptimeSecs: number;
  location: string;
  healthUrl: string;
  owner: string;
}

// A008/UnifiedBudget: Metrics returned from budget registry snapshot
export interface BudgetMetrics {
  presetName: string;
  appTotalMb: number;
  totalRssMb: number;
  processes: ProcessSnapshot[];
}

const REFRESH_INTERVAL_MS = 2000;
const LOG_REFRESH_INTERVAL_MS = 3000;

const bridge = createTauriBridge();

// A001/GPUOnlyAnimations: all color decisions via CSS variables — no hardcoded hex.
function statusColor(status: ProcessSnapshot['status']): string {
  switch (status) {
    case 'online':
      return 'var(--color-success)';
    case 'unhealthy':
      return 'var(--color-warning)';
    case 'stopped':
    case 'errored':
      return 'var(--color-error)';
    default:
      return 'var(--text-muted)';
  }
}

function statusTagColor(status: ProcessSnapshot['status']): string {
  switch (status) {
    case 'online':
      return 'success';
    case 'unhealthy':
      return 'warning';
    case 'stopped':
    case 'errored':
      return 'error';
    default:
      return 'default';
  }
}

function formatUptime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface DetailPanelProps {
  process: ProcessSnapshot;
  appTotalMb: number;
  totalRssMb: number;
  onAction: () => void;
}

function DetailPanel({ process, appTotalMb, totalRssMb, onAction }: DetailPanelProps) {
  const [showLogs, setShowLogs] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);

  const fetchLogs = useCallback(async () => {
    try {
      const result = await bridge.invoke<string[]>('get_process_logs', { name: process.name, tailN: 100 });
      setLogs(result);
    } catch {
      void 0;
    }
  }, [process.name]);

  useEffect(() => {
    if (!showLogs) return;
    void fetchLogs();
    const id = setInterval(() => { void fetchLogs(); }, LOG_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [showLogs, fetchLogs]);



  const handleRestart = async () => {
    try {
      await bridge.invoke<void>('restart_process', { name: process.name });
      onAction();
    } catch {
      void 0;
    }
  };

  const handleKill = async () => {
    try {
      await bridge.invoke<void>('kill_process', { name: process.name });
      onAction();
    } catch {
      void 0;
    }
  };

  const handleClearLogs = async () => {
    try {
      await bridge.invoke<void>('clear_process_logs', { name: process.name });
      setLogs([]);
    } catch {
      void 0;
    }
  };

  return (
    <div
      data-testid={`detail-panel-${process.name}`}
      style={{
        padding: '16px 24px',
        background: 'var(--bg-subtle)',
        borderTop: '1px solid var(--border-default)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div>
          <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>PID</Text>
          <div>
            <Text style={{ color: 'var(--text-primary)', fontSize: 13 }} data-testid="detail-pid">
              {process.pid}
            </Text>
          </div>
        </div>
        <div>
          <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>Owner</Text>
          <div>
            <Text style={{ color: 'var(--text-primary)', fontSize: 13 }} data-testid="detail-owner">
              {process.owner}
            </Text>
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>Health URL</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text
              style={{ color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)' }}
              data-testid="detail-health-url"
            >
              {process.healthUrl || '—'}
            </Text>
            {process.healthUrl && (
              <>
                <Tooltip title="Copy URL">
                  <AppButton
                    variant="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => navigator.clipboard.writeText(process.healthUrl)}
                  />
                </Tooltip>
                <Tooltip title="Open in browser">
                  <AppButton
                    variant="text"
                    size="small"
                    icon={<LinkOutlined />}
                    onClick={() => void bridge.invoke<void>('open_path', { path: process.healthUrl })}
                  />
                </Tooltip>
              </>
            )}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>Location</Text>
          <div>
            <Text style={{ color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
              {process.location}
            </Text>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>Memory</Text>
          <div style={{ marginTop: 4 }}>
            <Text style={{ color: 'var(--text-primary)', fontSize: 13 }}>
              {process.rssMb != null ? Math.round(process.rssMb) : '—'} MB
            </Text>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>App Memory Budget</Text>
          <div style={{ marginTop: 4 }}>
            <Text style={{ color: 'var(--text-primary)', fontSize: 13 }}>{Math.round(totalRssMb)} / {appTotalMb} MB</Text>
            <Text style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block' }}>Unified across all processes</Text>
          </div>
        </div>
      </div>

      <Space size={8} style={{ marginBottom: 16 }}>
        <ConfirmAction
          title="Restart process?"
          description={`This will restart ${process.name}.`}
          onConfirm={handleRestart}
          okText="Restart"
        >
          <AppButton
            size="small"
            icon={<ReloadOutlined />}
            data-testid={`btn-restart-${process.name}`}
          >
            Restart
          </AppButton>
        </ConfirmAction>

        <ConfirmAction
          title="Kill process?"
          description={`This will forcibly terminate ${process.name}.`}
          onConfirm={handleKill}
          okText="Kill"
          danger
        >
          <AppButton
            size="small"
            variant="danger"
            icon={<CloseCircleOutlined />}
            data-testid={`btn-kill-${process.name}`}
          >
            Kill
          </AppButton>
        </ConfirmAction>

        <AppButton
          size="small"
          icon={<FileTextOutlined />}
          onClick={() => setShowLogs((v) => !v)}
          data-testid={`btn-view-logs-${process.name}`}
        >
          {showLogs ? 'Hide Logs' : 'View Latest 100 Logs'}
        </AppButton>

        <AppButton
          size="small"
          icon={<DeleteOutlined />}
          onClick={handleClearLogs}
          data-testid={`btn-clear-logs-${process.name}`}
        >
          Clear Logs
        </AppButton>

        <AppButton
          size="small"
          icon={<FolderOpenOutlined />}
          onClick={async () => {
            try {
              const dataDir = await bridge.invoke<string>('get_data_dir');
              void bridge.invoke<void>('open_path', { path: `${dataDir}/runtime/${process.name}` });
            } catch { void 0; }
          }}
          data-testid={`btn-open-log-file-${process.name}`}
        >
          Open Log Folder
        </AppButton>
      </Space>

      {showLogs && (
        <AnsiLogViewer
          logs={logs}
          data-testid={`log-panel-${process.name}`}
        />
      )}
    </div>
  );
}

export default function ProcessesSettings() {
  const [metrics, setMetrics] = useState<BudgetMetrics | null>(null);
  const [hasData, setHasData] = useState(false);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);

  const fetchMetrics = useCallback(async () => {
    try {
      const result = await bridge.invoke<BudgetMetrics>('budget_snapshot');
      setMetrics(result);
      setHasData(true);
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    void fetchMetrics();
    const id = setInterval(() => { void fetchMetrics(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchMetrics]);

  const processes = metrics?.processes ?? [];
  const appTotalMb = metrics?.appTotalMb ?? 0;
  const totalRssMb = metrics?.totalRssMb ?? 0;

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Text style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{name}</Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: ProcessSnapshot['status']) => (
        <Tag
          color={statusTagColor(status)}
          style={{ textTransform: 'capitalize' }}
          data-testid={`status-tag-${status}`}
        >
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: statusColor(status),
              marginRight: 5,
              verticalAlign: 'middle',
            }}
          />
          {status}
        </Tag>
      ),
    },
    {
      title: 'Memory',
      key: 'memory',
      render: (_: unknown, record: ProcessSnapshot) => {
        return (
          <Text style={{ color: 'var(--text-primary)', fontSize: 13 }}>
            {record.rssMb != null ? Math.round(record.rssMb) : '—'} / {appTotalMb} MB
          </Text>
        );
      },
    },
    {
      title: 'Uptime',
      dataIndex: 'uptimeSecs',
      key: 'uptime',
      render: (secs: number) => (
        <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {formatUptime(secs)}
        </Text>
      ),
    },
  ];

  const tableData: (ProcessSnapshot & { key: string })[] = [
    ...processes.map((p) => ({ ...p, key: p.name })),
  ];

  return (
    <div style={{ contain: 'layout paint' }}>
      <SettingsHeader
        title="Processes"
        subtitle="Monitor and control supervised processes. View logs, manage runtime configuration, and restart or terminate services."
      >
        <span
          data-testid="live-indicator"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 8px',
            borderRadius: 10,
            background: hasData ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            fontSize: 11,
            fontWeight: 500,
            color: hasData ? 'var(--color-success)' : 'var(--color-error)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: hasData ? 'var(--color-success)' : 'var(--color-error)',
              animation: hasData ? 'pulse 2s ease-in-out infinite' : 'none',
            }}
          />
          {hasData ? 'Live' : 'Offline'}
        </span>
      </SettingsHeader>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

      <div style={{ padding: '16px 32px' }}>
        <div style={{ marginBottom: 12 }}>
          <Text style={{ color: 'var(--text-muted)', fontSize: 13 }} data-testid="aggregate-stats">
            System &nbsp;
            <Text style={{ color: 'var(--text-primary)', fontSize: 13 }}>
              {processes.length} {processes.length === 1 ? 'process' : 'processes'}
            </Text>
            {' · '}
            <Text style={{ color: 'var(--text-primary)', fontSize: 13 }}>
              {Math.round(totalRssMb)} / {appTotalMb} MB unified
            </Text>
          </Text>
        </div>

        <Table
          dataSource={tableData}
          columns={columns}
          pagination={false}
          size="small"
          rowKey="key"
          style={{
            background: 'var(--bg-default)',
            borderRadius: 8,
            border: '1px solid var(--border-default)',
            overflow: 'hidden',
          }}
          expandable={{
            expandedRowKeys: expandedRows,
            onExpandedRowsChange: (keys) => setExpandedRows(keys as string[]),
            expandedRowRender: (record) => (
              <DetailPanel
                process={record}
                appTotalMb={appTotalMb}
                totalRssMb={totalRssMb}
                onAction={fetchMetrics}
              />
            ),
            rowExpandable: (record) => record.key !== '__cloud_sandbox__',
          }}
          footer={() => (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 16px',
                opacity: 0.5,
              }}
              data-testid="cloud-sandbox-row"
            >
              <Text style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cloud Sandbox</Text>
              <Tooltip title="Cloud sandbox will be available in a future release">
                <Tag color="default" data-testid="coming-soon-tag">Coming soon</Tag>
              </Tooltip>
            </div>
          )}
          locale={{
            emptyText: (
              <div
                style={{ padding: '32px 0', color: 'var(--text-muted)', textAlign: 'center' }}
                data-testid="empty-state"
              >
                No supervised processes
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
}
