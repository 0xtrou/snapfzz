// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsHeader } from './SettingsHeader';

describe('SettingsHeader', () => {
  it('renders title', () => {
    render(<SettingsHeader title="General Settings" />);

    expect(screen.getByRole('heading', { name: 'General Settings' })).toBeTruthy();
  });

  it('shows Save and Discard when dirty and handlers exist', () => {
    render(
      <SettingsHeader
        title="General"
        isDirty
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy();
  });

  it('hides Save and Discard when not dirty and no onSave', () => {
    render(<SettingsHeader title="General" isDirty={false} />);

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
  });

  it('calls onSave and onDiscard handlers', () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();

    render(
      <SettingsHeader
        title="General"
        isDirty
        onSave={onSave}
        onDiscard={onDiscard}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('disables save button when saving or not dirty', () => {
    const { rerender } = render(
      <SettingsHeader title="General" isDirty saving onSave={vi.fn()} onDiscard={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Saving...' })).toHaveProperty('disabled', true);

    rerender(<SettingsHeader title="General" isDirty={false} onSave={vi.fn()} onDiscard={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  });

  it('renders subtitle when provided', () => {
    render(<SettingsHeader title="General" subtitle="Configure your app" />);

    expect(screen.getByText('Configure your app')).toBeTruthy();
  });

  it('shows saveSuccess indicator when saveSuccess is true', () => {
    render(<SettingsHeader title="General" saveSuccess onSave={vi.fn()} />);

    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('shows saveError message when saveError is provided', () => {
    render(<SettingsHeader title="General" saveError="Something went wrong" onSave={vi.fn()} />);

    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('renders children inside header actions area', () => {
    render(
      <SettingsHeader title="General" onSave={vi.fn()}>
        <span data-testid="custom-child">Custom</span>
      </SettingsHeader>,
    );

    expect(screen.getByTestId('custom-child')).toBeTruthy();
  });
});
