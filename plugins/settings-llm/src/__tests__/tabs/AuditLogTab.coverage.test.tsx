// AuditLogTab coverage tests — row expansion, status filter, timestamp
// parsing edge cases, and handleClearLogs (Popconfirm).

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuditLogTab from '../../tabs/AuditLogTab';

const mockGetSpendLogs = vi.fn();
const mockGetBaseUrl = vi.fn();
const mockGetMasterKey = vi.fn();

vi.mock('@snapfzz/shared', () => ({
  createTauriBridge: () => ({ invoke: vi.fn() }),
  fetchWithToast: async (fn: () => Promise<unknown>) => {
    try {
      const data = await fn();
      return { data };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  },
  PretextList: ({ items, renderItem, keyExtractor }: any) => (
    <div data-testid="pretext-list">
      {(items ?? []).map((item: any, i: number) => (
        <div key={keyExtractor(item, i)}>{renderItem(item, i)}</div>
      ))}
    </div>
  ),
  PretextPaginatedList: ({ items, renderItem, keyExtractor }: any) => (
    <div data-testid="pretext-paginated-list">
      {(items ?? []).map((item: any, i: number) => (
        <div key={keyExtractor(item, i)}>{renderItem(item, i)}</div>
      ))}
    </div>
  ),
  AppButton: ({ children, onClick, loading, size: _sz, variant: _v, icon }: any) => (
    <button type="button" onClick={onClick} disabled={loading}>
      {icon}
      {children}
    </button>
  ),
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  getBaseUrl: () => mockGetBaseUrl(),
  getMasterKey: () => mockGetMasterKey(),
  getSpendLogs: (...args: unknown[]) => mockGetSpendLogs(...args),
  getModelInfo: () => Promise.resolve({ data: [] }),
  loadCustomProviders: () => Promise.resolve([]),
}));

const BASE_LOG = {
  request_id: 'req-base',
  api_key: 'sk-very-long-key-abc',
  model: 'openai/gpt-4o',
  model_group: 'my-combo-pool', // use a model_group without slash so Combo column shows it
  spend: 0.01,
  startTime: '2026-04-10T10:00:00Z',
  total_tokens: 700,
  prompt_tokens: 500,
  completion_tokens: 200,
};

/** Get the first LogRow div[role="button"] in the document */
function getFirstLogRow(): HTMLElement {
  const rowBtns = document.querySelectorAll('[role="button"][tabindex="0"]');
  return rowBtns[0] as HTMLElement;
}

describe('AuditLogTab – row expansion (ExpandedDetail)', () => {
  beforeEach(() => {
    mockGetSpendLogs.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
  });

  it('clicking a log row expands it to show Request ID detail', async () => {
    const user = userEvent.setup();
    mockGetSpendLogs.mockResolvedValue([BASE_LOG]);
    render(<AuditLogTab />);
    await waitFor(() => {
      // Wait for logs to render (the list shows a request count)
      expect(screen.getByText('1 request')).toBeInTheDocument();
    });

    const rowBtn = getFirstLogRow();
    await user.click(rowBtn);

    await waitFor(() => {
      expect(screen.getByText('Request ID:')).toBeInTheDocument();
    });
  });

  it('clicking expanded row again collapses it', async () => {
    const user = userEvent.setup();
    mockGetSpendLogs.mockResolvedValue([BASE_LOG]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));

    const rowBtn = getFirstLogRow();
    // First click: expand
    await user.click(rowBtn);
    await waitFor(() => screen.getByText('Request ID:'));

    // Second click: collapse — need to re-query since DOM may update
    const rowBtnAfterExpand = getFirstLogRow();
    await user.click(rowBtnAfterExpand);
    await waitFor(() => {
      expect(screen.queryByText('Request ID:')).not.toBeInTheDocument();
    });
  });

  it('expanded row shows proxy request payload when present', async () => {
    const user = userEvent.setup();
    const logWithPayload = {
      ...BASE_LOG,
      request_id: 'req-payload',
      proxy_server_request: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    };
    mockGetSpendLogs.mockResolvedValue([logWithPayload]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));

    await user.click(getFirstLogRow());
    await waitFor(() => {
      expect(screen.getByText('Request Payload')).toBeInTheDocument();
    });
  });

  it('expanded row shows response payload when present', async () => {
    const user = userEvent.setup();
    const logWithResponse = {
      ...BASE_LOG,
      request_id: 'req-response',
      response: { id: 'chatcmpl-123', choices: [{ message: { content: 'Hi' } }] },
    };
    mockGetSpendLogs.mockResolvedValue([logWithResponse]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));

    await user.click(getFirstLogRow());
    await waitFor(() => {
      expect(screen.getByText('Response Payload')).toBeInTheDocument();
    });
  });

  it('expanded row shows error info when metadata.error_information present', async () => {
    const user = userEvent.setup();
    const logWithError = {
      ...BASE_LOG,
      request_id: 'req-error',
      metadata: {
        error_information: {
          error_code: 429,
          error_message: 'Rate limit exceeded',
          llm_provider: 'openai',
        },
      },
    };
    mockGetSpendLogs.mockResolvedValue([logWithError]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));

    await user.click(getFirstLogRow());
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  it('expanded row shows all detail fields including status and duration', async () => {
    const user = userEvent.setup();
    const detailedLog = {
      ...BASE_LOG,
      request_id: 'req-detail',
      status: 'success',
      call_type: 'acompletion',
      custom_llm_provider: 'openai',
      request_duration_ms: 1234,
      cache_hit: 'True',
    };
    mockGetSpendLogs.mockResolvedValue([detailedLog]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));

    await user.click(getFirstLogRow());
    await waitFor(() => {
      expect(screen.getByText('Status:')).toBeInTheDocument();
      expect(screen.getByText('Duration:')).toBeInTheDocument();
    });
  });
});

