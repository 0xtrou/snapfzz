// @vitest-environment jsdom
// Spec: A013/Composer — ActionRow: renders icon/label/description + forwards click.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionRow } from './ActionRow';
import type { ComposerAction } from '../contracts';

const MockIcon = () => <svg data-testid="mock-icon" />;

const ACTION: ComposerAction = {
  id: 'upload',
  label: 'Upload files',
  description: 'Attach files',
  Icon: MockIcon,
};

describe('A013/Composer/ActionRow', () => {
  it('A013/ActionRow: renders label, description, and icon', () => {
    render(<ActionRow action={ACTION} onSelect={vi.fn()} />);
    expect(screen.getByText('Upload files')).toBeTruthy();
    expect(screen.getByText('Attach files')).toBeTruthy();
    expect(screen.getByTestId('mock-icon')).toBeTruthy();
  });

  it('A013/ActionRow: forwards click with the action id', () => {
    const onSelect = vi.fn();
    render(<ActionRow action={ACTION} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('composer-action-row'));
    expect(onSelect).toHaveBeenCalledWith('upload');
  });

  it('A013/ActionRow: suppresses onSelect when disabled', () => {
    const onSelect = vi.fn();
    render(<ActionRow action={{ ...ACTION, disabled: true }} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('composer-action-row'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('A013/ActionRow: omits description when not provided', () => {
    render(<ActionRow action={{ ...ACTION, description: undefined }} onSelect={vi.fn()} />);
    expect(screen.queryByText('Attach files')).toBeNull();
  });
});
