import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pretextMock = vi.hoisted(() => ({
  usePreparedText: vi.fn((_text: string, _font: string) => ({ kind: 'prepared' })),
  usePretextLayout: vi.fn((_prepared: unknown, width: number, lineHeight: number) => ({
    height: width > 0 ? lineHeight * 2 : 0,
    lineCount: width > 0 ? 2 : 0,
  })),
}));

const containerWidthMock = vi.hoisted(() => ({
  refObject: { current: null as HTMLDivElement | null },
  width: 400,
}));

vi.mock('../../lib/pretext', () => pretextMock);
vi.mock('./use-container-width', () => ({
  useContainerWidth: () => [containerWidthMock.refObject, containerWidthMock.width],
}));

import { PretextText } from './PretextText';

describe('PretextText', () => {
  beforeEach(() => {
    containerWidthMock.width = 400;
    pretextMock.usePreparedText.mockClear();
    pretextMock.usePretextLayout.mockClear();
  });

  it('renders text with computed height, line-height and default font', () => {
    render(<PretextText text="hello world" />);

    const node = screen.getByText('hello world');
    expect(node).toBeTruthy();
    expect((node as HTMLElement).style.height).toBe('44px');
    expect((node as HTMLElement).style.font).toContain('Inter');
    expect(pretextMock.usePreparedText).toHaveBeenCalledWith('hello world', '14px Inter');
    expect(pretextMock.usePretextLayout).toHaveBeenCalledWith({ kind: 'prepared' }, 400, 22);
  });

  it('allows overriding font/lineHeight and omits height when layout returns 0', () => {
    pretextMock.usePretextLayout.mockReturnValueOnce({ height: 0, lineCount: 0 });

    render(<PretextText text="custom" font="16px Fira Code" lineHeight={30} />);

    const node = screen.getByText('custom') as HTMLElement;
    expect(node.style.height).toBe('');
    expect(node.style.font).toContain('Fira Code');
    expect(pretextMock.usePretextLayout).toHaveBeenCalledWith({ kind: 'prepared' }, 400, 30);
  });
});
