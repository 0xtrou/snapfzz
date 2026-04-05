import { useLayoutEffect, useRef, useState } from 'react';

export function useContainerWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });

    setWidth(el.clientWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
