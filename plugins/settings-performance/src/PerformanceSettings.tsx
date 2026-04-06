// A008/BudgetMetrics: Zone 3 render — reads live metrics from Rust via tauriInvoke,
// refreshes every 2s, displays preset selector and budget table.
import { useEffect, useState } from 'react';
import { Card, Progress, Radio, Space, Table, Tag, Typography } from 'antd';
import { AntIcon, createTauriBridge, SettingsHeader } from '@snapfzz/shared';

const { Text } = Typography;

// A008/BudgetMetrics: mirrors serde camelCase output of BudgetMetrics in metrics.rs
interface BudgetMetrics {
  presetName: string;
  cpuUsed: number;
  cpuTotal: number;
  invokeUsed: number;
  invokeTotal: number;
  frameTargetMs: number;
  batchRateMs: number;
  agentscopeRssMb: number | null;
  agentscopeMaxMb: number;
  agentscopeStatus: 'starting' | 'online' | 'unhealthy' | 'restarting' | 'stopped' | 'errored';
  storageUsedGb: number;
  storageMaxGb: number;
  disabledPlugins: string[];
  uptimeSecs: number;
}

interface HardwareInfo {
  cores: number;
  ramGb: number;
  onBattery: boolean;
}

// A008/BudgetTable: row data for the consolidated budget table (U005/BudgetDisplay).
interface BudgetRow {
  key: string;
  name: string;
  icon: string;
  current: string;
  limit: string;
  // 0-100 for Progress bar, -1 for N/A (no usage bar)
  percent: number;
}

const REFRESH_INTERVAL_MS = 2000;

const bridge = createTauriBridge();

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return bridge.invoke<T>(command, args);
}

type Preset = 'performance' | 'balanced' | 'battery';

function PresetOption({ name, specs }: { name: string; specs: { cpu: number; ram: string; fps: number } }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Text strong style={{ fontSize: 13 }}>{name}</Text>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Tag color="blue">{specs.cpu} CPU</Tag>
        <Tag color="purple">{specs.ram}</Tag>
        <Tag>{specs.fps}fps</Tag>
      </div>
    </div>
  );
}

// A008/BudgetTable: build the 8 displayable budget rows from a BudgetMetrics snapshot.
// Engineering budget is infrastructure-only and not UI-displayable (see A008).
function buildBudgetRows(metrics: BudgetMetrics): BudgetRow[] {
  return [
    {
      key: 'frame',
      name: 'Frame',
      icon: 'ThunderboltOutlined',
      current: '—',
      limit: `${metrics.frameTargetMs}ms (${metrics.frameTargetMs <= 16 ? '60' : '30'}fps)`,
      percent: -1,
    },
    {
      key: 'batch',
      name: 'Batch Rate',
      icon: 'SwapOutlined',
      current: '—',
      limit: `${metrics.batchRateMs}ms`,
      percent: -1,
    },
    {
      key: 'cpu',
      name: 'CPU Permits',
      icon: 'ApiOutlined',
      current: `${metrics.cpuUsed} in use`,
      limit: `${metrics.cpuTotal}`,
      percent: metrics.cpuTotal > 0 ? Math.round((metrics.cpuUsed / metrics.cpuTotal) * 100) : 0,
    },
    {
      key: 'memory',
      name: 'Memory',
      icon: 'DatabaseOutlined',
      current: `${metrics.agentscopeRssMb != null ? Math.round(metrics.agentscopeRssMb) : '—'} MB`,
      limit: `${metrics.agentscopeMaxMb} MB`,
      percent:
        metrics.agentscopeMaxMb > 0 && metrics.agentscopeRssMb != null
          ? Math.round((metrics.agentscopeRssMb / metrics.agentscopeMaxMb) * 100)
          : 0,
    },
    {
      key: 'network',
      name: 'Network',
      icon: 'CloudOutlined',
      current: `${metrics.invokeUsed} invokes`,
      limit: `${metrics.invokeTotal}`,
      percent: metrics.invokeTotal > 0 ? Math.round((metrics.invokeUsed / metrics.invokeTotal) * 100) : 0,
    },
    {
      key: 'storage',
      name: 'Storage',
      icon: 'HddOutlined',
      current: `${metrics.storageUsedGb} GB`,
      limit: `${metrics.storageMaxGb} GB`,
      percent: metrics.storageMaxGb > 0 ? Math.round((metrics.storageUsedGb / metrics.storageMaxGb) * 100) : 0,
    },
    {
      key: 'startup',
      name: 'Startup',
      icon: 'RocketOutlined',
      current: '—',
      limit: '200ms visible / 500ms interactive',
      percent: -1,
    },
    {
      key: 'reliability',
      name: 'Reliability',
      icon: 'SafetyCertificateOutlined',
      current: `${metrics.disabledPlugins?.length ?? 0} disabled`,
      limit: '3 strikes / 5min',
      percent: -1,
    },
  ];
}