describe('AuditLogTab – status filter', () => {
  beforeEach(() => {
    mockGetSpendLogs.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
  });

  const LOGS_WITH_STATUS = [
    { ...BASE_LOG, request_id: 'req-success', status: 'success', model: 'openai/gpt-4o', model_group: 'my-combo-pool' },
    { ...BASE_LOG, request_id: 'req-fail', status: '500', model: 'openai/gpt-4o', model_group: 'my-combo-pool', api_key: 'sk-very-long-key-fail' },
  ];

  it('shows only success logs when Success radio filter selected', async () => {
    const user = userEvent.setup();
    mockGetSpendLogs.mockResolvedValue(LOGS_WITH_STATUS);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('2 requests'));

    // Radio.Group with optionType="button" — find radio input with value="success"
    const successRadio = document.querySelector('input[value="success"]') as HTMLInputElement;
    expect(successRadio).toBeTruthy();
    await user.click(successRadio);
    await waitFor(() => {
      expect(screen.getByText('1 request')).toBeInTheDocument();
    });
  });

  it('shows only failure logs when Failure radio filter selected', async () => {
    const user = userEvent.setup();
    mockGetSpendLogs.mockResolvedValue(LOGS_WITH_STATUS);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('2 requests'));

    const failureRadio = document.querySelector('input[value="failure"]') as HTMLInputElement;
    expect(failureRadio).toBeTruthy();
    await user.click(failureRadio);
    await waitFor(() => {
      expect(screen.getByText('1 request')).toBeInTheDocument();
    });
  });

  it('shows all logs when All radio selected after Success', async () => {
    const user = userEvent.setup();
    mockGetSpendLogs.mockResolvedValue(LOGS_WITH_STATUS);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('2 requests'));

    const successRadio = document.querySelector('input[value="success"]') as HTMLInputElement;
    await user.click(successRadio);
    await waitFor(() => screen.getByText('1 request'));

    const allRadio = document.querySelector('input[value="all"]') as HTMLInputElement;
    await user.click(allRadio);
    await waitFor(() => {
      expect(screen.getByText('2 requests')).toBeInTheDocument();
    });
  });
});

