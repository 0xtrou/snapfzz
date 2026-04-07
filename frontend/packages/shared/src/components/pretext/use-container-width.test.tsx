import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

  it('reads clientWidth and updates from ResizeObserver callback when ref is attached', async () => {
    let triggerResize: ((width: number) => void) | undefined;

    class ResizeObserverMock {
      constructor(callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
        triggerResize = (width: number) => callback([{ contentRect: { width } }]);
      }

      observe() {}

      disconnect() {}
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

    render(<Probe />);

    await waitFor(() => {
      expect(Number(screen.getByTestId('width').textContent)).toBe(240);
    });

    act(() => {
      triggerResize?.(512);
    });

    expect(Number(screen.getByTestId('width').textContent)).toBe(512);
  });
});
