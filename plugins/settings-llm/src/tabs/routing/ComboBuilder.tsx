// Combo Builder — 4-step wizard for creating/editing routing combos.

import { useState } from 'react';
import { Input, InputNumber, Radio, Select, Slider, Tag, Tooltip, Typography } from 'antd';

const { Text } = Typography;
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { AppButton } from '@snapfzz/shared';
import type {
  ComboConfig,
  ComposedPayloads,
  Deployment,
  RoutingStrategy,
} from '../../routing/composer';
import { composeCombo } from '../../routing/composer';
import type { CustomProvider } from '../../hooks/useLlmCommands';

// --- types ---

export interface AvailableModelInfo {
  name: string;          // e.g. "solo-engineer/coder"
  apiBase?: string;      // e.g. "https://llm.solo.engineer/v1"
  model?: string;        // e.g. "openai/coder" — the litellm_params.model value
  provider?: string;     // e.g. "custom-solo-engineer"
  apiKey?: string;       // The actual API key (from litellm_params)
}

export interface ComboBuilderProps {
  existingCombo?: ComboConfig;
  providers: CustomProvider[];
  availableModels: AvailableModelInfo[];  // Models from /v1/model/info
  onSave: (payloads: ComposedPayloads) => Promise<void>;
  onCancel: () => void;
}

// --- strategy definitions ---

interface StrategyDef {
  value: RoutingStrategy;
  label: string;
  description: string;
  whenToUse: string;
  avoidWhen: string;
}

const STRATEGY_DEFS: StrategyDef[] = [
  {
    value: 'round-robin',
    label: 'Round Robin',
    description: 'Equal distribution across all deployments',
    whenToUse: 'All deployments are similar in capacity.',
    avoidWhen: 'Deployments have very different RPM limits.',
  },
  {
    value: 'weighted',
    label: 'Weighted',
    description: 'Custom weight per deployment',
    whenToUse: 'You want to split traffic precisely (80/20).',
    avoidWhen: 'Weights are hard to reason about upfront.',
  },
  {
    value: 'priority',
    label: 'Priority',
    description: 'Ordered failover — try first, cascade on failure',
    whenToUse: 'You have a primary and backup deployments.',
    avoidWhen: 'All deployments are equally preferred.',
  },
  {
    value: 'least-busy',
    label: 'Least Busy',
    description: 'Route to deployment with fewest active requests',
    whenToUse: 'Requests have high variance in duration.',
    avoidWhen: 'Deployments are all similarly loaded.',
  },
  {
    value: 'cost-optimized',
    label: 'Cost Optimized',
    description: 'Route to cheapest available deployment',
    whenToUse: 'Minimizing cost is the top priority.',
    avoidWhen: 'Deployments have identical pricing.',
  },
  {
    value: 'latency-optimized',
    label: 'Latency Optimized',
    description: 'Route to fastest responding deployment',
    whenToUse: 'Response time is critical for the use case.',
    avoidWhen: 'All deployments are co-located / same region.',
  },
  {
    value: 'fill-first',
    label: 'Fill First',
    description: 'Use primary until rate limit, then overflow',
    whenToUse: 'Primary has low RPM; secondary is a safety net.',
    avoidWhen: 'All deployments should share load equally.',
  },
];

// --- step indicator ---

