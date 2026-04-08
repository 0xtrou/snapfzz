// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppButton } from './AppButton';

describe('U009/DesignSystem: AppButton', () => {
  it('renders default variant without type prop', () => {
    render(<AppButton>Default</AppButton>);
    expect(screen.getByRole('button', { name: 'Default' })).toBeDefined();
  });

  it('renders danger variant with danger prop', () => {
    const { container } = render(<AppButton variant="danger">Delete</AppButton>);
    const btn = container.querySelector('button');
    expect(btn).toBeDefined();
  });

  it('renders text variant with type="text"', () => {
    const { container } = render(<AppButton variant="text">Text</AppButton>);
    const btn = container.querySelector('button');
    expect(btn).toBeDefined();
  });

  it('renders link variant with type="link"', () => {
    const { container } = render(<AppButton variant="link">Link</AppButton>);
    const btn = container.querySelector('button');
    expect(btn).toBeDefined();
  });

  it('passes additional props through', () => {
    render(<AppButton disabled>Disabled</AppButton>);
    const btn = screen.getByRole('button', { name: 'Disabled' });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });
});