// A001/GPUOnlyAnimations: all color decisions via CSS variables — no hardcoded hex.
function strokeColorForPct(pct: number): string {
  if (pct >= 90) return 'var(--color-error)';
  if (pct >= 70) return 'var(--color-warning)';
  return 'var(--color-success)';
}

// A008/BudgetTable: column definitions for the Ant Design Table.
const columns = [
  {
    title: 'Budget',
    dataIndex: 'name',
    key: 'name',
    render: (name: string, record: BudgetRow) => (
      <Space>
        <AntIcon name={record.icon} />
        <Text strong>{name}</Text>
      </Space>
    ),
  },
  {
    title: 'Current',
    dataIndex: 'current',
    key: 'current',
    render: (val: string) => <Text style={{ color: 'var(--text-secondary)' }}>{val}</Text>,
  },
  {
    title: 'Limit',
    dataIndex: 'limit',
    key: 'limit',
    render: (val: string) => <Text style={{ color: 'var(--text-muted)' }}>{val}</Text>,
  },
  {
    title: 'Usage',
    dataIndex: 'percent',
    key: 'usage',
    width: 150,
    render: (pct: number) =>
      pct >= 0 ? (
        <Progress
          percent={pct}
          size="small"
          strokeColor={strokeColorForPct(pct)}
          showInfo={false}
        />
      ) : (
        <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</Text>
      ),
  },
];

