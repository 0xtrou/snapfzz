import { useMemo } from 'react';
import { formatTokens, SHARE_COLORS } from './shared';

export interface DonutEntry {
  label: string;
  value: number;
}

export interface BreakdownDonutProps {
  title: string;
  entries: DonutEntry[];
}

const SIZE = 120;
const RADIUS = 46;
const STROKE = 14;
const CENTER = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface DonutSlice {
  color: string;
  dashArray: string;
  dashOffset: number;
  rotation: number;
}

function buildSlices(entries: DonutEntry[]): DonutSlice[] {
  const total = entries.reduce((acc, e) => acc + e.value, 0);
  if (total === 0) return [];

  const slices: DonutSlice[] = [];
  let cumulativeAngle = 0;

  for (let i = 0; i < entries.length; i++) {
    const fraction = entries[i].value / total;
    const arcLength = fraction * CIRCUMFERENCE;
    // 1px gap between slices
    const gap = entries.length > 1 ? 1 : 0;
    const visibleArc = Math.max(0, arcLength - gap);

    slices.push({
      color: SHARE_COLORS[i % SHARE_COLORS.length],
      dashArray: `${visibleArc} ${CIRCUMFERENCE - visibleArc}`,
      dashOffset: -(cumulativeAngle * CIRCUMFERENCE) + CIRCUMFERENCE / 4,
      rotation: 0,
    });

    cumulativeAngle += fraction;
  }

  return slices;
}

function DonutSvg({ entries }: { entries: DonutEntry[] }) {
  const slices = useMemo(() => buildSlices(entries), [entries]);
  const total = entries.reduce((acc, e) => acc + e.value, 0);

  if (total === 0) {
    return (
      <svg width={SIZE} height={SIZE} style={{ flexShrink: 0 }}>
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--bg-subtle)"
          strokeWidth={STROKE}
        />
        <text
          x={CENTER}
          y={CENTER}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text-muted)"
          fontSize={10}
        >
          No data
        </text>
      </svg>
    );
  }

  return (
    <svg width={SIZE} height={SIZE} style={{ flexShrink: 0 }}>
      {/* Background track */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke="var(--bg-subtle)"
        strokeWidth={STROKE}
      />
      {/* Slices */}
      {slices.map((s, i) => (
        <circle
          key={i}
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke={s.color}
          strokeWidth={STROKE}
          strokeDasharray={s.dashArray}
          strokeDashoffset={s.dashOffset}
          style={{ transition: 'stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease' }}
        />
      ))}
      {/* Center label */}
      <text
        x={CENTER}
        y={CENTER - 6}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--text-primary)"
        fontSize={13}
        fontWeight={700}
        fontFamily="var(--font-mono)"
      >
        {formatTokens(total)}
      </text>
      <text
        x={CENTER}
        y={CENTER + 9}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--text-muted)"
        fontSize={9}
      >
        total
      </text>
    </svg>
  );
}

export function BreakdownDonut({ title, entries }: BreakdownDonutProps) {
  const total = entries.reduce((acc, e) => acc + e.value, 0);

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
      {/* Title */}
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'none',
          letterSpacing: 0.5,
          marginBottom: 16,
        }}
      >
        {title}
      </div>

      {/* Content: donut + legend */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <DonutSvg entries={entries} />

        {/* Legend */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.length === 0 ? (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No entries</span>
          ) : (
            entries.slice(0, 10).map((entry, i) => {
              const color = SHARE_COLORS[i % SHARE_COLORS.length];
              const pct = total > 0 ? (entry.value / total) * 100 : 0;
              return (
                <div
                  key={entry.label}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
                >
                  {/* Colored dot */}
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  {/* Label */}
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {entry.label}
                  </span>
                  {/* Value */}
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    {formatTokens(entry.value)}
                  </span>
                  {/* Percent */}
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      minWidth: 36,
                      textAlign: 'right',
                    }}
                  >
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
