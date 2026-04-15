import { Statistic } from 'antd';
import { formatTokens, formatCost } from './shared';

export interface OverviewCardsProps {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalSpend: number;
  requestCount: number;
}

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  valueColor?: string;
}

function StatCard({ label, value, subtitle, valueColor }: StatCardProps) {
  return (
    <div
      style={{
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '16px 20px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'none',
          
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <Statistic
        value={value}
        valueStyle={{
          fontSize: 24,
          fontWeight: 700,
          color: valueColor ?? 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
        }}
      />
      {subtitle && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

export function OverviewCards({
  totalTokens,
  inputTokens,
  outputTokens,
  totalSpend,
  requestCount,
}: OverviewCardsProps) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <StatCard
        label="TOTAL TOKENS"
        value={formatTokens(totalTokens)}
        subtitle={`${requestCount} requests`}
      />
      <StatCard
        label="INPUT TOKENS"
        value={formatTokens(inputTokens)}
        valueColor="var(--color-success)"
      />
      <StatCard
        label="OUTPUT TOKENS"
        value={formatTokens(outputTokens)}
        valueColor="var(--color-cyan)"
      />
      <StatCard
        label="EST. COST"
        value={formatCost(totalSpend)}
        valueColor="var(--color-gold)"
      />
    </div>
  );
}