export default function PerformanceSettings() {
  const [metrics, setMetrics] = useState<BudgetMetrics | null>(null);
  // A008/StatelessUI: pendingPreset is the ONLY local state for preset.
  // activePreset is always derived from the backend snapshot — never stored in state.
  const [pendingPreset, setPendingPreset] = useState<Preset | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hwInfo, setHwInfo] = useState<HardwareInfo | null>(null);

  const activePreset = (metrics?.presetName?.toLowerCase() as Preset) || 'balanced';
  const displayPreset = pendingPreset ?? activePreset;
  const isDirty = pendingPreset !== null && pendingPreset !== activePreset;

  useEffect(() => {
    tauriInvoke<HardwareInfo>('get_hardware_info')
      .then(setHwInfo)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const snap = await tauriInvoke<BudgetMetrics>('budget_snapshot');
        if (!active) return;
        setMetrics(snap);
      } catch {
        void 0;
      }
    };

    void poll();
    const id = setInterval(poll, REFRESH_INTERVAL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  // A008/PerformancePreset: compute hardware-scaled Performance badge values.
  // Mirrors the build_preset(Performance) formula in preset.rs.
  const perfCpu = hwInfo ? Math.max(hwInfo.cores - 2, 4) : 4;
  const perfRamMb = hwInfo ? Math.min(hwInfo.ramGb * 512, 8192) : 2048;
  const perfRam = perfRamMb >= 1024 ? `${Math.floor(perfRamMb / 1024)}GB` : `${perfRamMb}MB`;

  const budgetRows: BudgetRow[] = metrics ? buildBudgetRows(metrics) : [];

  return (
    <div style={{ contain: 'content' }}>
      <SettingsHeader
        title="Performance"
        isDirty={isDirty}
        saving={saving}
        saveSuccess={saveSuccess}
        onSave={async () => {
          setSaving(true);
          try {
            await tauriInvoke('set_preset', { presetName: displayPreset });
            const current = await tauriInvoke<Record<string, unknown>>('get_settings');
            await tauriInvoke('save_settings', { settings: { ...current, preset: displayPreset } });
            setPendingPreset(null);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2500);
          } catch { void 0; }
          setSaving(false);
        }}
        onDiscard={() => setPendingPreset(null)}
      >
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 8px',
          borderRadius: 10,
          background: metrics ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
          fontSize: 11,
          fontWeight: 500,
          color: metrics ? 'var(--color-success)' : 'var(--color-error)',
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: metrics ? 'var(--color-success)' : 'var(--color-error)',
            animation: metrics ? 'pulse 2s ease-in-out infinite' : 'none',
          }} />
          {metrics ? 'Live' : 'Offline'}
        </span>
      </SettingsHeader>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      <div style={{ padding: '16px 32px', maxWidth: 640 }}>
        <Card
          title={<Text style={{ color: 'var(--text-primary)' }}>Preset</Text>}
          style={{ marginBottom: 20, background: 'var(--bg-default)', borderColor: 'var(--border-default)' }}
        >
          <Space direction="vertical" size={12}>
            <Radio.Group
              value={displayPreset}
              onChange={(e) => setPendingPreset(e.target.value as Preset)}
            >
              <Space>
                <Radio value="battery" style={{ color: 'var(--text-primary)' }}>
                  <PresetOption name="Battery" specs={{ cpu: 2, ram: '512MB', fps: 30 }} />
                </Radio>
                <Radio value="balanced" style={{ color: 'var(--text-primary)' }}>
                  <PresetOption name="Balanced" specs={{ cpu: 4, ram: '1GB', fps: 60 }} />
                </Radio>
                <Radio value="performance" style={{ color: 'var(--text-primary)' }}>
                  <PresetOption
                    name="Performance"
                    specs={{ cpu: perfCpu, ram: perfRam, fps: 60 }}
                  />
                </Radio>
                <Radio value="custom" disabled style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                  Custom <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(coming soon)</span>
                </Radio>
              </Space>
            </Radio.Group>
            {metrics && (
              <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Active: {metrics.presetName} · {metrics.cpuTotal} CPU permits · {metrics.agentscopeMaxMb >= 1024 ? `${metrics.agentscopeMaxMb / 1024}GB` : `${metrics.agentscopeMaxMb}MB`} agent cap · {metrics.frameTargetMs <= 16 ? '60fps' : '30fps'} · uptime {Math.floor(metrics.uptimeSecs / 60)}m
              </Text>
            )}
          </Space>
        </Card>

        {/* A008/BudgetTable: consolidated view of all 8 displayable budgets (A008/BudgetRegistry). */}
        {metrics ? (
          <Table<BudgetRow>
            dataSource={budgetRows}
            columns={columns}
            size="middle"
            pagination={false}
            bordered
            rowKey="key"
            style={{ marginBottom: 20 }}
          />
        ) : (
          <Text style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</Text>
        )}

        {metrics && metrics.disabledPlugins.length > 0 && (
          <Card
            title={<Text style={{ color: 'var(--color-error)' }}>Disabled Plugins</Text>}
            style={{ background: 'var(--bg-default)', borderColor: 'var(--color-error)' }}
          >
            <Space direction="vertical" size={4}>
              {metrics.disabledPlugins.map((pid) => (
                <Text key={pid} style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  {pid}
                </Text>
              ))}
            </Space>
          </Card>
        )}
      </div>
    </div>
  );
}
