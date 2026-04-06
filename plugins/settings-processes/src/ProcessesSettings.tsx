// A008/SupervisedDomain: Zone 3 render — reads live process snapshots from Rust via tauriInvoke,
// refreshes every 2s, displays process table with detail panels, logs, and controls.
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Table,
  Tag,
  Progress,
  Button,
  Popconfirm,
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
import { SettingsHeader } from '@snapfzz/shared';

const { Text } = Typography;

// A008/SupervisedDomain: mirrors serde camelCase output of ProcessSnapshot in metrics.rs
export interface ProcessSnapshot {
  name: string;
  pid: number | null;
  status: 'starting' | 'online' | 'unhealthy' | 'restarting' | 'stopped' | 'errored';
  rssMb: number | null;
  cpuPct: number | null;
  maxMemoryMb: number;
  restartCount: number;
  consecutiveFailures: number;
  uptimeSecs: number;
  location: string;
  healthUrl: string;
  owner: string;
}

const REFRESH_INTERVAL_MS = 2000;
const LOG_REFRESH_INTERVAL_MS = 3000;

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

function memoryPct(rss: number | null, max: number): number {
  if (rss == null) return 0;
  if (max === 0) return 0;
  return Math.min(100, Math.round((rss / max) * 100));
}

// A008/BudgetRegistry: tauriInvoke bridges Zone 3 rendering to Zone 1 Rust commands.
function tauriInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const w = window as unknown as Record<string, unknown>;
  const tauri = w.__TAURI_INTERNALS__ as
    | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
    | undefined;
  if (!tauri) return Promise.reject(new Error('Tauri not available'));
  return tauri.invoke(cmd, args);
}

interface DetailPanelProps {
  process: ProcessSnapshot;
  onAction: () => void;
}

function DetailPanel({ process, onAction }: DetailPanelProps) {
  const [showLogs, setShowLogs] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);

  const logContainerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const result = await tauriInvoke('get_process_logs', { name: process.name, tailN: 100 });
      setLogs(result as string[]);
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

  useEffect(() => {
    if (logContainerRef.current && logs.length > 0) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const memPct = memoryPct(process.rssMb, process.maxMemoryMb);

  const handleRestart = async () => {
    try {
      await tauriInvoke('restart_process', { name: process.name });
      onAction();
    } catch {
      void 0;
    }
  };

  const handleKill = async () => {
    try {
      await tauriInvoke('kill_process', { name: process.name });
      onAction();
    } catch {
      void 0;
    }
  };

  const handleClearLogs = async () => {
    try {
      await tauriInvoke('clear_process_logs', { name: process.name });
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
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => navigator.clipboard.writeText(process.healthUrl)}
                  />
                </Tooltip>
                <Tooltip title="Open in browser">
                  <Button
                    type="text"
                    size="small"
                    icon={<LinkOutlined />}
                    onClick={() => window.open(process.healthUrl, '_blank')}
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

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Memory</Text>
          <Text style={{ color: 'var(--text-primary)', fontSize: 13 }}>
            {process.rssMb != null ? Math.round(process.rssMb) : '—'}/{process.maxMemoryMb} MB ({memPct}%)
          </Text>
        </div>
        <Progress
          percent={memPct}
          strokeColor={memPct >= 90 ? 'var(--color-error)' : memPct >= 70 ? 'var(--color-warning)' : 'var(--color-success)'}
          trailColor="var(--bg-subtle)"
          size="small"
          showInfo={false}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>Max Memory</Text>
          <div style={{ marginTop: 4 }}>
            <Text style={{ color: 'var(--text-primary)', fontSize: 13 }}>{process.maxMemoryMb} MB</Text>
            <Text style={{ color: 'var(--text-muted)', fontSize: 11, display: 'block' }}>Set via Performance preset</Text>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>Restart Count</Text>
          <div style={{ marginTop: 4 }}>
            <Text style={{ color: 'var(--text-primary)', fontSize: 13 }}>
              {process.restartCount}
            </Text>
          </div>
        </div>
      </div>

      <Space size={8} style={{ marginBottom: 16 }}>
        <Popconfirm
          title="Restart process?"
          description={`This will restart ${process.name}.`}
          onConfirm={handleRestart}
          okText="Restart"
          cancelText="Cancel"
        >
          <Button
            size="small"
            icon={<ReloadOutlined />}
            data-testid={`btn-restart-${process.name}`}
          >
            Restart
          </Button>
        </Popconfirm>

        <Popconfirm
          title="Kill process?"
          description={`This will forcibly terminate ${process.name}.`}
          onConfirm={handleKill}
          okText="Kill"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <Button
            size="small"
            danger
            icon={<CloseCircleOutlined />}
            data-testid={`btn-kill-${process.name}`}
          >
            Kill
          </Button>
        </Popconfirm>

        <Button
          size="small"
          icon={<FileTextOutlined />}
          onClick={() => setShowLogs((v) => !v)}
          data-testid={`btn-view-logs-${process.name}`}
        >
          {showLogs ? 'Hide Logs' : 'View Latest 100 Logs'}
        </Button>

        <Button
          size="small"
          icon={<DeleteOutlined />}
          onClick={handleClearLogs}
          data-testid={`btn-clear-logs-${process.name}`}
        >
          Clear Logs
        </Button>

        <Button
          size="small"
          icon={<FolderOpenOutlined />}
          onClick={async () => {
            try {
              const dataDir = await tauriInvoke('get_data_dir') as string;
              tauriInvoke('open_path', { path: `${dataDir}/runtime/${process.name}` });
            } catch { void 0; }
          }}
          data-testid={`btn-open-log-file-${process.name}`}
        >
          Open Log Folder
        </Button>
      </Space>

      {showLogs && (
        <div
          ref={logContainerRef}
          data-testid={`log-panel-${process.name}`}
          style={{
            maxHeight: 200,
            overflowY: 'auto',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            padding: '8px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No logs</div>
          ) : (
            logs.map((line) => (
              <div key={`${process.name}-${line}`} style={{ lineHeight: 1.6 }}>
                {line}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ProcessesSettings() {
  const [processes, setProcesses] = useState<ProcessSnapshot[]>([]);
  const [hasData, setHasData] = useState(false);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);

  const fetchProcesses = useCallback(async () => {
    try {
      const result = await tauriInvoke('list_processes');
      setProcesses(result as ProcessSnapshot[]);
      setHasData(true);
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    void fetchProcesses();
    const id = setInterval(() => { void fetchProcesses(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchProcesses]);

  const totalMemoryMb = processes.reduce((sum, p) => sum + (p.rssMb ?? 0), 0);

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
        const pct = memoryPct(record.rssMb, record.maxMemoryMb);
        return (
          <div style={{ minWidth: 120 }}>
            <Progress
              percent={pct}
              strokeColor={
                pct >= 90
                  ? 'var(--color-error)'
                  : pct >= 70
                    ? 'var(--color-warning)'
                    : 'var(--color-success)'
              }
              trailColor="var(--bg-subtle)"
              size="small"
              format={() => `${record.rssMb != null ? Math.round(record.rssMb) : '—'}/${record.maxMemoryMb} MB`}
            />
          </div>
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
    <div style={{ contain: 'content' }}>
      <SettingsHeader title="Processes">
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
              {Math.round(totalMemoryMb)} MB total
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
          }}
          expandable={{
            expandedRowKeys: expandedRows,
            onExpandedRowsChange: (keys) => setExpandedRows(keys as string[]),
            expandedRowRender: (record) => (
              <DetailPanel
                process={record}
                onAction={fetchProcesses}
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
