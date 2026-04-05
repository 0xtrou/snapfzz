import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface PretextListProps<T> {
  items: T[];
  estimateHeight: (item: T) => number;
  renderItem: (item: T, index: number) => ReactNode;
  keyExtractor: (item: T, index: number) => string;
  overscan?: number;
  followOutput?: boolean;
  onAtBottomChange?: (atBottom: boolean) => void;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_OVERSCAN = 3;
const AT_BOTTOM_THRESHOLD = 30;

export function PretextList<T>({
  items,
  estimateHeight,
  renderItem,
  keyExtractor,
  overscan = DEFAULT_OVERSCAN,
  followOutput = false,
  onAtBottomChange,
  className,
  style,
}: PretextListProps<T>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const wasAtBottomRef = useRef(true);
  const prevItemCountRef = useRef(0);

  const heights = useMemo(() => items.map(estimateHeight), [items, estimateHeight]);

  const offsets = useMemo(() => {
    const result: number[] = [];
    let offset = 0;
    for (const h of heights) {
      result.push(offset);
      offset += h;
    }
    return result;
  }, [heights]);

  const totalHeight = useMemo(() => {
    if (heights.length === 0) return 0;
    return offsets[offsets.length - 1] + heights[heights.length - 1];
  }, [offsets, heights]);

  const { startIndex, endIndex } = useMemo(() => {
    if (items.length === 0) return { startIndex: 0, endIndex: 0 };

    const viewStart = scrollTop;
    const viewEnd = scrollTop + viewportHeight;

    let start = 0;
    let end = items.length;

    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] + heights[i] >= viewStart) {
        start = i;
        break;
      }
    }

    for (let i = start; i < offsets.length; i++) {
      if (offsets[i] > viewEnd) {
        end = i;
        break;
      }
    }

    start = Math.max(0, start - overscan);
    end = Math.min(items.length, end + overscan);

    return { startIndex: start, endIndex: end };
  }, [items.length, offsets, heights, scrollTop, viewportHeight, overscan]);

  const handleScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD;
    if (atBottom !== wasAtBottomRef.current) {
      wasAtBottomRef.current = atBottom;
      onAtBottomChange?.(atBottom);
    }
  }, [onAtBottomChange]);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight);
    });
    setViewportHeight(el.clientHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!followOutput) return;
    if (items.length <= prevItemCountRef.current) {
      prevItemCountRef.current = items.length;
      return;
    }
    prevItemCountRef.current = items.length;

    if (wasAtBottomRef.current) {
      const el = viewportRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [items.length, followOutput]);

  const visibleItems = useMemo(() => {
    const result: ReactNode[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      const item = items[i];
      const key = keyExtractor(item, i);
      result.push(
        <div
          key={key}
          style={{
            position: 'absolute',
            top: offsets[i],
            left: 0,
            right: 0,
            height: heights[i],
            contain: 'layout style',
          }}
        >
          {renderItem(item, i)}
        </div>,
      );
    }
    return result;
  }, [startIndex, endIndex, items, offsets, heights, keyExtractor, renderItem]);

  return (
    <div
      ref={viewportRef}
      className={className}
      onScroll={handleScroll}
      style={{
        height: '100%',
        overflow: 'auto',
        position: 'relative',
        ...style,
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems}
      </div>
    </div>
  );
}
