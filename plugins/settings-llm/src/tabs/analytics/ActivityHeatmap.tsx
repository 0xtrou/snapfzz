// A013/Analytics: GitHub-style activity heatmap — daily request/token volume over the past year.
// Pure CSS grid, no chart library. Color scale uses CSS variables only.

import { useMemo } from 'react';
import { formatTokens } from './shared';

export interface DailyData {
  date: string;    // YYYY-MM-DD
  tokens: number;
  requests: number;
}

export interface ActivityHeatmapProps {
  dailyData: DailyData[];
}

// -- Constants --

const WEEKS = 52;
const DAYS_PER_WEEK = 7;
const CELL_SIZE = 12;
const CELL_GAP = 2;

// row index: 0 = Sunday, 1 = Monday, ... 6 = Saturday (JS getDay())
// We display Sunday last (row 6 in CSS grid), Mon–Sat as rows 0–5.
// Grid row = (getDay() + 6) % 7  → Mon=0, Tue=1, ..., Sun=6
function dayOfWeekRow(date: Date): number {
  return (date.getDay() + 6) % 7;
}

// -- Color helpers --

function cellColor(requests: number, p25: number, p75: number): string {
  if (requests === 0) return 'var(--bg-subtle)';
  if (requests < p25) return 'color-mix(in srgb, var(--color-success) 20%, transparent)';
  if (requests < p75) return 'color-mix(in srgb, var(--color-success) 50%, transparent)';
  return 'var(--color-success)';
}

function weeklyBarColor(requests: number, maxWeekly: number): string {
  if (maxWeekly === 0 || requests === 0) return 'var(--bg-subtle)';
  const ratio = requests / maxWeekly;
  if (ratio < 0.25) return 'color-mix(in srgb, var(--color-success) 20%, transparent)';
  if (ratio < 0.75) return 'color-mix(in srgb, var(--color-success) 50%, transparent)';
  return 'var(--color-success)';
}

// -- Data helpers --

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