function StepIndicator({
  steps,
  current,
  onStep,
}: {
  steps: string[];
  current: number;
  onStep: (i: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <button
              onClick={() => onStep(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 0',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: done ? 'var(--color-success)' : active ? 'var(--color-info)' : 'var(--bg-subtle)',
                  border: `2px solid ${done ? 'var(--color-success)' : active ? 'var(--color-info)' : 'var(--border-default)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: done || active ? '#fff' : 'var(--text-muted)',
                  flexShrink: 0,
                }}
              >
                {done ? '✓' : i + 1}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: done ? 'var(--color-success)' : 'var(--border-default)',
                  margin: '0 8px',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Step 1: Basics ---

function StepBasics({
  name,
  onChange,
}: {
  name: string;
  onChange: (v: string) => void;
}) {
  const isValid = /^[a-z0-9_-]+$/.test(name);
  const showError = name.length > 0 && !isValid;

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Combo Name
        </label>
        <Input
          value={name}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          placeholder="e.g. gpt4-pool"
          size="large"
          status={showError ? 'error' : undefined}
        />
        {showError && (
          <div style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 4 }}>
            Only lowercase letters, numbers, dashes and underscores are allowed.
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
          This name is what users will use to request this model group.
        </div>
      </div>
    </div>
  );
}

// --- Step 2: Deployments ---

function StepDeployments({
  deployments,
  availableModels,
  apiType,
  onApiTypeChange,
  onChange,
}: {
  deployments: Deployment[];
  availableModels: AvailableModelInfo[];
  apiType: 'openai' | 'anthropic';
  onApiTypeChange: (t: 'openai' | 'anthropic') => void;
  onChange: (deps: Deployment[]) => void;
}) {
  // Derive selected values from deployments using modelName (unique key).
  const selectedNames = deployments.map((d) => d.modelName ?? d.model);

  // Filter models by selected API type and deduplicate by name (model_name is unique).
  const seenNames = new Set<string>();
  const modelOptions: { label: string; value: string }[] = [];
  for (const m of availableModels) {
    if (m.model && !m.model.startsWith(`${apiType}/`)) continue;
    if (seenNames.has(m.name)) continue;
    seenNames.add(m.name);
    modelOptions.push({ label: m.name, value: m.name });
  }

  const handleSelectionChange = (selected: string[]) => {
    const newDeployments: Deployment[] = selected.map((name) => {
      const info = availableModels.find((m) => m.name === name);
      return {
        provider: info?.provider ?? '',
        model: info?.model ?? name,
        modelName: name,  // Unique key: the LiteLLM model_name (e.g. "solo-engineer/coder")
        apiBase: info?.apiBase ?? '',
      };
    });
    onChange(newDeployments);
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          API Type
        </div>
        <Radio.Group
          value={apiType}
          onChange={(e) => onApiTypeChange(e.target.value as 'openai' | 'anthropic')}
        >
          <Radio value="openai">OpenAI Compatible</Radio>
          <Radio value="anthropic">Anthropic Compatible</Radio>
        </Radio.Group>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          Select Models
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
          Choose which models to include in this combo. Requests will be distributed across selected models based on the routing strategy.
        </div>
        <Select
          mode="multiple"
          value={selectedNames}
          options={modelOptions}
          style={{ width: '100%' }}
          placeholder="Select models to include..."
          showSearch
          filterOption={(input, opt) =>
            (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
          }
          onChange={handleSelectionChange}
          notFoundContent={
            availableModels.length === 0
              ? 'No models found. Add providers in the Providers tab first.'
              : 'No matching models'
          }
        />
      </div>

      {deployments.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: 8, marginBottom: 8 }}>
            <div style={headerStyle}>Model</div>
            <div style={headerStyle}>RPM Limit</div>
            <div style={headerStyle}>TPM Limit</div>
          </div>
          {/* Data rows */}
          {deployments.map((d, i) => {
            const displayName = deploymentDisplayName(d);
            return (
              <div
                key={d.model}
                style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: 8, marginBottom: 6, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }} ellipsis>{displayName}</Text>
                <InputNumber
                  size="small"
                  min={1}
                  placeholder="No limit"
                  value={d.rpmLimit ?? undefined}
                  onChange={(v) => {
                    const updated = [...deployments];
                    updated[i] = { ...d, rpmLimit: v ?? undefined };
                    onChange(updated);
                  }}
                  style={{ width: '100%' }}
                />
                <InputNumber
                  size="small"
                  min={1}
                  placeholder="No limit"
                  value={d.tpmLimit ?? undefined}
                  onChange={(v) => {
                    const updated = [...deployments];
                    updated[i] = { ...d, tpmLimit: v ?? undefined };
                    onChange(updated);
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            );
          })}
        </div>
      )}

      {deployments.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          No models selected. Select at least one to continue.
        </div>
      )}
    </div>
  );
}

// --- Step 3: Strategy ---

function StrategyCard({
  def,
  selected,
  onClick,
}: {
  def: StrategyDef;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip title={`When to use: ${def.whenToUse} Avoid: ${def.avoidWhen}`}>
      <div
        onClick={onClick}
        style={{
          padding: '14px 16px',
          background: 'var(--bg-default)',
          border: selected ? '2px solid var(--color-info)' : '1px solid var(--border-default)',
          borderRadius: 8,
          cursor: 'pointer',
          transition: 'border-color 0.15s',
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          {def.label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
          {def.description}
        </div>
      </div>
    </Tooltip>
  );
}

function StepStrategy({
  strategy,
  deployments,
  availableModels,
  onChange,
  onWeightChange,
  onReorder,
}: {
  strategy: RoutingStrategy | '';
  deployments: Deployment[];
  availableModels: AvailableModelInfo[];
  onChange: (s: RoutingStrategy) => void;
  onWeightChange: (idx: number, weight: number) => void;
  onReorder: (from: number, to: number) => void;
}) {
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 20,
        }}
      >
        {STRATEGY_DEFS.map((def) => (
          <StrategyCard
            key={def.value}
            def={def}
            selected={strategy === def.value}
            onClick={() => onChange(def.value)}
          />
        ))}
      </div>

      {strategy === 'weighted' && deployments.length > 0 && (
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Weights
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.4 }}>
            Adjust the slider to control how much traffic each model receives. Higher weight means more requests.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {deployments.map((dep, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {deploymentDisplayName(dep)}
                </span>
                <Slider
                  min={1}
                  max={100}
                  value={dep.weight ?? 1}
                  onChange={(v) => onWeightChange(idx, v)}
                  style={{ flex: 1 }}
                />
                <Tag style={{ minWidth: 36, textAlign: 'center' }}>{dep.weight ?? 1}</Tag>
              </div>
            ))}
          </div>
        </div>
      )}

      {strategy === 'priority' && deployments.length > 0 && (
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Priority Order
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.4 }}>
            Use the arrows to reorder. Requests go to the top model first and cascade down on failure.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {deployments.map((dep, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  background: 'var(--bg-default)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 6,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                  <button
                    disabled={idx === 0}
                    onClick={() => onReorder(idx, idx - 1)}
                    style={{
                      background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer',
                      padding: 0, lineHeight: 1, color: idx === 0 ? 'var(--border-default)' : 'var(--text-muted)',
                    }}
                  >
                    <ArrowUpOutlined style={{ fontSize: 11 }} />
                  </button>
                  <button
                    disabled={idx === deployments.length - 1}
                    onClick={() => onReorder(idx, idx + 1)}
                    style={{
                      background: 'none', border: 'none', cursor: idx === deployments.length - 1 ? 'default' : 'pointer',
                      padding: 0, lineHeight: 1, color: idx === deployments.length - 1 ? 'var(--border-default)' : 'var(--text-muted)',
                    }}
                  >
                    <ArrowDownOutlined style={{ fontSize: 11 }} />
                  </button>
                </div>
                <Tag style={{ minWidth: 24, textAlign: 'center' }}>{idx + 1}</Tag>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {deploymentDisplayName(dep)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Step 4: Review ---

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: ok ? 'var(--color-success)' : 'var(--color-error)', padding: '4px 0' }}>
      {ok
        ? <CheckCircleOutlined />
        : <CloseCircleOutlined />}
      {label}
    </div>
  );
}

function StepReview({
  name,
  deployments,
  strategy,
  availableModels,
  saving,
  onSubmit,
}: {
  name: string;
  deployments: Deployment[];
  strategy: RoutingStrategy | '';
  availableModels: AvailableModelInfo[];
  saving: boolean;
  onSubmit: () => void;
}) {
  const nameValid = /^[a-z0-9_-]+$/.test(name) && name.length > 0;
  const hasDeployments = deployments.length > 0;
  const hasStrategy = strategy !== '';
  const allValid = nameValid && hasDeployments && hasStrategy;

  const stratLabel = STRATEGY_DEFS.find((s) => s.value === strategy)?.label ?? strategy;

  return (
    <div style={{ maxWidth: 560 }}>
      <div
        style={{
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 20,
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <span style={labelStyle}>Combo Name</span>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{name || '—'}</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={labelStyle}>Strategy</span>
          <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{stratLabel || '—'}</div>
        </div>
        <div>
          <span style={labelStyle}>Deployments ({deployments.length})</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {deployments.map((d, i) => {
              const displayName = deploymentDisplayName(d);
              return (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {i + 1}. {displayName}
                </div>
              );
            })}
            {deployments.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>None</div>}
          </div>
        </div>
      </div>

      <div
        style={{
          background: 'var(--bg-default)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          padding: '14px 20px',
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          Validation
        </div>
        <CheckRow label="Combo name is valid" ok={nameValid} />
        <CheckRow label="At least one deployment selected" ok={hasDeployments} />
        <CheckRow label="Strategy selected" ok={hasStrategy} />
      </div>

      <AppButton
        onClick={onSubmit}
        loading={saving}
        disabled={!allValid}
        type="primary"
      >
        {saving ? 'Saving…' : 'Save'}
      </AppButton>
    </div>
  );
}

// --- helpers ---

/** Resolve user-facing display name for a deployment. Uses modelName (unique) as key. */
function deploymentDisplayName(dep: Deployment): string {
  return dep.modelName ?? dep.model;
}

const headerStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 4,
};

const STEPS = ['Basics', 'Deployments', 'Strategy', 'Review'];

// --- main component ---

export default function ComboBuilder({ existingCombo, providers, availableModels, onSave, onCancel }: ComboBuilderProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(existingCombo?.name ?? '');
  const [deployments, setDeployments] = useState<Deployment[]>(existingCombo?.deployments ?? []);
  const [strategy, setStrategy] = useState<RoutingStrategy | ''>(existingCombo?.strategy ?? '');
  const [apiType, setApiType] = useState<'openai' | 'anthropic'>(existingCombo?.apiType ?? 'openai');
  const [saving, setSaving] = useState(false);

  const handleWeightChange = (idx: number, weight: number) => {
    setDeployments((prev) => prev.map((d, i) => (i === idx ? { ...d, weight } : d)));
  };

  const handleReorder = (from: number, to: number) => {
    setDeployments((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const canProceed = (): boolean => {
    if (step === 0) return /^[a-z0-9_-]+$/.test(name) && name.length > 0;
    if (step === 1) return deployments.length > 0;
    if (step === 2) return strategy !== '';
    return true;
  };

  const handleSubmit = async () => {
    if (!strategy) return;
    setSaving(true);
    try {
      const config: ComboConfig = { name, strategy, deployments, apiType };
      const payloads = composeCombo(config);
      await onSave(payloads);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '24px 28px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>
          {existingCombo ? 'Edit Combo' : 'New Combo'}
        </div>
        <AppButton variant="text" onClick={onCancel} style={{ color: 'var(--text-muted)' }}>
          Cancel
        </AppButton>
      </div>

      <StepIndicator steps={STEPS} current={step} onStep={setStep} />

      <div style={{ minHeight: 220 }}>
        {step === 0 && <StepBasics name={name} onChange={setName} />}
        {step === 1 && (
          <StepDeployments
            deployments={deployments}
            availableModels={availableModels}
            apiType={apiType}
            onApiTypeChange={(t) => { setApiType(t); setDeployments([]); }}
            onChange={setDeployments}
          />
        )}
        {step === 2 && (
          <StepStrategy
            strategy={strategy}
            deployments={deployments}
            availableModels={availableModels}
            onChange={setStrategy}
            onWeightChange={handleWeightChange}
            onReorder={handleReorder}
          />
        )}
        {step === 3 && (
          <StepReview
            name={name}
            deployments={deployments}
            strategy={strategy}
            availableModels={availableModels}
            saving={saving}
            onSubmit={handleSubmit}
          />
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        <AppButton
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          variant="text"
        >
          Back
        </AppButton>
        {step < STEPS.length - 1 && (
          <AppButton
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={!canProceed()}
          >
            Next
          </AppButton>
        )}
      </div>
    </div>
  );
}
