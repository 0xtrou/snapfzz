// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('antd', () => ({
  Button: ({ children, danger, type, ...props }: { children?: React.ReactNode; danger?: boolean; type?: string } & Record<string, unknown>) => (
    <button
      data-testid={(props['data-testid'] as string) ?? 'app-button'}
      data-danger={danger ? 'yes' : 'no'}
      data-type={type ?? ''}
      {...props}
    >
      {children}
    </button>
  ),
}));

vi.mock('@ant-design/icons', () => ({
  RocketOutlined: ({ title }: { title?: string }) => <span>{title ?? 'rocket-icon'}</span>,
  MissingOutlined: undefined,
}));

import { AntIcon } from './AntIcon';
import { AppButton } from './AppButton';

describe('AntIcon', () => {
  it('renders matching icon component by name', () => {
    render(<AntIcon name="RocketOutlined" title="launch" />);

    expect(screen.getByText('launch')).toBeTruthy();
  });

  it('returns null for unknown icon names', () => {
    const { container } = render(<AntIcon name="MissingOutlined" />);

    expect(container.firstChild).toBeNull();
  });
});

describe('AppButton', () => {
  it('maps danger, text, link, and default variants to button props', () => {
    const { rerender } = render(<AppButton variant="danger" data-testid="danger">Delete</AppButton>);
    expect(screen.getByTestId('danger')).toHaveAttribute('data-danger', 'yes');
    expect(screen.getByTestId('danger')).toHaveAttribute('data-type', '');

    rerender(<AppButton variant="text" data-testid="text">Text</AppButton>);
    expect(screen.getByTestId('text')).toHaveAttribute('data-danger', 'no');
    expect(screen.getByTestId('text')).toHaveAttribute('data-type', 'text');

    rerender(<AppButton variant="link" data-testid="link">Link</AppButton>);
    expect(screen.getByTestId('link')).toHaveAttribute('data-danger', 'no');
    expect(screen.getByTestId('link')).toHaveAttribute('data-type', 'link');

    rerender(<AppButton data-testid="default">Default</AppButton>);
    expect(screen.getByTestId('default')).toHaveAttribute('data-danger', 'no');
    expect(screen.getByTestId('default')).toHaveAttribute('data-type', '');
  });
});
