export interface TauriBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
  isAvailable: boolean;
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function createTauriBridge(): TauriBridge {
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
    invoke: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke<T>(command, args);
    },
    listen: async <T>(event: string, handler: (payload: T) => void): Promise<() => void> => {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<T>(event, (e) => handler(e.payload));
      return unlisten;
    },
  };
}