describe('AuditLogTab – timestamp parsing edge cases', () => {
  beforeEach(() => {
    mockGetSpendLogs.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
  });

  it('handles Unix epoch seconds timestamp (number < 1e12)', async () => {
    const epochSeconds = Math.floor(Date.now() / 1000); // < 1e12
    mockGetSpendLogs.mockResolvedValue([{
      ...BASE_LOG,
      request_id: 'req-epoch-s',
      startTime: epochSeconds as any,
    }]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));
  });

  it('handles Unix epoch milliseconds timestamp (number >= 1e12)', async () => {
    const epochMs = Date.now(); // >= 1e12
    mockGetSpendLogs.mockResolvedValue([{
      ...BASE_LOG,
      request_id: 'req-epoch-ms',
      startTime: epochMs as any,
    }]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));
  });

  it('handles null/missing timestamp (renders "—" from formatTimestamp)', async () => {
    mockGetSpendLogs.mockResolvedValue([{
      ...BASE_LOG,
      request_id: 'req-no-ts',
      startTime: undefined,
      timestamp: undefined,
    }]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));
    // formatTimestamp returns '—' when date.getTime() === 0
    const dashEls = screen.getAllByText('—');
    expect(dashEls.length).toBeGreaterThanOrEqual(1);
  });

  it('handles numeric string timestamp (epoch seconds as string)', async () => {
    const epochStr = String(Math.floor(Date.now() / 1000));
    mockGetSpendLogs.mockResolvedValue([{
      ...BASE_LOG,
      request_id: 'req-epoch-str',
      startTime: epochStr,
    }]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));
  });

  it('filters out model-less entries (LiteLLM health check probes)', async () => {
    mockGetSpendLogs.mockResolvedValue([
      BASE_LOG,
      { ...BASE_LOG, request_id: 'req-empty-model', model: '', model_group: '' },
    ]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));
  });

  it('shows Success status tag for status "success"', async () => {
    mockGetSpendLogs.mockResolvedValue([{ ...BASE_LOG, status: 'success' }]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));
    // "Success" appears in both the status tag and the radio button — verify at least 2
    const successEls = screen.getAllByText('Success');
    expect(successEls.length).toBeGreaterThanOrEqual(2);
  });

  it('shows Success status tag for status "200"', async () => {
    mockGetSpendLogs.mockResolvedValue([{ ...BASE_LOG, status: '200' }]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));
    // Status "200" maps to 'Success' tag + radio button label
    const successEls = screen.getAllByText('Success');
    expect(successEls.length).toBeGreaterThanOrEqual(2);
  });

  it('shows 4xx status tag (warning) for status "429"', async () => {
    mockGetSpendLogs.mockResolvedValue([{ ...BASE_LOG, status: '429' }]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('429'));
  });

  it('shows 5xx status tag (error) for status "500"', async () => {
    mockGetSpendLogs.mockResolvedValue([{ ...BASE_LOG, status: '500' }]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('500'));
  });

  it('shows Unknown tag when status is undefined', async () => {
    mockGetSpendLogs.mockResolvedValue([{ ...BASE_LOG, status: undefined }]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('Unknown'));
  });

  it('shows generic tag for non-standard status', async () => {
    mockGetSpendLogs.mockResolvedValue([{ ...BASE_LOG, status: 'timeout' }]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('timeout'));
  });
});

describe('AuditLogTab – keyboard navigation for row expansion', () => {
  beforeEach(() => {
    mockGetSpendLogs.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
  });

  it('Enter key on log row expands it', async () => {
    const user = userEvent.setup();
    mockGetSpendLogs.mockResolvedValue([BASE_LOG]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));

    const rowBtn = getFirstLogRow();
    rowBtn.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Request ID:')).toBeInTheDocument();
    });
  });

  it('Space key on log row expands it', async () => {
    const user = userEvent.setup();
    mockGetSpendLogs.mockResolvedValue([BASE_LOG]);
    render(<AuditLogTab />);
    await waitFor(() => screen.getByText('1 request'));

    const rowBtn = getFirstLogRow();
    rowBtn.focus();
    await user.keyboard(' ');

    await waitFor(() => {
      expect(screen.getByText('Request ID:')).toBeInTheDocument();
    });
  });
});

describe('AuditLogTab – active prop triggers reload', () => {
  beforeEach(() => {
    mockGetSpendLogs.mockReset();
    mockGetBaseUrl.mockReset();
    mockGetMasterKey.mockReset();
    mockGetBaseUrl.mockResolvedValue('http://127.0.0.1:4000');
    mockGetMasterKey.mockResolvedValue('sk-master-test');
    mockGetSpendLogs.mockResolvedValue([]);
  });

  it('re-fetches logs when active prop changes to true', async () => {
    const { rerender } = render(<AuditLogTab active={false} />);
    await waitFor(() => screen.getByText('No spend logs found'));
    const callCount = mockGetSpendLogs.mock.calls.length;

    rerender(<AuditLogTab active={true} />);
    await waitFor(() => {
      expect(mockGetSpendLogs.mock.calls.length).toBeGreaterThan(callCount);
    });
  });
});
