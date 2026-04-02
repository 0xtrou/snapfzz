export interface TauriBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
}

export function createTauriBridge(): TauriBridge {
  return {
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
