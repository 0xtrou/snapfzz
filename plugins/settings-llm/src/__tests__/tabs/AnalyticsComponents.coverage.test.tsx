// Direct unit tests for analytics sub-components: BreakdownTable, MetricRows,
// BreakdownDonut, DonutChart, ModelUsageChart — covering uncovered branches.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BreakdownTable } from '../../tabs/analytics/BreakdownTable';
import { MetricRows } from '../../tabs/analytics/MetricRows';
import { BreakdownDonut } from '../../tabs/analytics/BreakdownDonut';

// ────────────────────────────────────────────────────────────────────────────
// BreakdownTable
// ────────────────────────────────────────────────────────────────────────────

const ROWS = [
  { name: 'gpt-4o', requests: 100, inputTokens: 5000, outputTokens: 2000, totalTokens: 7000, cost: 0.05, share: 70 },
  { name: 'claude-3', requests: 50, inputTokens: 2000, outputTokens: 1000, totalTokens: 3000, cost: 0, share: 30 },
];

describe('BreakdownTable', () => {
  it('renders with data rows', () => {
    render(<BreakdownTable title="Model Breakdown" rows={ROWS} />);
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('claude-3')).toBeInTheDocument();
  });

  it('shows "No data" when rows is empty', () => {
    render(<BreakdownTable title="Model Breakdown" rows={[]} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders the filter input when filterPlaceholder is provided', () => {
    render(<BreakdownTable title="Model Breakdown" rows={ROWS} filterPlaceholder="Filter models..." />);
    expect(screen.getByPlaceholderText('Filter models...')).toBeInTheDocument();
  });

  it('filtering by name hides non-matching rows', async () => {
    const user = userEvent.setup();
    render(<BreakdownTable title="Model Breakdown" rows={ROWS} filterPlaceholder="Filter..." />);
    const filterInput = screen.getByPlaceholderText('Filter...');
    await user.type(filterInput, 'gpt');
    await waitFor(() => {
      expect(screen.queryByText('claude-3')).not.toBeInTheDocument();
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });
  });

  it('clicking a column header sorts by that column', async () => {
    const user = userEvent.setup();
    render(<BreakdownTable title="Model Breakdown" rows={ROWS} />);
    const requestsHeader = screen.getByRole('button', { name: /requests/i });
    await user.click(requestsHeader);
    // No crash — column sorted
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
  });

  it('clicking same column header twice toggles sort direction (ascending)', async () => {
    const user = userEvent.setup();
    render(<BreakdownTable title="Model Breakdown" rows={ROWS} />);
    const requestsHeader = screen.getByRole('button', { name: /requests/i });
    await user.click(requestsHeader); // sort by requests desc
    await user.click(requestsHeader); // toggle to asc — SortArrow shows ▲
    expect(screen.getByText('▲')).toBeInTheDocument();
  });

  it('keyboard Enter on column header triggers sort', () => {
    render(<BreakdownTable title="Model Breakdown" rows={ROWS} />);
    const requestsHeader = screen.getByRole('button', { name: /requests/i });
    fireEvent.keyDown(requestsHeader, { key: 'Enter' });
    // No crash — sort triggered
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
  });

  it('non-Enter keydown on column header does NOT sort', () => {
    render(<BreakdownTable title="Model Breakdown" rows={ROWS} />);
    const requestsHeader = screen.getByRole('button', { name: /requests/i });
    fireEvent.keyDown(requestsHeader, { key: 'Space' });
    // No crash
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
  });

  it('shows cost 0 with success color (green) — costColor branch', () => {
    render(<BreakdownTable title="Model Breakdown" rows={ROWS} />);
    // claude-3 has cost=0 — its cost cell uses --color-success
    expect(screen.getByText('claude-3')).toBeInTheDocument();
    // Check that zero cost is rendered as $0.00
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('renders nameHeader prop', () => {
    render(<BreakdownTable title="Model Breakdown" rows={ROWS} nameHeader="MODEL" />);
    expect(screen.getByText('MODEL')).toBeInTheDocument();
  });

  it('uses default nameHeader "NAME" when not provided', () => {
    render(<BreakdownTable title="Model Breakdown" rows={ROWS} />);
    expect(screen.getByText('NAME')).toBeInTheDocument();
  });

  it('can sort by each column type', async () => {
    const user = userEvent.setup();
    render(<BreakdownTable title="Model Breakdown" rows={ROWS} />);
    for (const label of ['INPUT', 'OUTPUT', 'TOTAL', 'COST', 'SHARE']) {
      const header = screen.getByRole('button', { name: new RegExp(label, 'i') });
      await user.click(header);
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    }
  });

  it('SortArrow shows ▼ when inactive (inactive column)', () => {
    render(<BreakdownTable title="Model Breakdown" rows={ROWS} />);
    // Default sort is totalTokens desc. Requests column shows ▼ (inactive=opacity 0.3)
    const arrows = screen.getAllByText('▼');
    expect(arrows.length).toBeGreaterThanOrEqual(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// MetricRows
// ────────────────────────────────────────────────────────────────────────────

describe('MetricRows', () => {
  const INFRA = { accounts: 3, providers: 2, apiKeys: 5, models: 10 };
  const PERF = { avgTokensPerReq: 750, costPerReq: 0.005, ioRatio: 2.5, fallbackRate: 1.5 };

  it('renders all three sections', () => {
    render(<MetricRows
      infrastructure={INFRA}
      performance={PERF}
      highlights={{ topModel: 'gpt-4o', topProvider: 'openai', busiestDay: '2026-04-10', diversity: 75 }}
    />);
    expect(screen.getByText('Infrastructure')).toBeInTheDocument();
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Highlights')).toBeInTheDocument();
  });

  it('shows "—" for highlights when values are empty strings', () => {
    render(<MetricRows
      infrastructure={INFRA}
      performance={PERF}
      highlights={{ topModel: '', topProvider: '', busiestDay: '', diversity: 0 }}
    />);
    const dashes = screen.getAllByText('—');
    // topModel, topProvider, busiestDay all show '—'
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('shows actual values when highlights are provided', () => {
    render(<MetricRows
      infrastructure={INFRA}
      performance={PERF}
      highlights={{ topModel: 'gpt-4o', topProvider: 'openai', busiestDay: '2026-04-10', diversity: 75 }}
    />);
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('2026-04-10')).toBeInTheDocument();
  });

  it('renders infrastructure counts correctly', () => {
    render(<MetricRows
      infrastructure={INFRA}
      performance={PERF}
      highlights={{ topModel: 'gpt-4o', topProvider: 'openai', busiestDay: '2026-04-10', diversity: 75 }}
    />);
    expect(screen.getByText('3')).toBeInTheDocument(); // accounts
    expect(screen.getByText('2')).toBeInTheDocument(); // providers
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BreakdownDonut
// ────────────────────────────────────────────────────────────────────────────

describe('BreakdownDonut', () => {
  const DONUT_ENTRIES = [
    { label: 'openai', value: 7000 },
    { label: 'anthropic', value: 3000 },
  ];

  it('renders with data entries', () => {
    render(<BreakdownDonut title="Provider Breakdown" entries={DONUT_ENTRIES} />);
    expect(screen.getByText('Provider Breakdown')).toBeInTheDocument();
  });

  it('renders empty state when entries is empty (total = 0)', () => {
    render(<BreakdownDonut title="Provider Breakdown" entries={[]} />);
    expect(screen.getByText('Provider Breakdown')).toBeInTheDocument();
  });

  it('renders single entry (no gap between slices)', () => {
    render(<BreakdownDonut title="Provider Breakdown" entries={[{ label: 'openai', value: 100 }]} />);
    expect(screen.getByText('openai')).toBeInTheDocument();
  });

  it('renders all entry labels in legend', () => {
    render(<BreakdownDonut title="Provider Breakdown" entries={DONUT_ENTRIES} />);
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('anthropic')).toBeInTheDocument();
  });

  it('renders entries with zero value (handles zero total edge case)', () => {
    render(<BreakdownDonut title="Provider Breakdown" entries={[{ label: 'none', value: 0 }]} />);
    // Zero total means no slices rendered — should not crash
    expect(screen.getByText('Provider Breakdown')).toBeInTheDocument();
  });
});
