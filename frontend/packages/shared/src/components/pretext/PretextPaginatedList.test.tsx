// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./PretextList', () => ({
  PretextList: ({ items, renderItem, keyExtractor }: {
    items: unknown[];
    renderItem: (item: unknown, index: number) => React.ReactNode;
    keyExtractor: (item: unknown, index: number) => string;
    estimateHeight: unknown;
    overscan?: number;
    style?: React.CSSProperties;
  }) => (
    <div data-testid="pretext-list">
      {items.map((item, i) => (
        <div key={keyExtractor(item, i)}>{renderItem(item, i)}</div>
      ))}
    </div>
  ),
}));

import { PretextPaginatedList } from './PretextPaginatedList';

const makeItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `item-${i}`, label: `Item ${i}` }));

const renderItem = (item: { id: string; label: string }) => <span>{item.label}</span>;
const keyExtractor = (item: { id: string }) => item.id;

describe('PretextPaginatedList', () => {
  it('renders first page of items', () => {
    const items = makeItems(25);
    render(
      <PretextPaginatedList
        items={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimateHeight={40}
        pageSize={10}
        style={{ height: 400 }}
      />,
    );
    expect(screen.getByText('Item 0')).toBeTruthy();
    expect(screen.getByText('Item 9')).toBeTruthy();
    expect(screen.queryByText('Item 10')).toBeNull();
  });

  it('shows correct item range and total in footer', () => {
    const items = makeItems(25);
    render(
      <PretextPaginatedList
        items={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimateHeight={40}
        pageSize={10}
      />,
    );
    expect(screen.getByText('1–10 of 25')).toBeTruthy();
  });

  it('navigates to next page on next button click', async () => {
    const items = makeItems(25);
    render(
      <PretextPaginatedList
        items={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimateHeight={40}
        pageSize={10}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next page'));
    });
    expect(screen.getByText('Item 10')).toBeTruthy();
    expect(screen.queryByText('Item 0')).toBeNull();
    expect(screen.getByText('11–20 of 25')).toBeTruthy();
  });

  it('navigates to last page on last button click', async () => {
    const items = makeItems(25);
    render(
      <PretextPaginatedList
        items={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimateHeight={40}
        pageSize={10}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Last page'));
    });
    expect(screen.getByText('Item 20')).toBeTruthy();
    expect(screen.getByText('21–25 of 25')).toBeTruthy();
  });

  it('navigates back to first page on first button click', async () => {
    const items = makeItems(25);
    render(
      <PretextPaginatedList
        items={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimateHeight={40}
        pageSize={10}
      />,
    );
    // go to last page first
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Last page'));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('First page'));
    });
    expect(screen.getByText('Item 0')).toBeTruthy();
    expect(screen.getByText('1–10 of 25')).toBeTruthy();
  });

  it('navigates back on previous page button click', async () => {
    const items = makeItems(25);
    render(
      <PretextPaginatedList
        items={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimateHeight={40}
        pageSize={10}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next page'));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Previous page'));
    });
    expect(screen.getByText('Item 0')).toBeTruthy();
    expect(screen.getByText('1–10 of 25')).toBeTruthy();
  });

  it('changes page size via select and resets to page 1', async () => {
    const items = makeItems(50);
    render(
      <PretextPaginatedList
        items={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimateHeight={40}
        pageSize={10}
        pageSizeOptions={[10, 20, 50]}
      />,
    );
    // go to page 2 first
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next page'));
    });
    expect(screen.getByText('11–20 of 50')).toBeTruthy();

    // change page size — should jump back to page 1
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Page size'), {
        target: { value: '20' },
      });
    });
    expect(screen.getByText('1–20 of 50')).toBeTruthy();
  });

  it('clamps page when items list shrinks', async () => {
    const items = makeItems(25);
    const { rerender } = render(
      <PretextPaginatedList
        items={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimateHeight={40}
        pageSize={10}
      />,
    );
    // go to page 3
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Last page'));
    });
    expect(screen.getByText('21–25 of 25')).toBeTruthy();

    // shrink list to 5 items — page should clamp to 1
    await act(async () => {
      rerender(
        <PretextPaginatedList
          items={makeItems(5)}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          estimateHeight={40}
          pageSize={10}
        />,
      );
    });
    expect(screen.getByText('1–5 of 5')).toBeTruthy();
  });

  it('does not show pagination controls when items list is empty', () => {
    render(
      <PretextPaginatedList
        items={[]}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimateHeight={40}
        pageSize={10}
      />,
    );
    expect(screen.queryByLabelText('Next page')).toBeNull();
    expect(screen.queryByLabelText('First page')).toBeNull();
  });

  it('supports function estimateHeight', () => {
    const items = makeItems(5);
    render(
      <PretextPaginatedList
        items={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimateHeight={(item) => (item as { id: string }).id === 'item-0' ? 80 : 40}
        pageSize={10}
      />,
    );
    expect(screen.getByText('Item 0')).toBeTruthy();
  });

  it('disables first/prev buttons on first page', () => {
    const items = makeItems(25);
    render(
      <PretextPaginatedList
        items={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimateHeight={40}
        pageSize={10}
      />,
    );
    expect(screen.getByLabelText('First page')).toBeDisabled();
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('Next page')).not.toBeDisabled();
    expect(screen.getByLabelText('Last page')).not.toBeDisabled();
  });

  it('disables next/last buttons on last page', async () => {
    const items = makeItems(25);
    render(
      <PretextPaginatedList
        items={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimateHeight={40}
        pageSize={10}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Last page'));
    });
    expect(screen.getByLabelText('Next page')).toBeDisabled();
    expect(screen.getByLabelText('Last page')).toBeDisabled();
  });
});
