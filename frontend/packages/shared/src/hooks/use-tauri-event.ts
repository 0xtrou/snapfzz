import { useEffect, useRef } from 'react';
import { createTauriBridge } from '../lib';

const bridge = createTauriBridge();

export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!bridge.isAvailable) return;

    let unlisten: (() => void) | undefined;

    bridge.listen<T>(event, (payload) => {
      handlerRef.current(payload);
    }).then((fn) => {
      unlisten = fn;
    }).catch(() => {
      void 0;
    });

    return () => unlisten?.();
  }, [event]);
}
