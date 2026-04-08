// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PretextBubble } from './PretextBubble';

describe('PretextBubble', () => {
  it('uses assistant defaults', () => {
    render(<PretextBubble>assistant message</PretextBubble>);

    const bubble = screen.getByText('assistant message').closest('article');
    expect(bubble).toBeTruthy();
    expect((bubble as HTMLElement).style.marginTop).toBe('14px');
    expect((bubble as HTMLElement).style.background).toBe('var(--bg-subtle)');
  });

  it('uses grouped spacing and user/system variant styles', () => {
    const { rerender } = render(
      <PretextBubble variant="user" grouped>
        user message
      </PretextBubble>,
    );

    let bubble = screen.getByText('user message').closest('article') as HTMLElement;
    expect(bubble.style.marginTop).toBe('6px');
    expect(bubble.style.background).toBe('var(--bg-default)');

    rerender(
      <PretextBubble variant="system">
        system message
      </PretextBubble>,
    );

    bubble = screen.getByText('system message').closest('article') as HTMLElement;
    expect(bubble.style.background).toBe('var(--bg-subtle)');
    expect(bubble.style.opacity).toBe('0.8');
  });
});
