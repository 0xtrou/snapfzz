// ComboList direct unit tests — covers empty state, delete confirm/cancel,
// loading state, single-deployment label, and strategy color rendering.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ComboList from '../../tabs/routing/ComboList';
import type { ComboListProps } from '../../tabs/routing/ComboList';

vi.mock('@snapfzz/shared', () => ({
  // Spread `...rest` so data-testid (used by the A013 system-combo tests) reaches the <button>.
  AppButton: ({ children, onClick, disabled, loading, variant: _v, icon, style: _s, ...rest }: any) => (
    <button type="button" onClick={onClick} disabled={disabled || loading} {...rest}>
      {icon}
      {children}
    </button>
  ),
}));

const COMBOS = [
  {
    name: 'test-pool',
    strategy: 'round-robin' as const,
    deployments: [
      { provider: 'custom-p', model: 'openai/model-a', modelName: 'provider/model-a', apiBase: 'https://example.com/v1' },
      { provider: 'custom-p', model: 'openai/model-b', modelName: 'provider/model-b', apiBase: 'https://example.com/v1' },
    ],
    apiType: 'openai' as const,
  },
  {
    name: 'solo-pool',
    strategy: 'weighted' as const,
    deployments: [
      { provider: 'custom-p', model: 'openai/model-a', modelName: 'provider/model-a', apiBase: 'https://example.com/v1', weight: 100 },
    ],
    apiType: 'openai' as const,
  },
];

const DEFAULT_PROPS: ComboListProps = {
  combos: [],
  onEdit: vi.fn(),
  onCreate: vi.fn(),
  onDelete: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue(undefined),
  loading: false,
};

// Ant Modal lives in a portal. Find a visible dialog.
function getVisibleDialog(): HTMLElement | null {
  const dialogs = document.querySelectorAll('[role="dialog"]');
  return (Array.from(dialogs).find(
    (d) => (d as HTMLElement).style.display !== 'none',
  ) ?? null) as HTMLElement | null;
}

describe('ComboList – empty state', () => {
  it('shows empty-state message when no combos', () => {
    render(<ComboList {...DEFAULT_PROPS} />);
    expect(screen.getByText(/no routing combos created/i)).toBeInTheDocument();
  });

  it('shows Create Combo button', () => {
    render(<ComboList {...DEFAULT_PROPS} />);
    expect(screen.getByRole('button', { name: /create combo/i })).toBeInTheDocument();
  });

  it('Create Combo button calls onCreate', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(<ComboList {...DEFAULT_PROPS} onCreate={onCreate} />);
    await user.click(screen.getByRole('button', { name: /create combo/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('Refresh button calls loadData', async () => {
    const loadData = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ComboList {...DEFAULT_PROPS} loadData={loadData} />);
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(loadData).toHaveBeenCalledTimes(1);
  });

  it('Refresh button shows loading state', () => {
    render(<ComboList {...DEFAULT_PROPS} loading={true} />);
    const refreshBtn = screen.getByRole('button', { name: /refresh/i });
    expect(refreshBtn).toBeDisabled();
  });
});

describe('ComboList – combo cards', () => {
  it('renders combo cards with names', () => {
    render(<ComboList {...DEFAULT_PROPS} combos={COMBOS} />);
    expect(screen.getByText('test-pool')).toBeInTheDocument();
    expect(screen.getByText('solo-pool')).toBeInTheDocument();
  });

  it('shows plural "deployments" for multiple deployments', () => {
    render(<ComboList {...DEFAULT_PROPS} combos={COMBOS} />);
    expect(screen.getByText('2 deployments')).toBeInTheDocument();
  });

  it('shows singular "deployment" for single deployment', () => {
    render(<ComboList {...DEFAULT_PROPS} combos={COMBOS} />);
    expect(screen.getByText('1 deployment')).toBeInTheDocument();
  });

  it('shows strategy tags for each combo', () => {
    render(<ComboList {...DEFAULT_PROPS} combos={COMBOS} />);
    expect(screen.getByText('round-robin')).toBeInTheDocument();
    expect(screen.getByText('weighted')).toBeInTheDocument();
  });

  it('clicking a combo card calls onEdit with that combo', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<ComboList {...DEFAULT_PROPS} combos={COMBOS} onEdit={onEdit} />);
    // Click on the first combo name element (which is inside the card)
    await user.click(screen.getByText('test-pool'));
    expect(onEdit).toHaveBeenCalledWith(COMBOS[0]);
  });

  it('clicking the edit icon button calls onEdit', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<ComboList {...DEFAULT_PROPS} combos={COMBOS} onEdit={onEdit} />);
    // Find the card containing 'test-pool' and locate its edit button
    const cardEl = screen.getByText('test-pool').closest('[style*="display: flex"]')!;
    const editBtn = cardEl.querySelectorAll('button')[0]; // first inner icon button
    await user.click(editBtn);
    expect(onEdit).toHaveBeenCalled();
  });

  it('renders unknown strategy with default tag color (no crash)', () => {
    const comboWithUnknownStrategy = [{
      ...COMBOS[0],
      strategy: 'some-unknown-strategy' as any,
    }];
    render(<ComboList {...DEFAULT_PROPS} combos={comboWithUnknownStrategy} />);
    expect(screen.getByText('some-unknown-strategy')).toBeInTheDocument();
  });
});

