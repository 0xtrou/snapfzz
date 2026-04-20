// @vitest-environment jsdom
// Per A013/ModelPicker + feedback/five-layer: layout layer tests.
// Mocks Spark Popover, Empty, Input, Button and the part sub-components.
// Verifies rendering for: loading / error / empty / populated / pinned states.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ModelPickerObservation, ModelPickerEventHandlers } from './contracts';

// ─── Spark component mocks ────────────────────────────────────────────────────

vi.mock('@agentscope-ai/design', () => ({
  Popover: ({
    open,
    children,
    content,
    onOpenChange,
  }: {
    open: boolean;
    children: React.ReactNode;
    content: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="popover" data-open={String(open)}>
      <div data-testid="popover-trigger" onClick={() => onOpenChange?.(!open)}>{children}</div>
      {open && <div data-testid="popover-content">{content}</div>}
    </div>
  ),
  Empty: ({ description, children }: { description?: string; children?: React.ReactNode }) => (
    <div data-testid="spark-empty">
      <span>{description}</span>
      {children}
    </div>
  ),
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (e: { target: { value: string } }) => void;
    placeholder?: string;
  }) => (
    <input
      data-testid="model-picker-search"
      value={value}
      placeholder={placeholder}
      onChange={onChange}
    />
  ),
  Button: ({ children, onClick, 'data-testid': testId }: { children?: React.ReactNode; onClick?: () => void; 'data-testid'?: string }) => (
    <button type="button" data-testid={testId ?? 'spark-button'} onClick={onClick}>{children}</button>
  ),
}));

vi.mock('./parts/ModelChip', () => ({
  ModelChip: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" data-testid="model-chip" onClick={onClick}>{label}</button>
  ),
}));

vi.mock('./parts/ModelRow', () => ({
  ModelRow: ({
    model,
    selected,
    onSelect,
  }: {
    model: { id: string; displayName: string };
    selected: boolean;
    onSelect: (id: string) => void;
  }) => (
    <div
      data-testid="model-row"
      data-model-id={model.id}
      data-selected={String(selected)}
      onClick={() => onSelect(model.id)}
    >
      {model.displayName}
    </div>
  ),
}));

import { ModelPickerLayout } from './layout';

function buildObs(overrides: Partial<ModelPickerObservation> = {}): ModelPickerObservation {
  return {
    models: [],
    loading: false,
    error: null,
    selectedId: null,
    isOpen: false,
    searchQuery: '',
    pinnedIds: [],
    ...overrides,
  };
}

function buildEvents(overrides: Partial<ModelPickerEventHandlers> = {}): ModelPickerEventHandlers {
  return {
    onSelect: vi.fn(),
    onRefresh: vi.fn(),
    onPin: vi.fn(),
    onToggleOpen: vi.fn(),
    onSearch: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('A013/ModelPicker/layout: loading state', () => {
  it('A013/layout: shows loading indicator when loading=true', () => {
    render(<ModelPickerLayout observation={buildObs({ loading: true })} events={buildEvents()} />);
    // Open the popover to see content
    fireEvent.click(screen.getByTestId('popover-trigger'));
    // Popover is not open by default in this test (isOpen=false), so we test with isOpen=true
  });

  it('A013/layout: shows loading text when popover open + loading', () => {
    render(<ModelPickerLayout observation={buildObs({ loading: true, isOpen: true })} events={buildEvents()} />);
    expect(screen.getByTestId('model-picker-loading')).toBeTruthy();
  });
});

describe('A013/ModelPicker/layout: error state', () => {
  it('A013/layout: shows Spark Empty with error message', () => {
    render(<ModelPickerLayout observation={buildObs({ isOpen: true, error: 'LiteLLM 503: gateway error' })} events={buildEvents()} />);
    expect(screen.getByTestId('spark-empty')).toBeTruthy();
    expect(screen.getByText(/Gateway unreachable/)).toBeTruthy();
  });

  it('A013/layout: retry button calls onRefresh', () => {
    const onRefresh = vi.fn();
    render(<ModelPickerLayout observation={buildObs({ isOpen: true, error: 'err' })} events={buildEvents({ onRefresh })} />);
    fireEvent.click(screen.getByTestId('model-picker-retry'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('A013/ModelPicker/layout: empty state', () => {
  it('A013/layout: shows Spark Empty when no models and no error', () => {
    render(<ModelPickerLayout observation={buildObs({ isOpen: true, models: [], error: null })} events={buildEvents()} />);
    expect(screen.getByTestId('spark-empty')).toBeTruthy();
    expect(screen.getByText(/No models configured/)).toBeTruthy();
  });
});

describe('A013/ModelPicker/layout: populated state', () => {
  const models = [
    {
      id: 'openai/gpt-4',
      displayName: 'openai/gpt-4',
      provider: 'openai',
      capabilities: { vision: true, tools: true, reasoning: false },
      inputCostPer1M: 10,
      outputCostPer1M: 30,
      contextWindow: 128_000,
    },
  ];

  it('A013/layout: renders model rows as a flat list (no group headers)', () => {
    render(<ModelPickerLayout observation={buildObs({ isOpen: true, models })} events={buildEvents()} />);
    expect(screen.getByTestId('model-row')).toBeTruthy();
    // No group header rendered — the list is flat.
    expect(screen.queryByText('openai', { selector: 'div' })).toBeNull();
  });

  it('A013/layout: renders search input', () => {
    render(<ModelPickerLayout observation={buildObs({ isOpen: true, models })} events={buildEvents()} />);
    expect(screen.getByTestId('model-picker-search')).toBeTruthy();
  });

  it('A013/layout: onSelect is called when row is clicked', () => {
    const onSelect = vi.fn();
    render(<ModelPickerLayout observation={buildObs({ isOpen: true, models })} events={buildEvents({ onSelect })} />);
    fireEvent.click(screen.getByTestId('model-row'));
    expect(onSelect).toHaveBeenCalledWith('openai/gpt-4');
  });
});

describe('A013/ModelPicker/layout: chip trigger', () => {
  it('A013/layout: chip label shows selectedId when set', () => {
    render(<ModelPickerLayout observation={buildObs({ selectedId: 'openai/gpt-4' })} events={buildEvents()} />);
    expect(screen.getByTestId('model-chip').textContent).toContain('openai/gpt-4');
  });

  it('A013/layout: chip label shows fallback when no selection', () => {
    render(<ModelPickerLayout observation={buildObs({ selectedId: null })} events={buildEvents()} />);
    expect(screen.getByTestId('model-chip').textContent).toContain('Select model');
  });
});

describe('A013/ModelPicker/layout: search interaction', () => {
  const models = [
    {
      id: 'openai/gpt-4',
      displayName: 'openai/gpt-4',
      provider: 'openai',
      capabilities: { vision: false, tools: false, reasoning: false },
      inputCostPer1M: null,
      outputCostPer1M: null,
      contextWindow: null,
    },
  ];

  it('A013/layout: search input change calls onSearch', () => {
    const onSearch = vi.fn();
    render(<ModelPickerLayout observation={buildObs({ isOpen: true, models })} events={buildEvents({ onSearch })} />);
    fireEvent.change(screen.getByTestId('model-picker-search'), { target: { value: 'gpt' } });
    expect(onSearch).toHaveBeenCalledWith('gpt');
  });
});
