// A013/UI/RoutingTab: Model routing configuration tests

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RoutingTab from '../../tabs/RoutingTab';

const { mockGetBaseUrl, mockGetMasterKey, mockGetConfig, mockGetModelGroups, mockUpdateConfig } = vi.hoisted(() => ({
  mockGetBaseUrl: vi.fn(),
  mockGetMasterKey: vi.fn(),
  mockGetConfig: vi.fn(),
  mockGetModelGroups: vi.fn(),
  mockUpdateConfig: vi.fn(),
}));

vi.mock('@snapfzz/shared', () => ({
  fetchWithToast: async (fn: () => Promise<unknown>) => {
    try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err : new Error(String(err)) }; }
  },
  AppButton: ({ children, onClick, disabled, loading }: any) => (
    <button type="button" onClick={onClick} disabled={disabled || loading}>{children}</button>
  ),
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  getBaseUrl: () => mockGetBaseUrl(),
  getMasterKey: () => mockGetMasterKey(),
  getConfig: (...args: unknown[]) => mockGetConfig(...args),
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
  getModelGroups: (...args: unknown[]) => mockGetModelGroups(...args),
}));

describe('A013/UI/RoutingTab', () => {
  beforeEach(() => {
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
    mockGetConfig.mockResolvedValue({
      router_settings: {
        routing_strategy: 'simple-shuffle',
        fallbacks: [],
        model_group_alias: {},
      },
    });
    mockGetModelGroups.mockResolvedValue(['gpt-4o', 'claude-3-5-sonnet']);
    mockUpdateConfig.mockResolvedValue({});
  });

  it('renders routing strategy section after loading', async () => {
    render(<RoutingTab />);
    await waitFor(() => {
      expect(screen.getByText('Routing Strategy')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders fallback chains section after loading', async () => {
    render(<RoutingTab />);
    await waitFor(() => {
      expect(screen.getByText('Fallback Chains')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders model aliases section after loading', async () => {
    render(<RoutingTab />);
    await waitFor(() => {
      expect(screen.getByText('Model Aliases')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows active strategy badge for configured strategy', async () => {
    render(<RoutingTab />);
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
