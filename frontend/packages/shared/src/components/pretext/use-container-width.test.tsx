import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useContainerWidth } from './use-container-width';

describe('useContainerWidth', () => {
  it('keeps width at 0 when ref is not attached', () => {
    const Probe = () => {
      const [, width] = useContainerWidth();
      return <span data-testid="width">{width}</span>;
    };

    render(<Probe />);

    expect(Number(screen.getByTestId('width').textContent)).toBe(0);
  });

  it('reads clientWidth, updates on resize entries, ignores empty entries, and disconnects on unmount', async () => {
    let triggerResize: ((width: number) => void) | undefined;
    let triggerEmpty: (() => void) | undefined;
    const disconnectSpy = vi.fn();

    class ResizeObserverMock {
      constructor(callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
        triggerResize = (width: number) => callback([{ contentRect: { width } }]);
        triggerEmpty = () => callback([]);
      }

      observe() {}

      disconnect() {
        disconnectSpy();
      }
    }

    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });

    Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 240,
    });

    const Probe = () => {
      const [ref, width] = useContainerWidth();
      return (
        <>
          <div ref={ref} />
          <span data-testid="width">{width}</span>
        </>
      );
    };

    const { unmount } = render(<Probe />);

    await waitFor(() => {
      expect(Number(screen.getByTestId('width').textContent)).toBe(240);
    });

    act(() => {
      triggerResize?.(512);
    });

    expect(Number(screen.getByTestId('width').textContent)).toBe(512);

    act(() => {
      triggerEmpty?.();
    });

    expect(Number(screen.getByTestId('width').textContent)).toBe(512);

    unmount();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
