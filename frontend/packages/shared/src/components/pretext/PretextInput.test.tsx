// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pretextMock = vi.hoisted(() => ({
  usePreparedText: vi.fn((_text: string) => ({ prepared: true })),
  usePretextLayout: vi.fn((_prepared: unknown, _width: number, _lineHeight: number) => ({ height: 80, lineCount: 4 })),
}));

const containerWidthMock = vi.hoisted(() => ({
  refObject: { current: null as HTMLDivElement | null },
  width: 320,
}));

vi.mock('../../lib/pretext', () => pretextMock);
vi.mock('./use-container-width', () => ({
  useContainerWidth: () => [containerWidthMock.refObject, containerWidthMock.width],
}));

import { PretextInput } from './PretextInput';

describe('PretextInput', () => {
  beforeEach(() => {
    containerWidthMock.width = 320;
    pretextMock.usePreparedText.mockClear();
    pretextMock.usePretextLayout.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders textarea with computed height and hidden overflow when within max lines', () => {
    const onChange = vi.fn();
    render(<PretextInput value="hello" onChange={onChange} placeholder="Type here" />);

    const textarea = screen.getByPlaceholderText('Type here') as HTMLTextAreaElement;
    expect(textarea.style.height).toBe('108px');
    expect(textarea.style.overflowY).toBe('hidden');
    expect(pretextMock.usePreparedText).toHaveBeenCalledWith('hello', '14px Inter', { whiteSpace: 'pre-wrap' });
    expect(pretextMock.usePretextLayout).toHaveBeenCalledWith({ prepared: true }, 296, 22);
  });

  it('clamps height and enables scrolling when line count exceeds max lines', () => {
    pretextMock.usePretextLayout.mockReturnValue({ height: 200, lineCount: 12 });
    render(<PretextInput value="long text" onChange={vi.fn()} maxLines={3} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.style.height).toBe('86px');
    expect(textarea.style.overflowY).toBe('auto');
  });

  it('propagates value changes and submits on meta/ctrl enter only', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<PretextInput value="draft" onChange={onChange} onSubmit={onSubmit} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'updated' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    expect(onChange).toHaveBeenCalledWith('updated');
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('uses fallback prepared text and minimum one-line height for empty value and zero line layout', () => {
    pretextMock.usePretextLayout.mockReturnValue({ height: 0, lineCount: 0 });

    render(<PretextInput value="" onChange={vi.fn()} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(pretextMock.usePreparedText).toHaveBeenCalledWith(' ', '14px Inter', { whiteSpace: 'pre-wrap' });
    expect(textarea.style.height).toBe('42px');
    expect(textarea.style.overflowY).toBe('hidden');
  });

  it('respects disabled prop', () => {
    render(<PretextInput value="draft" onChange={vi.fn()} disabled />);

    expect(screen.getByRole('textbox')).toHaveProperty('disabled', true);
  });
});
