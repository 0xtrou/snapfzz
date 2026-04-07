import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWindowDrag } from './use-window-drag';

const bridgeMock = vi.hoisted(() => ({
  isAvailable: true,
  invoke: vi.fn<(cmd: string) => Promise<unknown>>(),
}));

vi.mock('../../lib', () => ({
  createTauriBridge: () => bridgeMock,
}));

describe('useWindowDrag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    bridgeMock.isAvailable = true;
    bridgeMock.invoke.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function mountWithTitleBar() {
    const { result, unmount } = renderHook(() => useWindowDrag());

    const titleBar = document.createElement('div');
    const child = document.createElement('span');
    titleBar.appendChild(child);
    document.body.appendChild(titleBar);

    act(() => {
      result.current.current = titleBar as HTMLElement;
    });

    return { unmount, titleBar, child };
  }

  it('starts dragging on single left-click in title bar', () => {
    const { child } = mountWithTitleBar();

    child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(bridgeMock.invoke).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);

    expect(bridgeMock.invoke).toHaveBeenCalledWith('plugin:window|start_dragging');
  });

  it('toggles maximize on double click and cancels drag timer', () => {
    const { child } = mountWithTitleBar();

    child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));

    expect(bridgeMock.invoke).toHaveBeenCalledWith('plugin:window|internal_toggle_maximize');

    vi.runAllTimers();
    expect(bridgeMock.invoke).toHaveBeenCalledTimes(1);
  });

  it('ignores non-title-bar and interactive targets', () => {
    const { titleBar } = mountWithTitleBar();
    const input = document.createElement('input');
    titleBar.appendChild(input);

    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    titleBar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 1 }));

    vi.runAllTimers();

    expect(bridgeMock.invoke).not.toHaveBeenCalled();
  });

  it('no-ops when bridge unavailable and swallows invoke rejection', async () => {
    const { child } = mountWithTitleBar();

    bridgeMock.isAvailable = false;
    child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    vi.runAllTimers();
    expect(bridgeMock.invoke).not.toHaveBeenCalled();

    bridgeMock.isAvailable = true;
    bridgeMock.invoke.mockRejectedValueOnce(new Error('drag failed'));
    child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(() => vi.runAllTimers()).not.toThrow();
    await Promise.resolve();
    expect(bridgeMock.invoke).toHaveBeenCalledWith('plugin:window|start_dragging');
  });

  it('cleans up listeners and pending timer on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { child, unmount } = mountWithTitleBar();

    child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    unmount();

    vi.runAllTimers();
    expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(bridgeMock.invoke).not.toHaveBeenCalled();
  });
});
