// A013/UI/RoutingTab: Combo-based routing configuration tests

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RoutingTab from '../../tabs/RoutingTab';

vi.mock('@snapfzz/shared', () => ({
  fetchWithToast: async (fn: () => Promise<unknown>) => {
    try { return { data: await fn() }; } catch (err) { return { error: err instanceof Error ? err : new Error(String(err)) }; }
  },
  AppButton: ({ children, onClick, disabled, loading }: any) => (
    <button type="button" onClick={onClick} disabled={disabled || loading}>{children}</button>
  ),
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  getBaseUrl: () => Promise.resolve('http://127.0.0.1:4000'),
  getMasterKey: () => Promise.resolve('sk-master-test'),
  getConfig: () => Promise.resolve({ router_settings: { routing_strategy: 'simple-shuffle' } }),
  updateConfig: () => Promise.resolve({}),
  getModelGroups: () => Promise.resolve(['solo-engineer/coder', 'solo-engineer-test/codex']),
  getModelInfo: () => Promise.resolve({ data: [] }),
  deleteModel: () => Promise.resolve(),
  loadCustomProviders: () => Promise.resolve([]),
}));

describe('A013/UI/RoutingTab', () => {
  it('renders combo list section after loading', async () => {
    render(<RoutingTab />);
    await waitFor(() => {
      expect(screen.getByText(/Create Combo/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows routing management description', async () => {
    render(<RoutingTab />);
    await waitFor(() => {
      expect(screen.getByText(/routing/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
