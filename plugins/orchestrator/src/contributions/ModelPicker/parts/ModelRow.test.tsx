// @vitest-environment jsdom
// Per A013/ModelPicker: ModelRow leaf component tests.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ModelDescriptor } from '../contracts';

vi.mock('@ant-design/icons', () => ({
  PushpinFilled: ({
    onClick,
    'aria-label': ariaLabel,
  }: {
    onClick?: (e: React.MouseEvent) => void;
    'aria-label'?: string;
  }) => (
    <span data-testid="pin-icon" aria-label={ariaLabel} onClick={onClick} />
  ),
}));

vi.mock('./CapabilityIcons', () => ({
  CapabilityIcons: ({ capabilities }: { capabilities: { vision: boolean; tools: boolean; reasoning: boolean } }) => (
    <span data-testid="capability-icons" data-caps={JSON.stringify(capabilities)} />
  ),
}));

import { ModelRow } from './ModelRow';

const BASE_MODEL: ModelDescriptor = {
  id: 'openai/gpt-4',
  displayName: 'openai/gpt-4',
  provider: 'openai',
  capabilities: { vision: true, tools: true, reasoning: false },
  inputCostPer1M: 10,
  outputCostPer1M: 30,
  contextWindow: 128_000,
};

describe('A013/ModelPicker/ModelRow: rendering', () => {
  it('A013/ModelRow: renders display name', () => {
    render(<ModelRow model={BASE_MODEL} selected={false} pinned={false} onSelect={vi.fn()} onPin={vi.fn()} />);
    expect(screen.getByText('openai/gpt-4')).toBeTruthy();
  });

  it('A013/ModelRow: does not render provider tag — provider is for sorting only', () => {
    render(<ModelRow model={BASE_MODEL} selected={false} pinned={false} onSelect={vi.fn()} onPin={vi.fn()} />);
    // 'openai' is part of the displayName ("openai/gpt-4") but never stands alone as a tag.
    expect(screen.queryByText('openai', { selector: 'span' })).toBeNull();
  });

  it('A013/ModelRow: renders context badge when contextWindow is known', () => {
    render(<ModelRow model={BASE_MODEL} selected={false} pinned={false} onSelect={vi.fn()} onPin={vi.fn()} />);
    expect(screen.getByTestId('model-row-context').textContent).toBe('128k');
  });

  it('A013/ModelRow: hides context badge when contextWindow is null', () => {
    const noCtx = { ...BASE_MODEL, contextWindow: null };
    render(<ModelRow model={noCtx} selected={false} pinned={false} onSelect={vi.fn()} onPin={vi.fn()} />);
    expect(screen.queryByTestId('model-row-context')).toBeNull();
  });

  it('A013/ModelRow: renders cost badge when available', () => {
    render(<ModelRow model={BASE_MODEL} selected={false} pinned={false} onSelect={vi.fn()} onPin={vi.fn()} />);
    expect(screen.getByTestId('model-row-cost').textContent).toBe('$10/$30');
  });

  it('A013/ModelRow: does not render cost when both null', () => {
    const noCoast = { ...BASE_MODEL, inputCostPer1M: null, outputCostPer1M: null };
    render(<ModelRow model={noCoast} selected={false} pinned={false} onSelect={vi.fn()} onPin={vi.fn()} />);
    expect(screen.queryByText(/\$.*\//)).toBeNull();
  });

  it('A013/ModelRow: passes aria-selected based on selected prop', () => {
    render(<ModelRow model={BASE_MODEL} selected={true} pinned={false} onSelect={vi.fn()} onPin={vi.fn()} />);
    expect(screen.getByRole('option').getAttribute('aria-selected')).toBe('true');
  });
});

describe('A013/ModelPicker/ModelRow: interactions', () => {
  it('A013/ModelRow: onSelect called with model id on row click', () => {
    const onSelect = vi.fn();
    render(<ModelRow model={BASE_MODEL} selected={false} pinned={false} onSelect={onSelect} onPin={vi.fn()} />);
    fireEvent.click(screen.getByRole('option'));
    expect(onSelect).toHaveBeenCalledWith('openai/gpt-4');
  });

  it('A013/ModelRow: onPin called with model id on pin icon click', () => {
    const onPin = vi.fn();
    render(<ModelRow model={BASE_MODEL} selected={false} pinned={false} onSelect={vi.fn()} onPin={onPin} />);
    fireEvent.click(screen.getByTestId('pin-icon'));
    expect(onPin).toHaveBeenCalledWith('openai/gpt-4');
  });

  it('A013/ModelRow: pin click does not bubble to row onSelect', () => {
    const onSelect = vi.fn();
    const onPin = vi.fn();
    render(<ModelRow model={BASE_MODEL} selected={false} pinned={false} onSelect={onSelect} onPin={onPin} />);
    fireEvent.click(screen.getByTestId('pin-icon'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

// The "group provider special case" suite was removed — the flat-list picker no longer
// injects model-group aliases as fake rows, so ModelRow always renders provider tag + pin.
