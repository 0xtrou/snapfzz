import { useEffect, useRef } from 'react';

function invokeWindowCommand(cmd: string) {
  const w = window as unknown as Record<string, unknown>;
  const tauri = w.__TAURI_INTERNALS__ as
    | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
    | undefined;

  if (!tauri) {
    console.warn('[drag]', cmd, '— __TAURI_INTERNALS__ not available at', window.location.href);
    return;
  }

  tauri.invoke(cmd).catch((err) => {
    console.error('[drag]', cmd, 'failed:', err);
  });
}

export function useWindowDrag() {
  const titleBarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const isInTitleBar = (target: HTMLElement) => {
      if (!titleBarRef.current?.contains(target)) return false;
      if (target.closest('input, textarea, button, a, select, [data-no-drag]')) return false;
      return true;
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (!isInTitleBar(e.target as HTMLElement)) return;
      if (e.button !== 0) return;
      e.preventDefault();
      invokeWindowCommand('plugin:window|start_dragging');
    };

    const handleDblClick = (e: MouseEvent) => {
      if (!isInTitleBar(e.target as HTMLElement)) return;
      invokeWindowCommand('plugin:window|internal_toggle_maximize');
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('dblclick', handleDblClick);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('dblclick', handleDblClick);
    };
  }, []);

  return titleBarRef;
}
