import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './events';

describe('createEventBus', () => {
  it('returns bus with on/off/emit', () => {
    const bus = createEventBus();

    expect(typeof bus.on).toBe('function');
    expect(typeof bus.off).toBe('function');
    expect(typeof bus.emit).toBe('function');
  });

  it('on registers handler and emit triggers it', () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.on('topic', handler);
    bus.emit('topic', { ok: true });

    expect(handler).toHaveBeenCalledWith({ ok: true });
  });

  it('off removes handler', () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.on('topic', handler);
    bus.off('topic', handler);
    bus.emit('topic', { ok: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it('multiple handlers on same event all fire and unsubscribe returned by on works', () => {
    const bus = createEventBus();
    const first = vi.fn();
    const second = vi.fn();

    const unsubFirst = bus.on('topic', first);
    bus.on('topic', second);

    bus.emit('topic', 1);
    unsubFirst();
    bus.emit('topic', 2);

    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith(1);
    expect(second).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenNthCalledWith(1, 1);
    expect(second).toHaveBeenNthCalledWith(2, 2);
  });
});
