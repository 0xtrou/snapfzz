import { useLayoutEffect, useMemo, useState } from 'react';
import {
  prepare,
  layout,
  prepareWithSegments,
  layoutWithLines,
  type PreparedText,
  type PreparedTextWithSegments,
  type LayoutLine,
  type LayoutLineRange,
} from '@chenglou/pretext';

export type { PreparedText, PreparedTextWithSegments, LayoutLine, LayoutLineRange };

export type PretextOptions = {
  whiteSpace?: 'normal' | 'pre-wrap';
};

export type PretextLayout = {
  height: number;
  lineCount: number;
};

// Per A001/Performance: prepare() in useMemo (once per text change),
// layout() in useLayoutEffect (arithmetic-only on resize).
export function usePreparedText(
  text: string,
  font: string,
  options?: PretextOptions,
): PreparedText {
  const whiteSpace = options?.whiteSpace;
  return useMemo(() => prepare(text, font, whiteSpace ? { whiteSpace } : undefined), [text, font, whiteSpace]);
}

export function usePretextLayout(
  prepared: PreparedText,
  maxWidth: number,
  lineHeight: number,
): PretextLayout {
  const [result, setResult] = useState<PretextLayout>({ height: 0, lineCount: 0 });

  useLayoutEffect(() => {
    if (maxWidth <= 0) return;
    setResult(layout(prepared, maxWidth, lineHeight));
  }, [prepared, maxWidth, lineHeight]);

  return result;
}

export function usePreparedSegments(
  text: string,
  font: string,
  options?: PretextOptions,
): PreparedTextWithSegments {
  const whiteSpace = options?.whiteSpace;
  return useMemo(() => prepareWithSegments(text, font, whiteSpace ? { whiteSpace } : undefined), [text, font, whiteSpace]);
}

export function useSegmentLayout(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  lineHeight: number,
): { height: number; lineCount: number; lines: LayoutLine[] } {
  const [result, setResult] = useState<{ height: number; lineCount: number; lines: LayoutLine[] }>({
    height: 0, lineCount: 0, lines: [],
  });

  useLayoutEffect(() => {
    if (maxWidth <= 0) return;
    setResult(layoutWithLines(prepared, maxWidth, lineHeight));
  }, [prepared, maxWidth, lineHeight]);

  return result;
}

export {
  prepare,
  layout,
  prepareWithSegments,
  layoutWithLines,
};