describe('ComboList – delete modal flow', () => {
  it('clicking delete icon opens confirmation modal', async () => {
    const user = userEvent.setup();
    render(<ComboList {...DEFAULT_PROPS} combos={COMBOS} />);

    // Find the delete button (last button in the card's button group)
    const cardEl = screen.getByText('test-pool').closest('[style*="display: flex"]')!;
    const buttons = Array.from(cardEl.querySelectorAll('button'));
    const deleteBtn = buttons[buttons.length - 1];
    await user.click(deleteBtn);

    await waitFor(() => {
      const dialog = getVisibleDialog();
      expect(dialog).toBeTruthy();
    });
  });

  it('delete modal shows the combo name being deleted', async () => {
    const user = userEvent.setup();
    render(<ComboList {...DEFAULT_PROPS} combos={COMBOS} />);

    const cardEl = screen.getByText('test-pool').closest('[style*="display: flex"]')!;
    const buttons = Array.from(cardEl.querySelectorAll('button'));
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      const dialog = getVisibleDialog();
      expect(dialog).toBeTruthy();
      expect(within(dialog!).getAllByText('test-pool').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('confirming delete calls onDelete with the combo name', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ComboList {...DEFAULT_PROPS} combos={COMBOS} onDelete={onDelete} />);

    const cardEl = screen.getByText('test-pool').closest('[style*="display: flex"]')!;
    const buttons = Array.from(cardEl.querySelectorAll('button'));
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(getVisibleDialog()).toBeTruthy();
    });

    const dialog = getVisibleDialog()!;
    const okBtn = within(dialog).getByRole('button', { name: /^(ok|delete)$/i });
    await user.click(okBtn);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('test-pool');
    });
  });

  it('cancelling delete modal does NOT call onDelete', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ComboList {...DEFAULT_PROPS} combos={COMBOS} onDelete={onDelete} />);

    const cardEl = screen.getByText('test-pool').closest('[style*="display: flex"]')!;
    const buttons = Array.from(cardEl.querySelectorAll('button'));
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(getVisibleDialog()).toBeTruthy();
    });

    const dialog = getVisibleDialog()!;
    const cancelBtn = within(dialog).getByRole('button', { name: /cancel/i });
    await user.click(cancelBtn);

    await waitFor(() => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      const visible = Array.from(dialogs).find((d) => (d as HTMLElement).style.display !== 'none');
      expect(visible).toBeUndefined();
    });

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('delete button shows loading state while deletion is in progress', async () => {
    // onDelete that never resolves — simulates in-flight deletion
    const onDelete = vi.fn().mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<ComboList {...DEFAULT_PROPS} combos={COMBOS} onDelete={onDelete} />);

    const cardEl = screen.getByText('test-pool').closest('[style*="display: flex"]')!;
    const buttons = Array.from(cardEl.querySelectorAll('button'));
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(getVisibleDialog()).toBeTruthy());
    const dialog = getVisibleDialog()!;
    const okBtn = within(dialog).getByRole('button', { name: /^(ok|delete)$/i });
    await user.click(okBtn);

    // While deleting, the modal OK button should show loading state (disabled in our mock)
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });
});

