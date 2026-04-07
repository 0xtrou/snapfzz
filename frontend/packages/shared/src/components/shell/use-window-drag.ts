import { useEffect, useRef } from 'react';
import { createTauriBridge } from '../../lib';

const bridge = createTauriBridge();

function invokeWindowCommand(cmd: string) {
  if (!bridge.isAvailable) return;
  bridge.invoke(cmd).catch(() => {
    void 0;
  });
}

export function useWindowDrag() {
  const titleBarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let clickCount = 0;
    let clickTimer: ReturnType<typeof setTimeout> | null = null;

    const isInTitleBar = (target: HTMLElement) => {
      if (!titleBarRef.current?.contains(target)) return false;
      if (target.closest('input, textarea, button, a, select, [data-no-drag]')) return false;
      return true;
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (!isInTitleBar(e.target as HTMLElement)) return;
      if (e.button !== 0) return;
      e.preventDefault();

      clickCount++;

      if (clickCount === 1) {
        clickTimer = setTimeout(() => {
          if (clickCount === 1) {
            invokeWindowCommand('plugin:window|start_dragging');
          }
          clickCount = 0;
        }, 200);
      } else if (clickCount === 2) {
        if (clickTimer) clearTimeout(clickTimer);
        clickCount = 0;
        invokeWindowCommand('plugin:window|internal_toggle_maximize');
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      if (clickTimer) clearTimeout(clickTimer);
    };
  }, []);

  return titleBarRef;
}
