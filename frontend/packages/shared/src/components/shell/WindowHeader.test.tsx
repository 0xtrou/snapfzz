import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WindowHeader } from './WindowHeader';

describe('WindowHeader', () => {
  it('renders title, children, logo, and dark-theme sun icon', () => {
    const titleBarRef = { current: null };

    render(
      <WindowHeader titleBarRef={titleBarRef} theme="dark" toggleTheme={vi.fn()} title="Snapfzz" >
        <span>extra-header-content</span>
      </WindowHeader>,
    );

    expect(screen.getByText('Snapfzz')).toBeTruthy();
    expect(screen.getByText('extra-header-content')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Snapfzz' })).toBeTruthy();
    expect(screen.getByLabelText('sun')).toBeTruthy();
  });

  it('uses moon icon for non-dark themes and triggers toggleTheme on click', () => {
    const toggleTheme = vi.fn();

    render(
      <WindowHeader titleBarRef={{ current: null }} theme="light" toggleTheme={toggleTheme} />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByLabelText('moon')).toBeTruthy();
    expect(toggleTheme).toHaveBeenCalledTimes(1);
  });

  it('omits title span when title prop is missing', () => {
    render(<WindowHeader titleBarRef={{ current: null }} theme="dark" toggleTheme={vi.fn()} />);

    expect(screen.queryByText('Snapfzz')).toBeNull();
  });
});
