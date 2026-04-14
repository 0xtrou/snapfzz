// A013/UI: LlmSettings component tests

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import LlmSettings from '../LlmSettings';

vi.mock('@snapfzz/shared', () => ({
  SettingsHeader: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  ),
  createTauriBridge: () => ({
    invoke: vi.fn(),
  }),
  PretextGrid: ({ items, renderItem, keyExtractor }: any) => (
    <div data-testid="pretext-grid">
      {(items ?? []).map((item: any, i: number) => (
        <div key={keyExtractor(item)}>{renderItem(item, i)}</div>
      ))}
    </div>
  ),
}));

vi.mock('../hooks/useLlmCommands', () => ({
  getBaseUrl: () => Promise.resolve('http://127.0.0.1:4000'),
  getMasterKey: () => Promise.resolve('sk-master-test'),
  listProviderKeys: () => Promise.resolve([]),
  listKeys: () => Promise.resolve({ keys: [] }),
  getSpendLogs: () => Promise.resolve([]),
  loadCustomProviders: () => Promise.resolve([]),
}));

describe('A013/UI: LlmSettings', () => {
  it('renders title and subtitle', () => {
    render(<LlmSettings />);
    expect(screen.getByText('LLM Providers')).toBeInTheDocument();
    expect(screen.getByText(/Manage LLM providers/)).toBeInTheDocument();
  });

  it('renders all tabs', () => {
    render(<LlmSettings />);
    expect(screen.getAllByText('Providers').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('API Keys')).toBeInTheDocument();
    expect(screen.getByText('Routing')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('switches between tabs', async () => {
    const user = userEvent.setup();
    render(<LlmSettings />);
    
    await user.click(screen.getByText('API Keys'));
    await waitFor(() => {
      expect(screen.getByText('No virtual keys created')).toBeInTheDocument();
    });
    
    await user.click(screen.getByText('Routing'));
    await waitFor(() => {
      expect(screen.getByText('Coming Soon')).toBeInTheDocument();
    });
  });
});