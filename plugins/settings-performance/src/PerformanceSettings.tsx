// A008/BudgetMetrics: Zone 3 render — reads live metrics from Rust via tauriInvoke,
// refreshes every 2s, displays preset selector and progress bars.
import { useEffect, useState, useCallback } from 'react';
import { Card, Progress, Radio, Space, Typography } from 'antd';
import { createTauriBridge, SettingsHeader } from '@snapfzz/shared';

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

const REFRESH_INTERVAL_MS = 2000;

// A001/GPUOnlyAnimations: all color decisions via CSS variables — no hardcoded hex.
function healthColor(pct: number): string {
  if (pct >= 90) return 'var(--color-error, #ff4d4f)';
  if (pct >= 70) return 'var(--color-warning, #faad14)';
  return 'var(--color-success, #52c41a)';
}

function pct(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

const bridge = createTauriBridge();

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return bridge.invoke<T>(command, args);
}

type Preset = 'performance' | 'balanced' | 'battery';

const PRESET_LABELS: Record<Preset, string> = {
  battery: 'Battery · 2 CPU · 512MB · 30fps',
  balanced: 'Balanced · 4 CPU · 1GB · 60fps',
  performance: 'Performance · scales to 90% of hardware',
};

export default function PerformanceSettings() {
  const [metrics, setMetrics] = useState<BudgetMetrics | null>(null);
  const [preset, setPreset] = useState<Preset>('balanced');
  const [originalPreset, setOriginalPreset] = useState<Preset>('balanced');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isDirty = preset !== originalPreset;

  const fetchMetrics = useCallback(async () => {
    try {
      const snap = await tauriInvoke<BudgetMetrics>('budget_snapshot');
      setMetrics(snap);
      const name = snap.presetName.toLowerCase() as Preset;
      if (name in PRESET_LABELS) {
        setPreset(name);
        setOriginalPreset(name);
      }
    } catch {
      // Tauri not available in browser preview — metrics remain null
    }
  }, []);

  useEffect(() => {
    void fetchMetrics();
    const id = setInterval(() => { void fetchMetrics(); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchMetrics]);

  // A001/PerformanceArchitecture: frame_target_ms is the budget ceiling, not a usage counter.
  // Display it as a configuration value; use 0% fill to avoid misleading 100% bar.
  const cpuPct = metrics ? pct(metrics.cpuUsed, metrics.cpuTotal) : 0;
  const memPct = metrics ? pct(metrics.agentscopeRssMb ?? 0, metrics.agentscopeMaxMb) : 0;
  const invokePct = metrics ? pct(metrics.invokeUsed, metrics.invokeTotal) : 0;
  const storagePct = metrics ? pct(metrics.storageUsedGb, metrics.storageMaxGb) : 0;

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
            const current = await tauriInvoke<Record<string, unknown>>('get_settings');
            await tauriInvoke('save_settings', { settings: { ...current, preset } });
            setOriginalPreset(preset);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2500);
          } catch { void 0; }
          setSaving(false);
        }}
        onDiscard={() => setPreset(originalPreset)}
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
      <div style={{ padding: "16px 32px", maxWidth: 640 }}>
      <Card
        title={<Text style={{ color: 'var(--text-primary)' }}>Preset</Text>}
        style={{ marginBottom: 20, background: 'var(--bg-default)', borderColor: 'var(--border-default)' }}
      >
        <Space direction="vertical" size={12}>
          <Radio.Group
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
          >
            <Space>
              {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
                <Radio key={p} value={p} style={{ color: 'var(--text-primary)' }}>
                  {PRESET_LABELS[p]}
                </Radio>
              ))}
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

      {/* A001/PerformanceArchitecture: frame budget — 60fps = 16ms target */}
      <Card
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Text style={{ color: 'var(--text-primary)' }}>Frame Budget</Text>{metrics && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-success)', animation: 'pulse 2s ease-in-out infinite' }} />}</span>}
        style={{ marginBottom: 16, background: 'var(--bg-default)', borderColor: 'var(--border-default)' }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Target</Text>
            <Text style={{ color: 'var(--text-primary)', fontSize: 13 }}>
              {metrics ? `${metrics.frameTargetMs}ms (${metrics.frameTargetMs <= 16 ? '60fps' : '30fps'})` : '—'}
            </Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Batch Rate</Text>
            <Text style={{ color: 'var(--text-primary)', fontSize: 13 }}>
              {metrics ? `${metrics.batchRateMs}ms` : '—'}
            </Text>
          </div>
        </Space>
      </Card>

      {/* A008/ControlledDomain: CPU semaphore permits */}
      <Card
        title={<Text style={{ color: 'var(--text-primary)' }}>CPU Budget</Text>}
        style={{ marginBottom: 16, background: 'var(--bg-default)', borderColor: 'var(--border-default)' }}
      >
        <Progress
          percent={cpuPct}
          strokeColor={healthColor(cpuPct)}
          trailColor="var(--bg-subtle)"
          format={() => metrics ? `${metrics.cpuUsed}/${metrics.cpuTotal} permits in use` : '—'}
          size="small"
        />
      </Card>

      {/* A008/SupervisedDomain: AgentScope RSS vs max_memory_mb */}
      <Card
        title={<Text style={{ color: 'var(--text-primary)' }}>Memory Budget</Text>}
        style={{ marginBottom: 16, background: 'var(--bg-default)', borderColor: 'var(--border-default)' }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>AgentScope</Text>
            <Text style={{ color: 'var(--text-primary)', fontSize: 13 }}>
              {metrics
                ? `${metrics.agentscopeRssMb !== null ? Math.round(metrics.agentscopeRssMb) : '—'}/${metrics.agentscopeMaxMb} MB`
                : '—'}
            </Text>
          </div>
          <Progress
            percent={memPct}
            strokeColor={healthColor(memPct)}
            trailColor="var(--bg-subtle)"
            size="small"
            format={() =>
              metrics
                ? metrics.agentscopeStatus === 'online'
                  ? 'online'
                  : metrics.agentscopeStatus
                : '—'
            }
          />
        </Space>
      </Card>

      {/* A008/ControlledDomain: invoke semaphore — network concurrency */}
      <Card
        title={<Text style={{ color: 'var(--text-primary)' }}>Network Budget</Text>}
        style={{ marginBottom: 16, background: 'var(--bg-default)', borderColor: 'var(--border-default)' }}
      >
        <Progress
          percent={invokePct}
          strokeColor={healthColor(invokePct)}
          trailColor="var(--bg-subtle)"
          format={() => metrics ? `${metrics.invokeUsed}/${metrics.invokeTotal} concurrent invokes` : '—'}
          size="small"
        />
      </Card>

      {/* A008/Storage: workspace + logs + sessions footprint */}
      <Card
        title={<Text style={{ color: 'var(--text-primary)' }}>Storage Budget</Text>}
        style={{ marginBottom: 16, background: 'var(--bg-default)', borderColor: 'var(--border-default)' }}
      >
        <Progress
          percent={storagePct}
          strokeColor={healthColor(storagePct)}
          trailColor="var(--bg-subtle)"
          format={() => metrics ? `${metrics.storageUsedGb}/${metrics.storageMaxGb} GB used` : '—'}
          size="small"
        />
      </Card>

      {metrics && metrics.disabledPlugins.length > 0 && (
        <Card
          title={<Text style={{ color: 'var(--color-error, #ff4d4f)' }}>Disabled Plugins</Text>}
          style={{ background: 'var(--bg-default)', borderColor: 'var(--color-error, #ff4d4f)' }}
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
