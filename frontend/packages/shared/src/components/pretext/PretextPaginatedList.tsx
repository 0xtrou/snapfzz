// Per A001/Performance: paginated list built on PretextList.
// Slices items by page, virtualizes the current page, and renders
// page controls below the list. Reusable across all list views.

import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { PretextList } from './PretextList';

interface PretextPaginatedListProps<T> {
  /** The full list of items (all pages). */
  items: T[];
  /** Render function for a single item. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Stable key for each item. */
  keyExtractor: (item: T, index: number) => string;
  /** Estimated height of each item in px. Can be a number or per-item function. */
  estimateHeight: number | ((item: T) => number);
  /** Items per page. */
  pageSize?: number;
  /** Available page size options shown in the selector. */
  pageSizeOptions?: number[];
  /** Optional CSS class for the outer container. */
  className?: string;
  /** Inline styles for the outer container. Must include a height for PretextList. */
  style?: CSSProperties;
}

export function PretextPaginatedList<T>({
  items,
  renderItem,
  keyExtractor,
  estimateHeight,
  pageSize: initialPageSize = 20,
  pageSizeOptions = [10, 20, 50, 100],
  className,
  style,
}: PretextPaginatedListProps<T>) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Clamp page when items or pageSize change
  const currentPage = Math.min(page, totalPages);
  if (currentPage !== page) setPage(currentPage);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const estimateHeightFn = useCallback(
    typeof estimateHeight === 'function'
      ? estimateHeight
      : () => estimateHeight,
    [estimateHeight],
  );

  const handlePageSizeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = Number(e.target.value);
    setPageSize(newSize);
    setPage(1);
  }, []);

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, items.length);

  return (
    <div className={className} style={style}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <PretextList
          items={pageItems}
          estimateHeight={estimateHeightFn}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          style={{ height: '100%' }}
        />
      </div>

      {items.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 0',
            borderTop: '1px solid var(--border-default)',
            fontSize: 12,
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          <span>
            {startItem}–{endItem} of {items.length}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={pageSize}
              onChange={handlePageSizeChange}
              aria-label="Page size"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 12,
                color: 'var(--text-primary)',
              }}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size} / page</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={currentPage <= 1}
                aria-label="First page"
                style={navBtnStyle}
              >
                {'<<'}
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                aria-label="Previous page"
                style={navBtnStyle}
              >
                {'<'}
              </button>
              <span style={{ padding: '0 8px', lineHeight: '28px' }}>
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                aria-label="Next page"
                style={navBtnStyle}
              >
                {'>'}
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={currentPage >= totalPages}
                aria-label="Last page"
                style={navBtnStyle}
              >
                {'>>'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle: CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-default)',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 12,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  height: 28,
  minWidth: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
