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

  it('renders children and shows error color before one-second sample', async () => {
    let now = 0;
    vi.mocked(performance.now).mockImplementation(() => now);

    const { StatusBar } = await import('./StatusBar');
    render(<StatusBar><span>left-status</span></StatusBar>);

    expect(screen.getByText('left-status')).toBeTruthy();
    expect(rafState.callback).toBeTruthy();

    act(() => {
      now = 16;
      rafState.callback?.(16);
    });

    const fpsNode = screen.getByText(/fps/);
    expect(fpsNode.textContent).toBe('0 fps');
    expect((fpsNode as HTMLElement).style.color).toBe('var(--color-error)');
  });

  it('switches to warning and success colors for 30+ and 55+ fps windows', async () => {
    let now = 0;
    vi.mocked(performance.now).mockImplementation(() => now);

    const { StatusBar } = await import('./StatusBar');
    render(<StatusBar />);

    for (let i = 0; i < 34; i++) {
      act(() => {
        now = 500;
        rafState.callback?.(500);
      });
    }
    act(() => {
      now = 1000;
      rafState.callback?.(1000);
    });

    const fpsNode = screen.getByText('35 fps');
    expect((fpsNode as HTMLElement).style.color).toBe('var(--color-warning)');

    for (let i = 0; i < 54; i++) {
      act(() => {
        now = 1500;
        rafState.callback?.(1500);
      });
    }
    act(() => {
      now = 2000;
      rafState.callback?.(2000);
    });

    const updatedFpsNode = screen.getByText('55 fps');
    expect((updatedFpsNode as HTMLElement).style.color).toBe('var(--color-success)');
  });

  it('cancels animation frame on unmount', async () => {
    const { StatusBar } = await import('./StatusBar');
    const { unmount } = render(<StatusBar />);

    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
