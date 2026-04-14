// A008/BudgetMetrics: Zone 3 render — reads live metrics from Rust via shared bridge IPC,
// refreshes every 2s, displays preset selector and budget table.
import { useEffect, useState } from 'react';
import { Card, Progress, Radio, Space, Typography } from 'antd';
import { AntIcon, createTauriBridge, SettingsHeader, fetchWithToast } from '@snapfzz/shared';

const { Text } = Typography;

// A008/BudgetMetrics: mirrors serde camelCase output of BudgetMetrics in metrics.rs
interface BudgetMetrics {
  presetName: string;
  cpuUsed: number;
  cpuTotal: number;
  invokeUsed: number;
  invokeTotal: number;
  batchIntervalMs: number;
  batchRateMs: number;
  /// A008/UnifiedBudget: Total RSS across all processes
  totalRssMb: number;
  /// A008/UnifiedBudget: Shared memory limit from preset
  appTotalMb: number;
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
  percent: number;
  description: string;
}

const REFRESH_INTERVAL_MS = 2000;

const bridge = createTauriBridge();

type Preset = 'performance' | 'balanced' | 'battery';

function PresetOption({ name }: { name: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Text strong style={{ fontSize: 13 }}>{name}</Text>
    </div>
  );
}

// A008/BudgetTable: build the 8 displayable budget rows from a BudgetMetrics snapshot.
// Engineering budget is infrastructure-only and not UI-displayable (see A008).
function buildBudgetRows(metrics: BudgetMetrics): BudgetRow[] {
  return [
    {
      key: 'batch',
      name: 'Batch Interval',
      icon: 'ThunderboltOutlined',
      current: '—',
      limit: `${metrics.batchIntervalMs}ms`,
      percent: -1,
      description: 'How often streaming tokens are flushed to the UI. At 16ms, tokens arrive ~60 times/sec. Battery mode relaxes to 33ms (~30 times/sec) to reduce CPU usage.',
    },
    {
      key: 'cpu',
      name: 'CPU Permits',
      icon: 'ApiOutlined',
      current: `${metrics.cpuUsed} in use`,
      limit: `${metrics.cpuTotal}`,
      percent: metrics.cpuTotal > 0 ? Math.round((metrics.cpuUsed / metrics.cpuTotal) * 100) : 0,
      description: 'Concurrent compute tasks allowed in the backend. Each stream parse or heavy operation acquires a permit. When exhausted, work queues until a permit is released. Example: with 4 permits, 4 simultaneous streams can be processed in parallel.',
    },
    {
      key: 'memory',
      name: 'Memory',
      icon: 'DatabaseOutlined',
      current: metrics.totalRssMb != null ? `${Math.round(metrics.totalRssMb)} MB` : '— MB',
      limit: `${metrics.appTotalMb} MB`,
      percent:
        metrics.appTotalMb > 0 && metrics.totalRssMb != null
          ? Math.round((metrics.totalRssMb / metrics.appTotalMb) * 100)
          : 0,
      description: 'Unified memory budget shared by all processes (agentscope, litellm). Monitored every 2s. If total exceeds the limit, the enforcing loop logs a warning. Example: with 16GB limit, all processes combined must stay under 16GB.',
    },
    {
      key: 'network',
      name: 'Network',
      icon: 'CloudOutlined',
      current: `${metrics.invokeUsed} invokes`,
      limit: `${metrics.invokeTotal}`,
      percent: metrics.invokeTotal > 0 ? Math.round((metrics.invokeUsed / metrics.invokeTotal) * 100) : 0,
      description: 'Maximum concurrent backend calls from plugins. Each plugin command acquires a permit. When exhausted, plugins receive a "budget exhausted" error. Example: with 10 permits, 10 plugins can call the backend simultaneously.',
    },
    {
      key: 'storage',
      name: 'Storage',
      icon: 'HddOutlined',
      current: `${metrics.storageUsedGb} GB`,
      limit: `${metrics.storageMaxGb} GB`,
      percent: metrics.storageMaxGb > 0 ? Math.round((metrics.storageUsedGb / metrics.storageMaxGb) * 100) : 0,
      description: 'Disk space used by the app data directory (settings, logs, sessions, runtime data). At 90% threshold, cleanup is triggered automatically. Example: 10GB limit with 9GB used triggers old session pruning.',
    },

    {
      key: 'reliability',
      name: 'Reliability',
      icon: 'SafetyCertificateOutlined',
      current: `${metrics.disabledPlugins?.length ?? 0} disabled`,
      limit: '3 strikes / 5min',
      percent: -1,
      description: 'Plugin crash tolerance. Each render crash increments a strike counter. 3 strikes within 5 minutes → plugin auto-disabled. A retry button lets users re-enable. Example: a buggy plugin crashes 3 times → disabled, other plugins unaffected.',
    },
  ];
}

