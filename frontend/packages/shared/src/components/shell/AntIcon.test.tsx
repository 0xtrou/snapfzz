// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ant-design/icons', () => ({
  RocketOutlined: ({ title }: { title?: string }) => <span>{title ?? 'rocket-icon'}</span>,
  MissingOutlined: undefined,
}));

import { AntIcon } from './AntIcon';

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
