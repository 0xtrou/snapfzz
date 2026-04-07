export interface TauriBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
  isAvailable: boolean;
}

let _invokeCache: ((command: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
let _listenCache:
  | ((event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>)
  | null = null;

function isTauriAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function createTauriBridge(): TauriBridge {
  return {
    get isAvailable() {
      return isTauriAvailable();
    },
    invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      if (!isTauriAvailable()) {
        console.warn('[TauriBridge] Not running in Tauri — invoke is a no-op');
        return undefined as never;
      }
      if (!_invokeCache) {
        const mod = await import('@tauri-apps/api/core');
        _invokeCache = mod.invoke;
      }
      return _invokeCache(command, args) as Promise<T>;
    },
    listen: async <T>(event: string, handler: (payload: T) => void): Promise<() => void> => {
      if (!isTauriAvailable()) {
        console.warn('[TauriBridge] Not running in Tauri — listen is a no-op');
        return () => {};
      }
      if (!_listenCache) {
        const mod = await import('@tauri-apps/api/event');
        _listenCache = mod.listen;
      }
      const unlisten = await _listenCache(event, (e) => handler(e.payload as T));
      return unlisten;
    },
  };
}