// A001/GPUOnlyAnimations: all color decisions via CSS variables — no hardcoded hex.
function strokeColorForPct(pct: number): string {
  if (pct >= 90) return 'var(--color-error)';
  if (pct >= 70) return 'var(--color-warning)';
  return 'var(--color-success)';
}

function BudgetItem({ row }: { row: BudgetRow }) {
  return (
    <div style={{
      padding: '12px 0',
      borderBottom: '1px solid var(--border-default)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Space size={8}>
          <AntIcon name={row.icon} style={{ color: 'var(--text-muted)', fontSize: 14 }} />
          <Text strong style={{ fontSize: 13 }}>{row.name}</Text>
        </Space>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: 'var(--text-primary)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{row.current}</Text>
          <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>/ {row.limit}</Text>
        </div>
      </div>
      {row.percent >= 0 && (
        <Progress
          percent={row.percent}
          size="small"
          strokeColor={strokeColorForPct(row.percent)}
          showInfo={false}
          style={{ margin: '4px 0' }}
        />
      )}
      <Text style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: '16px' }}>{row.description}</Text>
    </div>
  );
}

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
    bridge.invoke<HardwareInfo>('get_hardware_info')
      .then(setHwInfo)
      .catch((err) => { console.error(err); });
  }, []);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const snap = await bridge.invoke<BudgetMetrics>('budget_snapshot');
        if (!active) return;
        setMetrics(snap);
      } catch {
        void 0;
      }
    };

    void poll();
    const id = setInterval(poll, REFRESH_INTERVAL_MS);

    let unlisten: (() => void) | null = null;
    bridge.listen<BudgetMetrics>('budget-metrics', (payload) => {
      if (!active) return;
      setMetrics(payload);
    }).then((fn) => {
      unlisten = fn;
    }).catch(() => {
      void 0;
    });

    return () => {
      active = false;
      clearInterval(id);
      if (unlisten) unlisten();
    };
  }, []);

  // A008/PerformancePreset: compute hardware-scaled Performance badge values.
  // Mirrors the build_preset(Performance) formula in preset.rs.
  const perfCpu = hwInfo ? Math.max(hwInfo.cores - 2, 4) : 4;
  const perfRamMb = hwInfo ? Math.min(hwInfo.ramGb * 512, 8192) : 2048;
  const perfRam = perfRamMb >= 1024 ? `${Math.floor(perfRamMb / 1024)}GB` : `${perfRamMb}MB`;

  const budgetRows: BudgetRow[] = metrics ? buildBudgetRows(metrics) : [];

  return (
    <div style={{ contain: 'layout paint' }}>
      <SettingsHeader
        title="Performance"
        subtitle="Monitor resource allocation and adjust budget presets to balance responsiveness against system load."
        isDirty={isDirty}
        saving={saving}
        saveSuccess={saveSuccess}
        onSave={async () => {
          setSaving(true);
          const { error } = await fetchWithToast(
            async () => {
              await bridge.invoke('set_preset', { presetName: displayPreset });
              const current = await bridge.invoke<Record<string, unknown>>('get_settings');
              await bridge.invoke('save_settings', { settings: { ...current, preset: displayPreset } });
              window.dispatchEvent(new CustomEvent('snapfzz:settings-changed'));
              setPendingPreset(null);
              try {
                const snap = await bridge.invoke<BudgetMetrics>('budget_snapshot');
                setMetrics(snap);
              } catch { void 0; }
            },
            { successMessage: 'Preset applied', errorMessage: 'Failed to apply preset' },
          );
          if (!error) {
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2500);
          }
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
      <div style={{ padding: '16px 32px' }}>
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
                  <PresetOption name="Battery" />
                </Radio>
                <Radio value="balanced" style={{ color: 'var(--text-primary)' }}>
                  <PresetOption name="Balanced" />
                </Radio>
                <Radio value="performance" style={{ color: 'var(--text-primary)' }}>
                  <PresetOption name="Performance" />
                </Radio>
                <Radio value="custom" disabled style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                  Custom <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(coming soon)</span>
                </Radio>
              </Space>
            </Radio.Group>
            {metrics && (
              <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Active: {metrics.presetName} · {metrics.cpuTotal} CPU permits · {metrics.appTotalMb >= 1024 ? `${Math.round(metrics.appTotalMb / 1024)}GB` : `${metrics.appTotalMb}MB`} unified memory · {metrics.batchIntervalMs}ms batch · uptime {Math.floor(metrics.uptimeSecs / 60)}m
              </Text>
            )}
          </Space>
        </Card>

        {metrics ? (
          <div>
            {budgetRows.map((row) => (
              <BudgetItem key={row.key} row={row} />
            ))}
          </div>
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
