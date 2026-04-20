// @vitest-environment jsdom
// Per A013/ModelPicker: integration test for the ModelPicker composition.
// Mocks observation + events and verifies the layout receives correct props.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockObservation = {
  models: [],
  loading: false,
  error: null,
  selectedId: 'openai/gpt-4',
  isOpen: false,
  searchQuery: '',
  pinnedIds: [],
  refresh: vi.fn(),
  setOpen: vi.fn(),
  setSearch: vi.fn(),
  setSelected: vi.fn(),
  setPinned: vi.fn(),
};

const mockEvents = {
  onSelect: vi.fn(),
  onRefresh: vi.fn(),
  onPin: vi.fn(),
  onToggleOpen: vi.fn(),
  onSearch: vi.fn(),
};

vi.mock('./observation', () => ({
  useModelPickerObservation: () => mockObservation,
}));

vi.mock('./events', () => ({
  useModelPickerEvents: () => mockEvents,
}));

vi.mock('./layout', () => ({
  ModelPickerLayout: ({
    observation,
  }: {
    observation: typeof mockObservation;
    events: typeof mockEvents;
  }) => (
    <div
      data-testid="model-picker-layout"
      data-selected={observation.selectedId ?? ''}
    />
  ),
}));

import { ModelPicker } from './index';

describe('A013/ModelPicker/index: integration', () => {
  it('A013/index: renders ModelPickerLayout', () => {
    render(<ModelPicker />);
    expect(screen.getByTestId('model-picker-layout')).toBeTruthy();
  });

  it('A013/index: threads selectedId from observation to layout', () => {
    render(<ModelPicker />);
    expect(screen.getByTestId('model-picker-layout').getAttribute('data-selected')).toBe('openai/gpt-4');
  });
});
