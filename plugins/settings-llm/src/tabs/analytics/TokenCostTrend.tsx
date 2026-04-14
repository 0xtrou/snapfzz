// TokenCostTrend — bar chart (stacked input/output tokens) with SVG cost polyline overlay.
// Pure CSS + SVG, no external chart libraries.

import { useMemo, useRef, useState, useEffect } from 'react';
import { formatTokens, formatCost } from './shared';

export interface DailyTrend {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface TokenCostTrendProps {
  data: DailyTrend[];
}

const CHART_HEIGHT = 160; // px — bar area height
const Y_AXIS_WIDTH = 48;
const Y_AXIS_RIGHT_WIDTH = 56;
const AXIS_LABEL_HEIGHT = 28;
const Y_TICK_COUNT = 4;

export default function TokenCostTrend({ data }: TokenCostTrendProps) {
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

  const maxTokens = useMemo(
    () => Math.max(...data.map((d) => d.inputTokens + d.outputTokens), 1),
    [data],
  );
  const maxCost = useMemo(() => Math.max(...data.map((d) => d.cost), 0.0001), [data]);

  // Inner chart width (between axes)
  const innerWidth = containerWidth - Y_AXIS_WIDTH - Y_AXIS_RIGHT_WIDTH;
  const barAreaWidth = Math.max(innerWidth, 80);

  const BAR_GAP_RATIO = 0.3; // gap as fraction of slot
  const slotWidth = barAreaWidth / Math.max(data.length, 1);
  const barWidth = slotWidth * (1 - BAR_GAP_RATIO);
  const barOffset = (slotWidth - barWidth) / 2;

  // Cost polyline points — mapped to the same coordinate space as bars
  const costPoints = useMemo(
    () =>
      data
        .map((d, i) => {
          const x = i * slotWidth + slotWidth / 2;
          const y = CHART_HEIGHT - (d.cost / maxCost) * CHART_HEIGHT;
          return `${x},${y}`;
        })
        .join(' '),
    [data, slotWidth, maxCost],
  );

  // Y-axis token ticks
  const tokenTicks = Array.from({ length: Y_TICK_COUNT + 1 }, (_, i) =>
    Math.round((maxTokens / Y_TICK_COUNT) * (Y_TICK_COUNT - i)),
  );

  // Y-axis cost ticks (right side)
  const costTicks = Array.from({ length: Y_TICK_COUNT + 1 }, (_, i) =>
    (maxCost / Y_TICK_COUNT) * (Y_TICK_COUNT - i),
  );

  if (data.length === 0) {
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
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 12,
          }}
        >
          Token &amp; Cost Trend
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
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 12,
        }}
      >
        Token &amp; Cost Trend
      </div>
    <div ref={containerRef} style={{ width: '100%' }}>
      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 8,
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
          paddingLeft: Y_AXIS_WIDTH,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-success)', display: 'inline-block' }}
          />
          Input tokens
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-cyan)', display: 'inline-block' }}
          />
          Output tokens
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              width: 16,
              height: 2,
              background: 'var(--color-gold)',
              display: 'inline-block',
              borderRadius: 1,
            }}
          />
          Cost
        </span>
      </div>

      {/* Chart row: left y-axis + bars+SVG + right y-axis */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {/* Left Y-axis — token scale */}
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

        {/* Bar + SVG overlay area */}
        <div style={{ flex: 1, position: 'relative', height: CHART_HEIGHT + AXIS_LABEL_HEIGHT, minWidth: 0 }}>
          {/* Grid lines */}
          <svg
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: CHART_HEIGHT, pointerEvents: 'none' }}
            viewBox={`0 0 ${barAreaWidth} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
          >
            {tokenTicks.map((_, i) => {
              const y = (i / Y_TICK_COUNT) * CHART_HEIGHT;
              return (
                <line
                  key={i}
                  x1={0}
                  y1={y}
                  x2={barAreaWidth}
                  y2={y}
                  stroke="var(--border-default)"
                  strokeWidth={0.5}
                  strokeDasharray="3,3"
                />
              );
            })}
          </svg>

          {/* Bars */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: CHART_HEIGHT,
              display: 'flex',
              alignItems: 'flex-end',
            }}
          >
            {data.map((d, i) => {
              const total = d.inputTokens + d.outputTokens;
              const totalH = (total / maxTokens) * CHART_HEIGHT;
              const inputH = total > 0 ? (d.inputTokens / total) * totalH : 0;
              const outputH = totalH - inputH;
              return (
                <div
                  key={d.date}
                  title={`${d.date}\nInput: ${formatTokens(d.inputTokens)}\nOutput: ${formatTokens(d.outputTokens)}\nCost: ${formatCost(d.cost)}`}
                  style={{
                    width: slotWidth,
                    flexShrink: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-end',
                    height: CHART_HEIGHT,
                  }}
                >
                  <div
                    style={{
                      width: barWidth,
                      height: totalH,
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: '2px 2px 0 0',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Output tokens — top (cyan) */}
                    <div
                      style={{
                        height: outputH,
                        background: 'var(--color-cyan)',
                        opacity: 0.85,
                        flexShrink: 0,
                      }}
                    />
                    {/* Input tokens — bottom (green) */}
                    <div
                      style={{
                        height: inputH,
                        background: 'var(--color-success)',
                        opacity: 0.85,
                        flexShrink: 0,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cost line SVG — overlaid */}
          <svg
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: CHART_HEIGHT, pointerEvents: 'none' }}
            viewBox={`0 0 ${barAreaWidth} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
          >
            <polyline
              points={costPoints}
              fill="none"
              stroke="var(--color-gold)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {data.map((d, i) => {
              const cx = i * slotWidth + slotWidth / 2;
              const cy = CHART_HEIGHT - (d.cost / maxCost) * CHART_HEIGHT;
              return (
                <circle key={d.date} cx={cx} cy={cy} r={3} fill="var(--color-gold)" />
              );
            })}
          </svg>

          {/* X-axis labels */}
          <div
            style={{
              position: 'absolute',
              top: CHART_HEIGHT,
              left: 0,
              width: '100%',
              height: AXIS_LABEL_HEIGHT,
              display: 'flex',
            }}
          >
            {data.map((d, i) => {
              // Show at most ~7 labels to avoid crowding
              const step = Math.max(1, Math.ceil(data.length / 7));
              const show = i % step === 0 || i === data.length - 1;
              const label = d.date.slice(5); // MM-DD
              return (
                <div
                  key={d.date}
                  style={{
                    width: slotWidth,
                    flexShrink: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    paddingTop: 4,
                    overflow: 'visible',
                  }}
                >
                  {show && (
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Y-axis — cost scale */}
        <div
          style={{
            width: Y_AXIS_RIGHT_WIDTH,
            height: CHART_HEIGHT,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            paddingLeft: 6,
            flexShrink: 0,
          }}
        >
          {costTicks.map((v, i) => (
            <span
              key={i}
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-gold)',
                lineHeight: 1,
              }}
            >
              {formatCost(v)}
            </span>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
}
