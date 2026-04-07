import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pretextMock = vi.hoisted(() => ({
  prepare: vi.fn((text: string, font: string, options?: { whiteSpace?: 'normal' | 'pre-wrap' }) => ({ kind: 'prepared', text, font, options })),
  layout: vi.fn((_prepared: unknown, maxWidth: number, lineHeight: number) => ({ height: maxWidth + lineHeight, lineCount: 2 })),
  prepareWithSegments: vi.fn((text: string, font: string, options?: { whiteSpace?: 'normal' | 'pre-wrap' }) => ({ kind: 'segments', text, font, options })),
  layoutWithLines: vi.fn((_prepared: unknown, maxWidth: number, lineHeight: number) => ({
    height: maxWidth + lineHeight,
    lineCount: 3,
    lines: [{ from: 0, to: 4, width: 120 }],
  })),
}));

vi.mock('@chenglou/pretext', () => pretextMock);

describe('pretext hooks', () => {
  beforeEach(() => {
    pretextMock.prepare.mockClear();
    pretextMock.layout.mockClear();
    pretextMock.prepareWithSegments.mockClear();
    pretextMock.layoutWithLines.mockClear();
  });

  it('usePreparedText calls prepare with optional whiteSpace', async () => {
    const { usePreparedText } = await import('./pretext');

    const { result, rerender } = renderHook(({ text, font, whiteSpace }: { text: string; font: string; whiteSpace?: 'normal' | 'pre-wrap' }) =>
      usePreparedText(text, font, whiteSpace ? { whiteSpace } : undefined),
    {
      initialProps: { text: 'hello', font: '14px Inter', whiteSpace: undefined },
    });

    expect(result.current).toEqual({ kind: 'prepared', text: 'hello', font: '14px Inter', options: undefined });
    expect(pretextMock.prepare).toHaveBeenCalledWith('hello', '14px Inter', undefined);

    rerender({ text: 'hello', font: '14px Inter', whiteSpace: 'pre-wrap' });

    expect(pretextMock.prepare).toHaveBeenCalledWith('hello', '14px Inter', { whiteSpace: 'pre-wrap' });
  });

  it('usePretextLayout keeps defaults for non-positive widths and computes layout for positive widths', async () => {
    const { usePreparedText, usePretextLayout } = await import('./pretext');

    const { result, rerender } = renderHook(({ maxWidth }: { maxWidth: number }) => {
      const prepared = usePreparedText('hello', '14px Inter');
      return {
        prepared,
        layout: usePretextLayout(prepared, maxWidth, 20),
      };
    }, {
      initialProps: { maxWidth: 0 },
    });

    expect(result.current.layout).toEqual({ height: 0, lineCount: 0 });

    rerender({ maxWidth: 300 });

    await waitFor(() => {
      expect(result.current.layout).toEqual({ height: 320, lineCount: 2 });
    });
    expect(pretextMock.layout).toHaveBeenCalledWith(result.current.prepared, 300, 20);
  });

  it('usePreparedSegments and useSegmentLayout forward calls and return line data', async () => {
    const {
      usePreparedSegments,
      useSegmentLayout,
      prepare,
      layout,
      prepareWithSegments,
      layoutWithLines,
    } = await import('./pretext');

    const { result } = renderHook(() => {
      const prepared = usePreparedSegments('segmented text', '12px Inter', { whiteSpace: 'pre-wrap' });
      return {
        prepared,
        layout: useSegmentLayout(prepared, 240, 18),
      };
    });

    await waitFor(() => {
      expect(result.current.layout.lineCount).toBe(3);
      expect(result.current.layout.lines).toEqual([{ from: 0, to: 4, width: 120 }]);
    });

    expect(pretextMock.prepareWithSegments).toHaveBeenCalledWith('segmented text', '12px Inter', { whiteSpace: 'pre-wrap' });
    expect(pretextMock.layoutWithLines).toHaveBeenCalledWith(result.current.prepared, 240, 18);

    expect(prepare).toBe(pretextMock.prepare);
    expect(layout).toBe(pretextMock.layout);
    expect(prepareWithSegments).toBe(pretextMock.prepareWithSegments);
    expect(layoutWithLines).toBe(pretextMock.layoutWithLines);
  });
});
