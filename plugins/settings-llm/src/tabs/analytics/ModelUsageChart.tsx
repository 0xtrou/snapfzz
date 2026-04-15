// ModelUsageChart — stacked area chart showing per-model token usage over time.
// Pure SVG using <path> elements, no external chart libraries.

import { useMemo, useRef, useState, useEffect } from 'react';
import { formatTokens, SHARE_COLORS } from './shared';

export interface ModelDailyUsage {
  date: string;
  models: Record<string, number>; // model name → token count
}

export interface ModelUsageChartProps {
  data: ModelDailyUsage[];
}

const CHART_HEIGHT = 160;
const Y_AXIS_WIDTH = 52;
const AXIS_LABEL_HEIGHT = 28;
const Y_TICK_COUNT = 4;

// Build a smooth-ish area path from a series of (x, y) points.
// Uses straight line segments (polyline-style path) — clean and predictable.
function buildAreaPath(
  points: { x: number; y: number }[],
  bottomY: number,
): string {
  if (points.length === 0) return '';
  const top = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const bottom = [...points]
    .reverse()
    .map((p) => `L${p.x},${bottomY}`)
    .join(' ');
  return `${top} ${bottom} Z`;
}

export default function ModelUsageChart({ data }: ModelUsageChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Collect all unique model names, sorted by total usage descending
  const models = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const day of data) {
      for (const [model, count] of Object.entries(day.models)) {
        totals[model] = (totals[model] ?? 0) + count;
      }
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [data]);

  const innerWidth = Math.max(containerWidth - Y_AXIS_WIDTH, 80);
  const stackedModels = useMemo(() => [...models].reverse(), [models]);

  // Pad data: if only 1 day, add a zero-value day before so areas have width
  const paddedData = useMemo(() => {
    if (data.length <= 1 && data.length > 0) {
      const d = new Date(data[0].date);
      d.setDate(d.getDate() - 1);
      const zeroed: Record<string, number> = {};
      for (const key of Object.keys(data[0].models)) zeroed[key] = 0;
      return [{ date: d.toISOString().slice(0, 10), models: zeroed }, ...data];
    }
    return data;
  }, [data]);

  // Max stacked total across all days
  const maxTotal = useMemo(() => {
    const daily = paddedData.map((d) =>
      Object.values(d.models).reduce((s, v) => s + v, 0),
    );
    return Math.max(...daily, 1);
  }, [paddedData]);

  // paths[i] = SVG path string for stackedModels[i]
  const paths = useMemo(() => {
    if (paddedData.length === 0) return [];

    const n = paddedData.length;
    const xStep = innerWidth / Math.max(n - 1, 1);

    return stackedModels.map((model, stackIdx) => {
      const topPoints: { x: number; y: number }[] = [];
      const bottomPoints: { x: number; y: number }[] = [];

      for (let di = 0; di < n; di++) {
        const x = di * xStep;
        // Sum all models below this one in the stack
        let cumulativeBelow = 0;
        for (let si = 0; si < stackIdx; si++) {
          cumulativeBelow += paddedData[di].models[stackedModels[si]] ?? 0;
        }
        const thisValue = paddedData[di].models[model] ?? 0;
        const cumulativeTop = cumulativeBelow + thisValue;

        const yBottom = CHART_HEIGHT - (cumulativeBelow / maxTotal) * CHART_HEIGHT;
        const yTop = CHART_HEIGHT - (cumulativeTop / maxTotal) * CHART_HEIGHT;

        topPoints.push({ x, y: yTop });
        bottomPoints.push({ x, y: yBottom });
      }

      // Build closed path: top line left→right, bottom line right→left
      const topPath = topPoints
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
        .join(' ');
      const bottomPath = [...bottomPoints]
        .reverse()
        .map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`)
        .join(' ');

      return `${topPath} ${bottomPath} Z`;
    });
  }, [paddedData, stackedModels, maxTotal, innerWidth]);

  // Y-axis ticks
  const tokenTicks = Array.from({ length: Y_TICK_COUNT + 1 }, (_, i) =>
    Math.round((maxTotal / Y_TICK_COUNT) * (Y_TICK_COUNT - i)),
  );

  // X-axis date labels
  const dateLabels = useMemo(() => {
    if (paddedData.length === 0) return [];
    const n = paddedData.length;
    const xStep = innerWidth / Math.max(n - 1, 1);
    const step = Math.max(1, Math.ceil(n / 7));
    return paddedData
      .map((d, i) => ({ label: d.date.slice(5), x: i * xStep, show: i % step === 0 || i === n - 1 }))
      .filter((l) => l.show);
  }, [paddedData, innerWidth]);

  if (data.length === 0 || models.length === 0) {
    return (
      <div
        style={{
          background: 'var(--bg-default)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          padding: 16,
          minHeight: 200,
        }}
      >
        <div
          style={{
            color: 'var(--text-primary)',
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'none',
            
            marginBottom: 12,
          }}
        >
          Model Usage Over Time
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 160,
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
        >
          No data available
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div
        style={{
          color: 'var(--text-primary)',
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'none',
          
          marginBottom: 12,
        }}
      >
        Model Usage Over Time
      </div>
    <div ref={containerRef} style={{ width: '100%' }}>
      {/* Chart row */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {/* Left Y-axis */}
        <div
          style={{
            width: Y_AXIS_WIDTH,
            height: CHART_HEIGHT,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingRight: 6,
            flexShrink: 0,
          }}
        >
          {tokenTicks.map((v, i) => (
            <span
              key={i}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                lineHeight: 1,
              }}
            >
              {formatTokens(v)}
            </span>
          ))}
        </div>

        {/* SVG area */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <svg
            width="100%"
            height={CHART_HEIGHT + AXIS_LABEL_HEIGHT}
            viewBox={`0 0 ${innerWidth} ${CHART_HEIGHT + AXIS_LABEL_HEIGHT}`}
            preserveAspectRatio="none"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {/* Grid lines */}
            {tokenTicks.map((_, i) => {
              const y = (i / Y_TICK_COUNT) * CHART_HEIGHT;
              return (
                <line
                  key={i}
                  x1={0}
                  y1={y}
                  x2={innerWidth}
                  y2={y}
                  stroke="var(--border-default)"
                  strokeWidth={0.5}
                  strokeDasharray="3,3"
                />
              );
            })}

            {/* Stacked area paths */}
            {paths.map((d, i) => {
              // stackedModels[i] maps to SHARE_COLORS by position in original `models` array
              const modelName = stackedModels[i];
              const colorIdx = models.indexOf(modelName);
              return (
                <path
                  key={modelName}
                  d={d}
                  fill={SHARE_COLORS[colorIdx % SHARE_COLORS.length]}
                  fillOpacity={0.75}
                  stroke={SHARE_COLORS[colorIdx % SHARE_COLORS.length]}
                  strokeWidth={1}
                  strokeOpacity={0.9}
                >
                  <title>{modelName}</title>
                </path>
              );
            })}

            {/* X-axis baseline */}
            <line
              x1={0}
              y1={CHART_HEIGHT}
              x2={innerWidth}
              y2={CHART_HEIGHT}
              stroke="var(--border-default)"
              strokeWidth={1}
            />

            {/* X-axis labels */}
            {dateLabels.map(({ label, x }) => (
              <text
                key={label + x}
                x={x}
                y={CHART_HEIGHT + 16}
                textAnchor="middle"
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  fill: 'var(--text-muted)',
                }}
              >
                {label}
              </text>
            ))}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 16px',
          marginTop: 8,
          paddingLeft: Y_AXIS_WIDTH,
        }}
      >
        {models.slice(0, 10).map((model, i) => (
          <span
            key={model}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: SHARE_COLORS[i % SHARE_COLORS.length],
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span
              style={{ fontFamily: 'var(--font-mono)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={model}
            >
              {model}
            </span>
          </span>
        ))}
      </div>
    </div>
    </div>
  );
}
