// @vitest-environment jsdom
// Per A013/ModelPicker: ModelChip leaf component tests.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@ant-design/icons', () => ({
  ThunderboltOutlined: () => <span data-testid="icon-thunder" />,
  DownOutlined: () => <span data-testid="icon-down" />,
}));

vi.mock('@agentscope-ai/design', () => ({
  Button: ({
    children,
    onClick,
    'aria-label': ariaLabel,
    'data-testid': testId,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    'aria-label'?: string;
    'data-testid'?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId ?? 'spark-button'}
    >
      {children}
    </button>
  ),
}));

import { ModelChip } from './ModelChip';

describe('A013/ModelPicker/ModelChip', () => {
  it('A013/ModelChip: renders label text', () => {
    render(<ModelChip label="openai/gpt-4" onClick={vi.fn()} />);
    expect(screen.getByText('openai/gpt-4')).toBeTruthy();
  });

  it('A013/ModelChip: renders ThunderboltOutlined icon', () => {
    render(<ModelChip label="x" onClick={vi.fn()} />);
    expect(screen.getByTestId('icon-thunder')).toBeTruthy();
  });

  it('A013/ModelChip: renders DownOutlined caret icon', () => {
    render(<ModelChip label="x" onClick={vi.fn()} />);
    expect(screen.getByTestId('icon-down')).toBeTruthy();
  });

  it('A013/ModelChip: onClick called when button clicked', () => {
    const onClick = vi.fn();
    render(<ModelChip label="x" onClick={onClick} />);
    fireEvent.click(screen.getByTestId('model-chip'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('A013/ModelChip: has accessible aria-label containing model name', () => {
    render(<ModelChip label="openai/gpt-4" onClick={vi.fn()} />);
    expect(screen.getByLabelText(/openai\/gpt-4/)).toBeTruthy();
  });
});
