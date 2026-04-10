// A013/UI/AuditLogTab: Spend logs viewer tests

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuditLogTab from '../../tabs/AuditLogTab';

const mockInvoke = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({
    invoke: vi.fn(),
  }),
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  getSpendLogs: () => mockInvoke(),
}));

describe('A013/UI/AuditLogTab', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('renders loading state initially', () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    render(<AuditLogTab />);
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
  });

  it('shows empty state when no logs', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<AuditLogTab />);
    
    await waitFor(() => {
      expect(screen.getByText('No spend logs found')).toBeInTheDocument();
    });
  });

  it('displays spend logs', async () => {
    mockInvoke.mockResolvedValue([
      {
        request_id: 'req-123',
        api_key: 'sk-test',
        model: 'gpt-4o',
        spend: 0.001234,
        timestamp: '2024-01-15T10:30:00Z',
      },
    ]);
    
    render(<AuditLogTab />);
    
    await waitFor(() => {
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });
  });

  it('renders model filter', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<AuditLogTab />);
    
    await waitFor(() => {
      expect(screen.getByText('Filter by model')).toBeInTheDocument();
    });
  });
});