function buildGrid(dailyData: DailyData[]): {
  cells: Array<{ col: number; row: number; date: string; tokens: number; requests: number }>;
  dataByDate: Map<string, DailyData>;
  p25: number;
  p75: number;
  activeDays: number;
  totalTokens: number;
  weeklyRequests: number[];
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Anchor: start from the most recent Sunday such that we get WEEKS full weeks ending today.
  // Column 0 = oldest week, column WEEKS-1 = most recent week.
  const gridEnd = new Date(today);
  // Advance to the coming Saturday so the last column is always full.
  const daysToSat = (6 - gridEnd.getDay() + 7) % 7;
  gridEnd.setDate(gridEnd.getDate() + daysToSat);

  const gridStart = new Date(gridEnd);
  gridStart.setDate(gridEnd.getDate() - WEEKS * DAYS_PER_WEEK + 1);

  const dataByDate = new Map<string, DailyData>(dailyData.map((d) => [d.date, d]));

  // Compute percentiles from non-zero request values.
  const nonZeroRequests = dailyData
    .filter((d) => d.requests > 0)
    .map((d) => d.requests)
    .sort((a, b) => a - b);
  const p25 = percentile(nonZeroRequests, 25);
  const p75 = percentile(nonZeroRequests, 75);

  const cells: Array<{ col: number; row: number; date: string; tokens: number; requests: number }> = [];
  const weeklyRequests: number[] = new Array(WEEKS).fill(0);

  let activeDays = 0;
  let totalTokens = 0;

  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const entry = dataByDate.get(dateStr);
    const tokens = entry?.tokens ?? 0;
    const requests = entry?.requests ?? 0;

    const daysSinceStart = Math.round((cursor.getTime() - gridStart.getTime()) / 86400000);
    const col = Math.floor(daysSinceStart / DAYS_PER_WEEK);
    const row = dayOfWeekRow(cursor);

    if (col >= 0 && col < WEEKS) {
      cells.push({ col, row, date: dateStr, tokens, requests });
      weeklyRequests[col] += requests;
      if (requests > 0) activeDays++;
      totalTokens += tokens;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return { cells, dataByDate, p25, p75, activeDays, totalTokens, weeklyRequests };
}

function findMostActiveDay(dailyData: DailyData[]): DailyData | null {
  if (dailyData.length === 0) return null;
  return dailyData.reduce((best, d) => (d.tokens > best.tokens ? d : best), dailyData[0]);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDayName(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

// -- Sub-components --

function HeatmapGrid({
  cells,
  p25,
  p75,
}: {
  cells: Array<{ col: number; row: number; date: string; tokens: number; requests: number }>;
  p25: number;
  p75: number;
}) {
  const gridWidth = WEEKS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  const gridHeight = DAYS_PER_WEEK * (CELL_SIZE + CELL_GAP) - CELL_GAP;

  return (
    <div
      style={{
        position: 'relative',
        width: gridWidth,
        height: gridHeight,
        flexShrink: 0,
      }}
    >
      {cells.map(({ col, row, date, tokens, requests }) => {
        const x = col * (CELL_SIZE + CELL_GAP);
        const y = row * (CELL_SIZE + CELL_GAP);
        const bg = cellColor(requests, p25, p75);
        const label = requests > 0
          ? `${date}: ${requests} request${requests !== 1 ? 's' : ''}, ${formatTokens(tokens)} tokens`
          : date;
        return (
          <div
            key={date + '-' + col + '-' + row}
            title={label}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: CELL_SIZE,
              height: CELL_SIZE,
              borderRadius: 2,
              background: bg,
              cursor: requests > 0 ? 'default' : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

function DayLabels() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: DAYS_PER_WEEK * (CELL_SIZE + CELL_GAP) - CELL_GAP,
        paddingRight: 6,
        flexShrink: 0,
      }}
    >
      {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map((label, i) => {
        const show = label === 'Mon' || label === 'Wed' || label === 'Fri' || label === 'Sun';
        return (
          <div
            key={label}
            style={{
              height: CELL_SIZE,
              lineHeight: `${CELL_SIZE}px`,
              fontSize: 10,
              color: show ? 'var(--text-muted)' : 'transparent',
              fontFamily: 'var(--font-mono)',
              textAlign: 'right',
              userSelect: 'none',
            }}
          >
            {show ? label : '\u00a0'}
          </div>
        );
      })}
    </div>
  );
}

function WeeklySummaryBar({ weeklyRequests }: { weeklyRequests: number[] }) {
  const maxWeekly = Math.max(...weeklyRequests, 1);
  const barW = CELL_SIZE;
  const barMaxH = 24;

  return (
    <div
      style={{
        display: 'flex',
        gap: CELL_GAP,
        alignItems: 'flex-end',
        marginTop: 4,
      }}
    >
      {weeklyRequests.map((req, i) => {
        const h = req > 0 ? Math.max(3, Math.round((req / maxWeekly) * barMaxH)) : 2;
        return (
          <div
            key={i}
            title={`Week ${i + 1}: ${req} requests`}
            style={{
              width: barW,
              height: h,
              borderRadius: 1,
              background: weeklyBarColor(req, maxWeekly),
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}

function MostActiveDayCard({
  day,
  weeklyRequests,
  p25,
  p75,
}: {
  day: DailyData;
  weeklyRequests: number[];
  p25: number;
  p75: number;
}) {
  const maxWeekly = Math.max(...weeklyRequests, 1);

  return (
    <div
      style={{
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 180,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          color: 'var(--text-primary)',
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 0,
        }}
      >
        Most Active Day
      </div>
      <div>
        <div
          style={{
            color: 'var(--text-primary)',
            fontSize: 14,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {getDayName(day.date)}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
          {formatDate(day.date)}
        </div>
        <div
          style={{
            color: 'var(--color-success)',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'var(--font-mono)',
            marginTop: 4,
          }}
        >
          {formatTokens(day.tokens)} tokens
        </div>
      </div>
      {/* Weekly breakdown bars */}
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 20 }}>
        {weeklyRequests.map((req, i) => {
          const h = req > 0 ? Math.max(2, Math.round((req / maxWeekly) * 18)) : 2;
          return (
            <div
              key={i}
              title={`Week ${i + 1}: ${req} req`}
              style={{
                flex: 1,
                height: h,
                borderRadius: 1,
                background: weeklyBarColor(req, maxWeekly),
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// -- Weekly card sub-component --

function WeeklyCard({ weeklyRequests }: { weeklyRequests: number[] }) {
  const maxWeekly = Math.max(...weeklyRequests, 1);
  // Show the last 7 days of the week (last 7 columns map to Sun-Sat)
  // We display a simplified 7-square row for the current week
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // Use last 7 weekly bucket values as a proxy for the weekly pattern
  const last7 = weeklyRequests.slice(-7);

  return (
    <div
      style={{
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          color: 'var(--text-primary)',
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 0,
        }}
      >
        Weekly
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {last7.map((req, i) => {
          const bg = weeklyBarColor(req, maxWeekly);
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                title={`${DAY_LABELS[i]}: ${req} requests`}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: bg,
                }}
              />
              <span
                style={{
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  textAlign: 'center',
                }}
              >
                {DAY_LABELS[i]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- Main component --

export default function ActivityHeatmap({ dailyData }: ActivityHeatmapProps) {
  const { cells, p25, p75, activeDays, totalTokens, weeklyRequests } = useMemo(
    () => buildGrid(dailyData),
    [dailyData],
  );

  const mostActiveDay = useMemo(() => findMostActiveDay(dailyData.filter((d) => d.tokens > 0)), [dailyData]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 12, alignItems: 'start' }}>
      {/* LEFT: Main heatmap card */}
      <div
        style={{
          background: 'var(--bg-default)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Section header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Activity
          </span>
          <span
            style={{
              color: 'var(--text-secondary)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {activeDays} active days · {formatTokens(totalTokens)} tokens · {WEEKS * DAYS_PER_WEEK} days
          </span>
        </div>

        {/* Day labels + grid */}
        <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto' }}>
          <DayLabels />
          <HeatmapGrid cells={cells} p25={p25} p75={p75} />
        </div>

        {/* Color scale legend */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>Less</span>
          {[
            'var(--bg-subtle)',
            'color-mix(in srgb, var(--color-success) 20%, transparent)',
            'color-mix(in srgb, var(--color-success) 50%, transparent)',
            'var(--color-success)',
          ].map((bg, i) => (
            <div
              key={i}
              style={{ width: 12, height: 12, borderRadius: 2, background: bg }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* RIGHT: Two stacked cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Most Active Day card */}
        {mostActiveDay ? (
          <MostActiveDayCard
            day={mostActiveDay}
            weeklyRequests={weeklyRequests}
            p25={p25}
            p75={p75}
          />
        ) : (
          <div
            style={{
              background: 'var(--bg-default)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                color: 'var(--text-primary)',
                fontSize: 13,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Most Active Day
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No data</span>
          </div>
        )}

        {/* Weekly card */}
        <WeeklyCard weeklyRequests={weeklyRequests} />
      </div>
    </div>
  );
}
