import mitt, { type Emitter } from 'mitt';

export type AppEvents = Record<string, unknown>;

export interface EventBus {
  emit<K extends string>(topic: K, payload: unknown): void;
  on<K extends string>(topic: K, handler: (payload: unknown) => void): () => void;
  off<K extends string>(topic: K, handler: (payload: unknown) => void): void;
}

export function createEventBus(): EventBus {
  const emitter: Emitter<AppEvents> = mitt();

  return {
    emit: (topic, payload) => emitter.emit(topic, payload),
    on: (topic, handler) => {
      emitter.on(topic, handler);
      return () => emitter.off(topic, handler);
    },
    off: (topic, handler) => emitter.off(topic, handler),
  };
}
