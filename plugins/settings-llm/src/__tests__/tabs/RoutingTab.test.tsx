// A013/UI/RoutingTab: Model routing configuration tests

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RoutingTab from '../../tabs/RoutingTab';

describe('A013/UI/RoutingTab', () => {
  it('renders coming soon message', () => {
    render(<RoutingTab />);
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('shows planned features', () => {
    render(<RoutingTab />);
    expect(screen.getByText(/Model group aliases/)).toBeInTheDocument();
    expect(screen.getByText(/Routing strategies/)).toBeInTheDocument();
    expect(screen.getByText(/Fallback rules/)).toBeInTheDocument();
  });
});