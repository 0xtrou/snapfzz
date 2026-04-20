// @vitest-environment jsdom
// Spec: A013/Composer — layout renders popover + action rows; callbacks fire via props.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@agentscope-ai/design', () => ({
  Popover: ({
    open,
    content,
    children,
  }: {
    open?: boolean;
    content?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div data-testid="popover" data-open={String(Boolean(open))}>
      <div data-testid="popover-trigger">{children}</div>
      {open && <div data-testid="popover-content">{content}</div>}
    </div>
  ),
}));

vi.mock('./parts/PlusButton', () => ({
  PlusButton: ({ onClick, open }: { onClick: () => void; open: boolean }) => (
    <button data-testid="plus-btn" data-open={String(open)} onClick={onClick}>
      +
    </button>
  ),
}));

vi.mock('./parts/ActionRow', () => ({
  ActionRow: ({
    action,
    onSelect,
  }: {
    action: { id: string; label: string };
    onSelect: (id: string) => void;
  }) => (
    <button data-testid="action-row" data-action={action.id} onClick={() => onSelect(action.id)}>
      {action.label}
    </button>
  ),
}));

import { ComposerActionsLayout } from './layout';

describe('A013/Composer/layout: popover + rows', () => {
  it('A013/layout: renders the plus trigger and no content when closed', () => {
    render(<ComposerActionsLayout isOpen={false} onToggleOpen={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByTestId('plus-btn').getAttribute('data-open')).toBe('false');
    expect(screen.queryByTestId('popover-content')).toBeNull();
  });

  it('A013/layout: renders action rows when open', () => {
    render(<ComposerActionsLayout isOpen={true} onToggleOpen={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByTestId('popover-content')).toBeTruthy();
    expect(screen.getAllByTestId('action-row').length).toBeGreaterThan(0);
  });

  it('A013/layout: trigger click toggles isOpen via onToggleOpen', () => {
    const onToggleOpen = vi.fn();
    render(<ComposerActionsLayout isOpen={false} onToggleOpen={onToggleOpen} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByTestId('plus-btn'));
    expect(onToggleOpen).toHaveBeenCalledWith(true);
  });

  it('A013/layout: row click forwards to onSelect with the action id', () => {
    const onSelect = vi.fn();
    render(<ComposerActionsLayout isOpen={true} onToggleOpen={vi.fn()} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByTestId('action-row')[0]);
    expect(onSelect).toHaveBeenCalledWith('upload');
  });
});
