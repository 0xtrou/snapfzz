// DonutChart — reusable SVG donut chart with legend.
// Pure SVG using stroke-dasharray segments, no external chart libraries.

import { useMemo } from 'react';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  title: string;
  slices: DonutSlice[];
  totalLabel?: string;
}

const RADIUS = 52;
const STROKE_WIDTH = 18;
const SVG_SIZE = (RADIUS + STROKE_WIDTH / 2 + 4) * 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SVG_SIZE / 2;

// Gap between slices in SVG units (as fraction of circumference)
const SLICE_GAP = 2; // px gap on circumference

export default function DonutChart({ title, slices, totalLabel }: DonutChartProps) {
  const total = useMemo(() => slices.reduce((sum, s) => sum + s.value, 0), [slices]);

  // Compute each slice's dasharray + dashoffset
  const segments = useMemo(() => {
    if (total === 0) return [];
    let offset = 0; // starts at top (we'll rotate via transform)
    return slices.map((slice) => {
      const fraction = slice.value / total;
      const arcLength = fraction * CIRCUMFERENCE;
      // Subtract gap from arc so adjacent slices have a visual gap
      const visibleArc = Math.max(arcLength - SLICE_GAP, 0);
      const dasharray = `${visibleArc} ${CIRCUMFERENCE - visibleArc}`;
      const dashoffset = -offset;
      offset += arcLength;
      return { ...slice, dasharray, dashoffset, fraction };
    });
  }, [slices, total]);

  // Empty state — single grey circle
  const isEmpty = total === 0 || slices.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Title */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: 'var(--text-muted)',
        }}
      >
        {title}
      </div>

      {/* Chart + legend row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        {/* SVG donut */}
        <svg
          width={SVG_SIZE}
          height={SVG_SIZE}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          style={{ flexShrink: 0 }}
          aria-label={title}
        >
          {/* Rotate so first slice starts at 12 o'clock */}
          <g transform={`rotate(-90, ${CENTER}, ${CENTER})`}>
            {isEmpty ? (
              <circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke="var(--border-default)"
                strokeWidth={STROKE_WIDTH}
              />
            ) : (
              segments.map((seg, i) => (
                <circle
                  key={i}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={STROKE_WIDTH}
                  strokeDasharray={seg.dasharray}
                  strokeDashoffset={seg.dashoffset}
                  strokeLinecap="butt"
                >
                  <title>{`${seg.label}: ${seg.value.toLocaleString()} (${(seg.fraction * 100).toFixed(1)}%)`}</title>
                </circle>
              ))
            )}
          </g>

          {/* Center text */}
          {totalLabel && (
            <>
              <text
                x={CENTER}
                y={CENTER - 4}
                textAnchor="middle"
                dominantBaseline="auto"
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  fill: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {totalLabel}
              </text>
              <text
                x={CENTER}
                y={CENTER + 14}
                textAnchor="middle"
                dominantBaseline="auto"
                style={{
                  fontSize: 10,
                  fill: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                total
              </text>
            </>
          )}
          {!totalLabel && !isEmpty && (
            <text
              x={CENTER}
              y={CENTER}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: 11,
                fill: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {slices.length} items
            </text>
          )}
        </svg>

        {/* Legend */}
        {slices.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
            {slices.map((slice, i) => {
              const pct = total > 0 ? (slice.value / total) * 100 : 0;
              return (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
                >
                  {/* Color dot */}
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: slice.color,
                      flexShrink: 0,
                    }}
                  />
                  {/* Label */}
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={slice.label}
                  >
                    {slice.label}
                  </span>
                  {/* Value + percent */}
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)',
                      flexShrink: 0,
                      marginLeft: 4,
                    }}
                  >
                    {slice.value.toLocaleString()}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      width: 38,
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {isEmpty && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No data</span>
        )}
      </div>
    </div>
  );
}
