import { formatTokens, formatCost, formatPercent } from './shared';

export interface MetricRowsProps {
  infrastructure: {
    accounts: number;
    providers: number;
    apiKeys: number;
    models: number;
  };
  performance: {
    avgTokensPerReq: number;
    costPerReq: number;
    ioRatio: number;
    fallbackRate: number;
  };
  highlights: {
    topModel: string;
    topProvider: string;
    busiestDay: string;
    diversity: number;
  };
}

// -- Primitives --

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        color: 'var(--text-primary)',
        fontSize: 13,
        fontWeight: 700,
        textTransform: 'none',
        letterSpacing: 0.5,
        marginBottom: 8,
        paddingBottom: 4,
        borderBottom: '1px solid var(--border-default)',
      }}
    >
      {title}
    </div>
  );
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'none',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: 'var(--text-primary)',
          fontSize: 14,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '12px 16px',
};

// -- Main component --

export function MetricRows({ infrastructure, performance, highlights }: MetricRowsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Infrastructure row */}
      <div>
        <SectionHeader title="Infrastructure" />
        <div style={gridStyle}>
          <MetricItem label="Accounts" value={String(infrastructure.accounts)} />
          <MetricItem label="Providers" value={String(infrastructure.providers)} />
          <MetricItem label="API Keys" value={String(infrastructure.apiKeys)} />
          <MetricItem label="Models" value={String(infrastructure.models)} />
        </div>
      </div>

      {/* Performance row */}
      <div>
        <SectionHeader title="Performance" />
        <div style={gridStyle}>
          <MetricItem
            label="Avg Tokens/Req"
            value={formatTokens(performance.avgTokensPerReq)}
          />
          <MetricItem
            label="Cost/Req"
            value={formatCost(performance.costPerReq)}
          />
          <MetricItem
            label="I/O Ratio"
            value={performance.ioRatio.toFixed(2)}
          />
          <MetricItem
            label="Fallback Rate"
            value={formatPercent(performance.fallbackRate)}
          />
        </div>
      </div>

      {/* Highlights row */}
      <div>
        <SectionHeader title="Highlights" />
        <div style={gridStyle}>
          <MetricItem label="Top Model" value={highlights.topModel || '—'} />
          <MetricItem label="Top Provider" value={highlights.topProvider || '—'} />
          <MetricItem label="Busiest Day" value={highlights.busiestDay || '—'} />
          <MetricItem label="Diversity" value={formatPercent(highlights.diversity)} />
        </div>
      </div>
    </div>
  );
}
