// @vitest-environment jsdom
// Spec: chat/SPEC.md — empty-state hero + suggestion click.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@agentscope-ai/chat', () => ({
  WelcomePrompts: ({
    prompts,
    onClick,
    greeting,
  }: {
    prompts: Array<{ value: string }>;
    onClick: (v: string) => void;
    greeting?: string;
  }) => (
    <div data-testid="welcome" data-greeting={greeting}>
      {prompts.map((p) => (
        <button key={p.value} type="button" onClick={() => onClick(p.value)}>
          {p.value}
        </button>
      ))}
    </div>
  ),
}));

import { EmptyHero } from './EmptyHero';

describe('chat/ChatPanel/parts/EmptyHero', () => {
  const suggestions = [{ value: 'one' }, { value: 'two' }] as const;

  it('renders the greeting and suggestion buttons', () => {
    render(<EmptyHero suggestions={suggestions} onPick={vi.fn()} />);
    expect(screen.getByTestId('welcome').getAttribute('data-greeting')).toBe(
      'What do you want to build?',
    );
    expect(screen.getByText('one')).toBeTruthy();
    expect(screen.getByText('two')).toBeTruthy();
  });

  it('calls onPick with the suggestion value', () => {
    const onPick = vi.fn();
    render(<EmptyHero suggestions={suggestions} onPick={onPick} />);
    fireEvent.click(screen.getByText('one'));
    expect(onPick).toHaveBeenCalledWith('one');
  });

  it('swallows picks when disabled', () => {
    const onPick = vi.fn();
    render(<EmptyHero suggestions={suggestions} onPick={onPick} disabled />);
    fireEvent.click(screen.getByText('one'));
    expect(onPick).not.toHaveBeenCalled();
  });
});
