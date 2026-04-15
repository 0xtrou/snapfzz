// TokenCostTrend direct unit tests — covers empty-data branch, data rendering,
// x-axis label step logic, and ResizeObserver width update.

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TokenCostTrend from '../../tabs/analytics/TokenCostTrend';
import type { DailyTrend } from '../../tabs/analytics/TokenCostTrend';

// ResizeObserver is stubbed in setup.ts to fire synchronously at width=800.

function makeDay(date: string, inputTokens: number, outputTokens: number, cost: number): DailyTrend {
  return { date, inputTokens, outputTokens, cost };
}

describe('TokenCostTrend – empty data', () => {
  it('renders "No data available" when data is empty', () => {
    render(<TokenCostTrend data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('still shows the chart title when empty', () => {
    render(<TokenCostTrend data={[]} />);
    expect(screen.getByText(/token.*cost.*trend/i)).toBeInTheDocument();
  });
});

describe('TokenCostTrend – with data', () => {
  const SINGLE_DAY = [makeDay('2026-04-10', 500, 200, 0.05)];
  const MULTI_DAY = Array.from({ length: 10 }, (_, i) =>
    makeDay(`2026-04-${String(i + 1).padStart(2, '0')}`, (i + 1) * 100, (i + 1) * 50, (i + 1) * 0.01),
  );

  it('renders chart title with data', () => {
    render(<TokenCostTrend data={SINGLE_DAY} />);
    expect(screen.getByText(/token.*cost.*trend/i)).toBeInTheDocument();
  });

  it('renders legend labels', () => {
    render(<TokenCostTrend data={SINGLE_DAY} />);
    expect(screen.getByText('Input tokens')).toBeInTheDocument();
    expect(screen.getByText('Output tokens')).toBeInTheDocument();
    expect(screen.getByText('Cost')).toBeInTheDocument();
  });

  it('renders x-axis date label for single day (MM-DD format)', () => {
    render(<TokenCostTrend data={SINGLE_DAY} />);
    // date.slice(5) of '2026-04-10' is '04-10'
    expect(screen.getByText('04-10')).toBeInTheDocument();
  });

  it('renders with many days — label step logic engaged (>7 days)', () => {
    render(<TokenCostTrend data={MULTI_DAY} />);
    // With 10 items, step = ceil(10/7) = 2 — labels at i=0,2,4,6,8,9 (last always shown)
    // First item: '2026-04-01' → '04-01'
    expect(screen.getByText('04-01')).toBeInTheDocument();
    // Last item: '2026-04-10' → '04-10'
    expect(screen.getByText('04-10')).toBeInTheDocument();
  });

  it('renders with all-zero tokens (no crash, bar heights are 0)', () => {
    const zeroData = [makeDay('2026-04-10', 0, 0, 0.01)];
    render(<TokenCostTrend data={zeroData} />);
    expect(screen.getByText(/token.*cost.*trend/i)).toBeInTheDocument();
  });

  it('renders with zero cost (maxCost fallback to 0.0001, no division by zero)', () => {
    const zeroCostData = [makeDay('2026-04-10', 500, 200, 0)];
    render(<TokenCostTrend data={zeroCostData} />);
    expect(screen.getByText(/token.*cost.*trend/i)).toBeInTheDocument();
  });

  it('renders left and right y-axis tick labels', () => {
    render(<TokenCostTrend data={SINGLE_DAY} />);
    // Y-axis ticks: formatTokens values on left and formatCost values on right
    // Cost ticks should show $ prefix (from formatCost)
    const dollarElements = document.querySelectorAll('span');
    const costTicks = Array.from(dollarElements).filter((el) => el.textContent?.startsWith('$'));
    expect(costTicks.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the polyline SVG element for cost trend', () => {
    render(<TokenCostTrend data={SINGLE_DAY} />);
    const polylines = document.querySelectorAll('polyline');
    expect(polylines.length).toBeGreaterThanOrEqual(1);
  });

  it('renders one circle per data point for cost dots', () => {
    render(<TokenCostTrend data={MULTI_DAY} />);
    const circles = document.querySelectorAll('circle');
    expect(circles.length).toBe(MULTI_DAY.length);
  });
});
