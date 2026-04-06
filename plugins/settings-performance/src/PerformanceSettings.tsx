// A008/BudgetMetrics: Zone 3 render — reads live metrics from Rust via tauriInvoke,
// refreshes every 2s, displays preset selector and progress bars.
import { useEffect, useState, useRef } from 'react';
import { Card, Progress, Radio, Space, Tag, Typography } from 'antd';
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
  if (pct >= 90) return 'var(--color-error)';
  if (pct >= 70) return 'var(--color-warning)';
  return 'var(--color-success)';
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

export default function PerformanceSettings() {
  const [metrics, setMetrics] = useState<BudgetMetrics | null>(null);
  const [preset, setPreset] = useState<Preset>('balanced');
  const [originalPreset, setOriginalPreset] = useState<Preset>('balanced');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const isDirty = preset !== originalPreset;
  const presetLoadedRef = useRef(false);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const snap = await tauriInvoke<BudgetMetrics>('budget_snapshot');
        if (!active) return;
        setMetrics(snap);
        if (!presetLoadedRef.current) {
          const name = snap.presetName.toLowerCase() as Preset;
          if (name === 'performance' || name === 'balanced' || name === 'battery') {
            setPreset(name);
            setOriginalPreset(name);
          }
          presetLoadedRef.current = true;
        }
      } catch {
        void 0;
      }
    };

    void poll();
    const id = setInterval(poll, REFRESH_INTERVAL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

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
            await tauriInvoke('set_preset', { presetName: preset });
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
              <Radio value="battery" style={{ color: 'var(--text-primary)' }}>
                <PresetOption name="Battery" specs={{ cpu: 2, ram: '512MB', fps: 30 }} />
              </Radio>
              <Radio value="balanced" style={{ color: 'var(--text-primary)' }}>
                <PresetOption name="Balanced" specs={{ cpu: 4, ram: '1GB', fps: 60 }} />
              </Radio>
              <Radio value="performance" style={{ color: 'var(--text-primary)' }}>
                <PresetOption
                  name="Performance"
                  specs={{
                    cpu: metrics ? Math.max(metrics.cpuTotal, 4) : 4,
                    ram: metrics
                      ? metrics.agentscopeMaxMb >= 1024
                        ? `${Math.floor(metrics.agentscopeMaxMb / 1024)}GB`
                        : `${Math.floor(metrics.agentscopeMaxMb)}MB`
                      : '—',
                    fps: 60,
                  }}
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
