import { useEffect, useRef } from 'react';

export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<T>(event, (e) => handlerRef.current(e.payload)).then((fn) => {
        unlisten = fn;
      });
    });

    return () => unlisten?.();
  }, [event]);
}
