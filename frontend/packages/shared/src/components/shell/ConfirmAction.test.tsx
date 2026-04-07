import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmAction } from './ConfirmAction';

describe('ConfirmAction', () => {
  it('renders children', () => {
    render(
      <ConfirmAction title="Delete" onConfirm={vi.fn()}>
        <button type="button">Open confirm</button>
      </ConfirmAction>,
    );

    expect(screen.getByRole('button', { name: 'Open confirm' })).toBeTruthy();
  });

  it('shows popconfirm on click and calls onConfirm when confirmed', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmAction title="Delete item" description="This cannot be undone" onConfirm={onConfirm}>
        <button type="button">Delete</button>
      </ConfirmAction>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Delete item')).toBeTruthy();
    expect(screen.getByText('This cannot be undone')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it('respects disabled prop', async () => {
    render(
      <ConfirmAction title="Disabled action" onConfirm={vi.fn()} disabled>
        <button type="button">Disabled trigger</button>
      </ConfirmAction>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Disabled trigger' }));

    expect(screen.queryByText('Disabled action')).toBeNull();
  });

  it('marks confirm button as dangerous when danger is true', async () => {
    render(
      <ConfirmAction title="Delete item" onConfirm={vi.fn()} danger>
        <button type="button">Delete permanently</button>
      </ConfirmAction>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    const confirm = await screen.findByRole('button', { name: 'Confirm' });
    expect(confirm.className).toMatch(/danger/i);
  });
});
