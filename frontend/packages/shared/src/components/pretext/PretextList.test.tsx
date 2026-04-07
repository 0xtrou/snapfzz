import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PretextList } from './PretextList';

const items = Array.from({ length: 6 }, (_, i) => ({ id: `item-${i}`, value: `Value ${i}` }));

describe('PretextList', () => {
  it('renders visible items and emits at-bottom transitions on scroll', () => {
    const onAtBottomChange = vi.fn();

    render(
      <div style={{ height: 300 }}>
        <PretextList
          items={items}
          estimateHeight={() => 40}
          renderItem={(item) => <div>{item.value}</div>}
          keyExtractor={(item) => item.id}
          overscan={1}
          onAtBottomChange={onAtBottomChange}
        />
      </div>,
    );

    const viewport = screen.getByText('Value 0').closest('div[style*="overflow: auto"]') as HTMLDivElement;
    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 400 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(viewport, 'scrollTop', { configurable: true, value: 50, writable: true });

    fireEvent.scroll(viewport);
    expect(onAtBottomChange).toHaveBeenCalledWith(false);

    Object.defineProperty(viewport, 'scrollTop', { configurable: true, value: 210, writable: true });
    fireEvent.scroll(viewport);
    expect(onAtBottomChange).toHaveBeenCalledWith(true);
  });

  it('handles empty lists', () => {
    const { container } = render(
      <PretextList
        items={[]}
        estimateHeight={() => 40}
        renderItem={(item) => <div>{String(item)}</div>}
        keyExtractor={(_, index) => `k-${index}`}
      />,
    );

    const wrappers = container.querySelectorAll('div');
    const hasZeroHeightNode = Array.from(wrappers).some((node) => (node as HTMLElement).style.height === '0px');
    expect(hasZeroHeightNode).toBe(true);
  });

  it('auto-scrolls when followOutput is true and list grows while at bottom', () => {
    const scrollToSpy = vi.spyOn(HTMLElement.prototype, 'scrollTo');
    const baseItems = items.slice(0, 2);

    const { rerender } = render(
      <PretextList
        items={baseItems}
        estimateHeight={() => 50}
        renderItem={(item) => <div>{item.value}</div>}
        keyExtractor={(item) => item.id}
        followOutput
      />,
    );

    const viewport = screen.getByText('Value 0').closest('div[style*="overflow: auto"]') as HTMLDivElement;
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 600 });

    rerender(
      <PretextList
        items={items}
        estimateHeight={() => 50}
        renderItem={(item) => <div>{item.value}</div>}
        keyExtractor={(item) => item.id}
        followOutput
      />,
    );

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 600, behavior: 'smooth' });
  });

  it('does not auto-scroll when followOutput is false or when list shrinks', () => {
    const scrollToSpy = vi.spyOn(HTMLElement.prototype, 'scrollTo');

    const { rerender } = render(
      <PretextList
        items={items}
        estimateHeight={() => 40}
        renderItem={(item) => <div>{item.value}</div>}
        keyExtractor={(item) => item.id}
        followOutput={false}
      />,
    );

    const initialCalls = scrollToSpy.mock.calls.length;

    rerender(
      <PretextList
        items={[items[0]]}
        estimateHeight={() => 40}
        renderItem={(item) => <div>{item.value}</div>}
        keyExtractor={(item) => item.id}
        followOutput={false}
      />,
    );

    expect(scrollToSpy.mock.calls.length).toBe(initialCalls);
  });

  it('renders from non-zero startIndex path with limited viewport and overscan', () => {
    render(
      <div style={{ height: 140 }}>
        <PretextList
          items={items}
          estimateHeight={() => 40}
          renderItem={(item) => <div>{item.value}</div>}
          keyExtractor={(item) => item.id}
          overscan={0}
        />
      </div>,
    );

    const viewport = screen.getByText('Value 0').closest('div[style*="overflow: auto"]') as HTMLDivElement;
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 240 });
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 80 });
    Object.defineProperty(viewport, 'scrollTop', { configurable: true, value: 120, writable: true });

    act(() => {
      fireEvent.scroll(viewport);
    });

    expect(screen.getByText('Value 3')).toBeTruthy();
  });
});
