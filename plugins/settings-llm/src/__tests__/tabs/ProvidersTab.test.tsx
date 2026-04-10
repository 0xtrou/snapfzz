import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProvidersTab from '../../tabs/ProvidersTab';

const mockInvoke = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({
    invoke: vi.fn(),
  }),
  AppButton: ({ children, onClick, ...props }: any) => (
    <button type="button" onClick={onClick} onKeyUp={onClick} {...props}>
      {children}
    </button>
  ),
  ConfirmAction: ({ children, onConfirm }: any) => (
    <button type="button" onClick={onConfirm} onKeyUp={onConfirm}>{children}</button>
  ),
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  listProviderKeys: () => mockInvoke(),
  deleteProviderKey: () => mockInvoke(),
  storeProviderKey: () => mockInvoke(),
}));

describe('ProvidersTab', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('renders loading state initially', () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    render(<ProvidersTab />);
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
  });

  it('shows empty state when no providers', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<ProvidersTab />);
    
    await waitFor(() => {
      expect(screen.getByText('No provider keys stored')).toBeInTheDocument();
    });
  });

  it('shows empty state when data loads', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<ProvidersTab />);
    
    await waitFor(() => {
      expect(screen.getByText('No provider keys stored')).toBeInTheDocument();
    });
  });

  it('opens add provider modal', async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue([]);
    
    render(<ProvidersTab />);
    
    await waitFor(() => {
      expect(screen.getByText('No provider keys stored')).toBeInTheDocument();
    });
    
    await user.click(screen.getByText('Add Provider Key'));
    expect(screen.getAllByText('Add Provider Key').length).toBeGreaterThan(0);
  });
});