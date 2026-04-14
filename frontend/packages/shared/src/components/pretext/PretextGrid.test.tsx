// @vitest-environment jsdom

// Spec: A001-performance-architecture.md
// Section: Chat: Pretext-Powered Virtualization
// Verifies: PretextGrid groups items into rows, virtualizes via PretextList,
//           responds to container width for column count, and renders cells.

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PretextGrid } from './PretextGrid';

// Mock useContainerWidth to return a stable width (no real ResizeObserver in jsdom)
vi.mock('./use-container-width', () => ({
  useContainerWidth: () => {
    const ref = { current: null };
    return [ref, 600]; // 600px container
  },
}));

interface TestItem {
  id: string;
  label: string;
}

const items: TestItem[] = Array.from({ length: 10 }, (_, i) => ({
  id: `model-${i}`,
  label: `Model ${i}`,
}));

describe('A001/PretextGrid', () => {
  it('A001/grid: renders items in a virtualized grid', () => {
    render(
      <div style={{ height: 400 }}>
        <PretextGrid
          items={items}
          renderItem={(item) => <div data-testid={`cell-${item.id}`}>{item.label}</div>}
          keyExtractor={(item) => item.id}
          columnMinWidth={240}
          rowHeight={100}
        />
      </div>,
    );

    // 600px container, 240px min columns, 12px gap → floor((600+12)/(240+12)) = 2 columns
    // 10 items / 2 cols = 5 rows. All should render (viewport is 400px, rows are 112px each).
    expect(screen.getByText('Model 0')).toBeTruthy();
    expect(screen.getByText('Model 1')).toBeTruthy();
  });

  it('A001/grid/rows: groups items into rows matching column count', () => {
    const { container } = render(
      <div style={{ height: 400 }}>
        <PretextGrid
          items={items}
          renderItem={(item) => <div>{item.label}</div>}
          keyExtractor={(item) => item.id}
          columnMinWidth={240}
          rowHeight={100}
          gap={12}
        />
      </div>,
    );

    // Each row should be a CSS grid with 2 columns
    const grids = container.querySelectorAll('div[style*="grid-template-columns"]');
    expect(grids.length).toBeGreaterThan(0);

    const firstGrid = grids[0] as HTMLElement;
    expect(firstGrid.style.gridTemplateColumns).toBe('repeat(2, 1fr)');
  });

  it('A001/grid/remainder: last row renders fewer cells when items dont fill', () => {
    const oddItems = items.slice(0, 5); // 5 items, 2 cols → last row has 1 item

    render(
      <div style={{ height: 400 }}>
        <PretextGrid
          items={oddItems}
          renderItem={(item) => <div>{item.label}</div>}
          keyExtractor={(item) => item.id}
          columnMinWidth={240}
          rowHeight={100}
        />
      </div>,
    );

    // All 5 items should render
    for (let i = 0; i < 5; i++) {
      expect(screen.getByText(`Model ${i}`)).toBeTruthy();
    }
  });

  it('A001/grid/empty: renders nothing for empty items', () => {
    const { container } = render(
      <div style={{ height: 400 }}>
        <PretextGrid
          items={[]}
          renderItem={() => <div>cell</div>}
          keyExtractor={() => 'x'}
          columnMinWidth={240}
          rowHeight={100}
        />
      </div>,
    );

    expect(screen.queryByText('cell')).toBeNull();
    // The PretextList should still mount (empty state)
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('A001/grid/style: passes className and style to outer container', () => {
    const { container } = render(
      <div style={{ height: 400 }}>
        <PretextGrid
          items={items.slice(0, 2)}
          renderItem={(item) => <div>{item.label}</div>}
          keyExtractor={(item) => item.id}
          columnMinWidth={240}
          rowHeight={100}
          className="my-grid"
          style={{ maxHeight: 300 }}
        />
      </div>,
    );

    const outer = container.querySelector('.my-grid') as HTMLElement;
    expect(outer).toBeTruthy();
    expect(outer.style.maxHeight).toBe('300px');
  });

  it('A001/grid/index: passes correct flat index to renderItem', () => {
    const indices: number[] = [];

    render(
      <div style={{ height: 400 }}>
        <PretextGrid
          items={items.slice(0, 4)}
          renderItem={(item, index) => {
            indices.push(index);
            return <div>{item.label}</div>;
          }}
          keyExtractor={(item) => item.id}
          columnMinWidth={240}
          rowHeight={100}
        />
      </div>,
    );

    // 4 items, 2 cols → 2 rows. Indices should be 0,1,2,3
    expect(indices).toEqual(expect.arrayContaining([0, 1, 2, 3]));
  });
});
