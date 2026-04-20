// @vitest-environment jsdom
// Spec: A013/Composer — PlusButton renders + forwards click + reflects aria-expanded.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@agentscope-ai/design', () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
}));

import { PlusButton } from './PlusButton';

describe('A013/Composer/PlusButton', () => {
  it('A013/PlusButton: calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<PlusButton open={false} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('composer-plus-button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('A013/PlusButton: reflects open state via aria-expanded', () => {
    const { rerender } = render(<PlusButton open={false} onClick={vi.fn()} />);
    expect(screen.getByTestId('composer-plus-button').getAttribute('aria-expanded')).toBe('false');

    rerender(<PlusButton open={true} onClick={vi.fn()} />);
    expect(screen.getByTestId('composer-plus-button').getAttribute('aria-expanded')).toBe('true');
  });
});
