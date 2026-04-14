// Per A001/Performance: responsive virtualized grid built on PretextList.
// Groups items into rows, virtualizes rows — only visible rows mount in DOM.
// The parent container MUST set a height (via style prop or CSS). PretextGrid
// fills it and virtualizes within that viewport.

import { useCallback, useMemo, type CSSProperties, type ReactNode } from 'react';
import { PretextList } from './PretextList';
import { useContainerWidth } from './use-container-width';

interface PretextGridProps<T> {
  /** The flat list of items to render in a grid. */
  items: T[];
  /** Render function for a single grid cell. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Stable key for each item — must be unique across all items. */
  keyExtractor: (item: T) => string;
  /** Minimum column width in px. Columns expand to fill available space. */
  columnMinWidth: number;
  /** Estimated row height in px. Used by PretextList for offset calculation. */
  rowHeight: number;
  /** Gap between cells in px. Applied both horizontally and vertically. */
  gap?: number;
  /**
   * When true (default), the grid scrolls within its container height.
   * When false, the grid expands to fit all content — no scrollbar.
   * All items still render through PretextList.
   */
  scroll?: boolean;
  /** Number of rows to render beyond the visible viewport. */
  overscan?: number;
  /** Optional CSS class for the outer container. */
  className?: string;
  /**
   * Inline styles for the outer container. When scroll is true, the parent
   * MUST provide a height (e.g. `style={{ height: 600 }}`).
   */
  style?: CSSProperties;
}

interface Row<T> {
  key: string;
  cells: T[];
  startIndex: number;
}

function groupIntoRows<T>(
  items: T[],
  columnsPerRow: number,
): Row<T>[] {
  const rows: Row<T>[] = [];
  for (let i = 0; i < items.length; i += columnsPerRow) {
    const cells = items.slice(i, i + columnsPerRow);
    // Per A001/Performance: positional keys so React reuses row wrappers
    // across filter changes. Cell-level keys (keyExtractor) handle item
    // identity — React.memo on cells then actually works.
    rows.push({
      key: `row-${i / columnsPerRow | 0}`,
      cells,
      startIndex: i,
    });
  }
  return rows;
}

export function PretextGrid<T>({
  items,
  renderItem,
  keyExtractor,
  columnMinWidth,
  rowHeight,
  gap = 12,
  scroll = true,
  overscan = 3,
  className,
  style,
}: PretextGridProps<T>) {
  const [containerRef, containerWidth] = useContainerWidth();

  const columns = useMemo(() => {
    if (containerWidth === 0) return 1;
    return Math.max(1, Math.floor((containerWidth + gap) / (columnMinWidth + gap)));
  }, [containerWidth, columnMinWidth, gap]);

  const rows = useMemo(
    () => groupIntoRows(items, columns),
    [items, columns],
  );

  const cellHeight = rowHeight + gap;
  const totalHeight = rows.length * cellHeight;
  const estimateRowHeight = useCallback(() => cellHeight, [cellHeight]);
  const rowKeyExtractor = useCallback((row: Row<T>) => row.key, []);

  const renderRow = useCallback(
    (row: Row<T>) => (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap,
          height: '100%',
        }}
      >
        {row.cells.map((item, i) => (
          <div key={keyExtractor(item)} style={{ minWidth: 0 }}>
            {renderItem(item, row.startIndex + i)}
          </div>
        ))}
      </div>
    ),
    [columns, gap, keyExtractor, renderItem],
  );

  // scroll=false: expand to fit all content, no scrollbar.
  // Height set to totalHeight so PretextList sees all rows as visible.
  const containerHeight = scroll ? undefined : totalHeight;
  const listStyle: CSSProperties = scroll
    ? { height: '100%' }
    : { height: totalHeight, overflow: 'hidden' };

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', ...style, ...(containerHeight ? { height: containerHeight } : {}) }}
    >
      {containerWidth > 0 && (
        <PretextList
          items={rows}
          estimateHeight={estimateRowHeight}
          renderItem={renderRow}
          keyExtractor={rowKeyExtractor}
          overscan={scroll ? overscan : rows.length}
          style={listStyle}
        />
      )}
    </div>
  );
}
