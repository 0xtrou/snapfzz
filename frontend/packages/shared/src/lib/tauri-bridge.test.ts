// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  coreModuleLoads: 0,
  eventModuleLoads: 0,
  invokeSpy: vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(),
  listenSpy: vi.fn<(event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>>(),
}));

vi.mock('@tauri-apps/api/core', () => {
  mockState.coreModuleLoads += 1;
  return { invoke: mockState.invokeSpy };
});

vi.mock('@tauri-apps/api/event', () => {
  mockState.eventModuleLoads += 1;
  return { listen: mockState.listenSpy };
});

describe('createTauriBridge', () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.coreModuleLoads = 0;
    mockState.eventModuleLoads = 0;
    mockState.invokeSpy.mockReset().mockResolvedValue(undefined);
    mockState.listenSpy.mockReset().mockResolvedValue(vi.fn());
    delete (window as Window & { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Window & { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__;
  });

  it('returns invoke, listen, and isAvailable', async () => {
    const { createTauriBridge } = await import('./tauri-bridge');

    const bridge = createTauriBridge();

    expect(typeof bridge.invoke).toBe('function');
    expect(typeof bridge.listen).toBe('function');
    expect(typeof bridge.isAvailable).toBe('boolean');
  });

  it('reports unavailable when Tauri internals are missing', async () => {
    const { createTauriBridge } = await import('./tauri-bridge');

    expect(createTauriBridge().isAvailable).toBe(false);
  });

  it('reports available when Tauri internals are present', async () => {
    (window as Window & { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ = {};
    const { createTauriBridge } = await import('./tauri-bridge');

    expect(createTauriBridge().isAvailable).toBe(true);
  });

  it('warns and returns undefined from invoke outside Tauri', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createTauriBridge } = await import('./tauri-bridge');

    const result = await createTauriBridge().invoke('get_settings');

    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('[TauriBridge] Not running in Tauri — invoke is a no-op');
    expect(mockState.coreModuleLoads).toBe(0);
  });

  it('returns a no-op unlisten from listen outside Tauri', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createTauriBridge } = await import('./tauri-bridge');

    const unlisten = await createTauriBridge().listen('settings-changed', vi.fn());

    expect(typeof unlisten).toBe('function');
    expect(() => unlisten()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('[TauriBridge] Not running in Tauri — listen is a no-op');
    expect(mockState.eventModuleLoads).toBe(0);
  });

  it('caches dynamic imports across multiple invoke and listen calls', async () => {
    (window as Window & { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ = {};
    const firstUnlisten = vi.fn();
    const secondUnlisten = vi.fn();
    mockState.invokeSpy.mockResolvedValueOnce('first-result').mockResolvedValueOnce('second-result');
    mockState.listenSpy
      .mockResolvedValueOnce(firstUnlisten)
      .mockResolvedValueOnce(secondUnlisten);

    const { createTauriBridge } = await import('./tauri-bridge');
    const bridge = createTauriBridge();
    const payloads: unknown[] = [];

    await expect(bridge.invoke('first')).resolves.toBe('first-result');
    await expect(bridge.invoke('second', { ok: true })).resolves.toBe('second-result');
    const unlistenOne = await bridge.listen('alpha', (payload) => payloads.push(payload));
    const unlistenTwo = await bridge.listen('beta', (payload) => payloads.push(payload));

    expect(mockState.coreModuleLoads).toBe(1);
    expect(mockState.eventModuleLoads).toBe(1);
    expect(mockState.invokeSpy).toHaveBeenNthCalledWith(1, 'first', undefined);
    expect(mockState.invokeSpy).toHaveBeenNthCalledWith(2, 'second', { ok: true });
    expect(mockState.listenSpy).toHaveBeenCalledTimes(2);

    const [, alphaHandler] = mockState.listenSpy.mock.calls[0];
    const [, betaHandler] = mockState.listenSpy.mock.calls[1];
    alphaHandler({ payload: { id: 1 } });
    betaHandler({ payload: { id: 2 } });

    expect(payloads).toEqual([{ id: 1 }, { id: 2 }]);
    expect(unlistenOne).toBe(firstUnlisten);
    expect(unlistenTwo).toBe(secondUnlisten);
  });
});
