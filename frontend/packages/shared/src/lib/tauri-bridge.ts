export interface TauriBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
  isAvailable: boolean;
}

let _invokeCache: ((command: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
let _listenCache:
  | ((event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>)
  | null = null;

export function createTauriBridge(): TauriBridge {
  const isTauri =
    typeof window !== 'undefined' &&
    typeof window.navigator?.userAgent === 'string' &&
    /\btauri\b/i.test(window.navigator.userAgent);

  if (!isTauri) {
    return {
      isAvailable: false,
      invoke: async () => {
        console.warn('[TauriBridge] Not running in Tauri — invoke is a no-op');
        return undefined as never;
      },
      listen: async () => {
        console.warn('[TauriBridge] Not running in Tauri — listen is a no-op');
        return () => {};
      },
    };
  }

  return {
    isAvailable: true,
    // Per A007/TauriIPC: shared bridge is the only frontend-to-Rust invoke path.
    // Dynamic import is lazy-loaded once, then cached for all subsequent invoke calls.
    invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      if (!_invokeCache) {
        const mod = await import('@tauri-apps/api/core');
        _invokeCache = mod.invoke;
      }
      return _invokeCache(command, args) as Promise<T>;
    },
    // Per A007/TauriIPC: shared bridge is the only frontend event subscription path.
    // Dynamic import is lazy-loaded once, then cached for all subsequent listen calls.
    listen: async <T>(event: string, handler: (payload: T) => void): Promise<() => void> => {
      if (!_listenCache) {
        const mod = await import('@tauri-apps/api/event');
        _listenCache = mod.listen;
      }
      const unlisten = await _listenCache(event, (e) => handler(e.payload as T));
      return unlisten;
    },
  };
}