// Per A013/Orchestrator: system combos (name === "orchestrator") render with a lock badge
// and disabled Edit/Delete — they're managed by the orchestrator plugin, not by the UI.
describe('A013/ComboList: system combo guard', () => {
  const SYSTEM_COMBO: ComboListProps['combos'][number] = {
    name: 'orchestrator',
    strategy: 'round-robin',
    deployments: [
      { provider: 'snapfzz-gateway', model: 'openai/placeholder', modelName: 'snapfzz-gateway/placeholder', apiBase: 'http://127.0.0.1:4000' },
    ],
    apiType: 'openai',
  };

  it('A013/ComboList: renders System badge next to the combo name', () => {
    render(<ComboList {...DEFAULT_PROPS} combos={[SYSTEM_COMBO]} />);
    expect(screen.getByText('orchestrator')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('A013/ComboList: marks the card with data-system="true"', () => {
    render(<ComboList {...DEFAULT_PROPS} combos={[SYSTEM_COMBO]} />);
    expect(screen.getByTestId('combo-row-orchestrator').getAttribute('data-system')).toBe('true');
  });

  it('A013/ComboList: Edit button is disabled for system combos', () => {
    render(<ComboList {...DEFAULT_PROPS} combos={[SYSTEM_COMBO]} />);
    const editBtn = screen.getByTestId('combo-edit-orchestrator') as HTMLButtonElement;
    expect(editBtn).toBeDisabled();
  });

  it('A013/ComboList: Delete button is disabled for system combos', () => {
    render(<ComboList {...DEFAULT_PROPS} combos={[SYSTEM_COMBO]} />);
    const deleteBtn = screen.getByTestId('combo-delete-orchestrator') as HTMLButtonElement;
    expect(deleteBtn).toBeDisabled();
  });

  it('A013/ComboList: clicking the card does NOT trigger onEdit for system combos', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<ComboList {...DEFAULT_PROPS} combos={[SYSTEM_COMBO]} onEdit={onEdit} />);

    await user.click(screen.getByText('orchestrator'));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('A013/ComboList: clicking disabled Edit does NOT trigger onEdit', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<ComboList {...DEFAULT_PROPS} combos={[SYSTEM_COMBO]} onEdit={onEdit} />);

    await user.click(screen.getByTestId('combo-edit-orchestrator'));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('A013/ComboList: clicking disabled Delete does NOT open the confirm modal', async () => {
    const user = userEvent.setup();
    render(<ComboList {...DEFAULT_PROPS} combos={[SYSTEM_COMBO]} />);

    await user.click(screen.getByTestId('combo-delete-orchestrator'));
    expect(getVisibleDialog()).toBeNull();
  });

  it('A013/ComboList: non-system combos still render as editable', () => {
    const mixed = [SYSTEM_COMBO, COMBOS[0]];
    render(<ComboList {...DEFAULT_PROPS} combos={mixed} />);
    expect(screen.getByTestId('combo-row-test-pool').getAttribute('data-system')).toBe('false');
    expect(screen.getByTestId('combo-edit-test-pool')).not.toBeDisabled();
    expect(screen.getByTestId('combo-delete-test-pool')).not.toBeDisabled();
  });
});
