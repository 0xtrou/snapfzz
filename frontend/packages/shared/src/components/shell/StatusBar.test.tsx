import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rafState = vi.hoisted(() => ({
  callback: undefined as FrameRequestCallback | undefined,
  id: 0,
}));

describe('StatusBar', () => {
  beforeEach(() => {
    rafState.callback = undefined;
    rafState.id = 0;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafState.callback = cb;
      rafState.id += 1;
      return rafState.id;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children and updates fps counter color based on sampled frames', async () => {
    const { StatusBar } = await import('./StatusBar');
    render(<StatusBar><span>left-status</span></StatusBar>);

    expect(screen.getByText('left-status')).toBeTruthy();
    expect(rafState.callback).toBeTruthy();

    act(() => {
      rafState.callback?.(16);
    });

    const fpsNode = screen.getByText(/fps/);
    expect(fpsNode.textContent).toBe('0 fps');
    expect((fpsNode as HTMLElement).style.color).toBe('var(--color-error)');
  });

  it('cancels animation frame on unmount', async () => {
    const { StatusBar } = await import('./StatusBar');
    const { unmount } = render(<StatusBar />);

    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
