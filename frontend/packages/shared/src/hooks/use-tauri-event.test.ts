// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => ({
  isAvailable: true,
  listen: vi.fn<(event: string, handler: (payload: unknown) => void) => Promise<() => void>>(),
}));

vi.mock('../lib', () => ({
  createTauriBridge: () => bridgeMock,
}));

describe('useTauriEvent', () => {
  beforeEach(() => {
    vi.resetModules();
    bridgeMock.isAvailable = true;
    bridgeMock.listen.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes when bridge is available and forwards payload to latest handler', async () => {
    let captured: ((payload: unknown) => void) | undefined;
    const unlisten = vi.fn();
    bridgeMock.listen.mockImplementation(async (_event, handler) => {
      captured = handler;
      return unlisten;
    });

    const { useTauriEvent } = await import('./use-tauri-event');
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    const { rerender, unmount } = renderHook(({ handler }: { handler: (payload: string) => void }) => {
      useTauriEvent<string>('settings-changed', handler);
    }, {
      initialProps: { handler: firstHandler },
    });

    await waitFor(() => {
      expect(bridgeMock.listen).toHaveBeenCalledWith('settings-changed', expect.any(Function));
    });

    rerender({ handler: secondHandler });

    act(() => {
      captured?.('payload-1');
    });

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledWith('payload-1');

    unmount();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe when bridge is unavailable', async () => {
    bridgeMock.isAvailable = false;
    const { useTauriEvent } = await import('./use-tauri-event');

    renderHook(() => {
      useTauriEvent('settings-changed', vi.fn());
    });

    expect(bridgeMock.listen).not.toHaveBeenCalled();
  });

  it('swallows listen rejection without throwing', async () => {
    bridgeMock.listen.mockRejectedValueOnce(new Error('listen failed'));
    const { useTauriEvent } = await import('./use-tauri-event');

    expect(() => {
      renderHook(() => {
        useTauriEvent('settings-changed', vi.fn());
      });
    }).not.toThrow();

    await waitFor(() => {
      expect(bridgeMock.listen).toHaveBeenCalledTimes(1);
    });
  });
});
