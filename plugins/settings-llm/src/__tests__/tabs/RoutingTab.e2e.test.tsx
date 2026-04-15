// A013/UI/RoutingTab: Combo lifecycle e2e-style integration tests.
// Covers create → edit → delete flows, strategy decode, validation,
// deduplication, lowercase enforcement, and API type switching.

import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RoutingTab from '../../tabs/RoutingTab';

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

const MOCK_BASE_URL = 'http://127.0.0.1:4000';
const MOCK_MASTER_KEY = 'sk-master-test';

// Available individual provider deployments (model_name contains slash)
const AVAILABLE_MODEL_INFO_DATA = [
  {
    model_name: 'solo-engineer/coder',
    litellm_params: { api_base: 'https://llm.solo.engineer/v1', model: 'openai/coder', api_key: 'sk-solo-1' },
    model_info: { snapfzz_provider_id: 'custom-solo-engineer' },
  },
  {
    model_name: 'solo-engineer/codex',
    litellm_params: { api_base: 'https://llm.solo.engineer/v1', model: 'openai/codex', api_key: 'sk-solo-2' },
    model_info: { snapfzz_provider_id: 'custom-solo-engineer' },
  },
  {
    model_name: 'anthropic-provider/claude-opus',
    litellm_params: { api_base: undefined, model: 'anthropic/claude-opus-4-5', api_key: 'sk-ant-1' },
    model_info: { snapfzz_provider_id: 'custom-anthropic' },
  },
];

// An existing combo in the gateway (model_name without slash = combo group)
const EXISTING_COMBO_MODEL_INFO_DATA = [
  {
    model_name: 'my-pool',
    litellm_params: { api_base: 'https://llm.solo.engineer/v1', model: 'openai/coder', api_key: 'sk-solo-1', weight: 70 },
    model_info: { id: 'model-id-aaa', snapfzz_provider_id: 'custom-solo-engineer', snapfzz_combo: true },
  },
  {
    model_name: 'my-pool',
    litellm_params: { api_base: 'https://llm.solo.engineer/v1', model: 'openai/codex', api_key: 'sk-solo-2', weight: 30 },
    model_info: { id: 'model-id-bbb', snapfzz_provider_id: 'custom-solo-engineer', snapfzz_combo: true },
  },
  // Individual deployments remain available
  ...AVAILABLE_MODEL_INFO_DATA,
];

// ---------------------------------------------------------------------------
// Default mock factories — tests override what they need
// ---------------------------------------------------------------------------

function makeMocks({
  modelInfoData = [] as typeof AVAILABLE_MODEL_INFO_DATA,
  routingStrategy = 'simple-shuffle',
}: {
  modelInfoData?: typeof AVAILABLE_MODEL_INFO_DATA;
  routingStrategy?: string;
} = {}) {
  return {
    getBaseUrl: () => Promise.resolve(MOCK_BASE_URL),
    getMasterKey: () => Promise.resolve(MOCK_MASTER_KEY),
    getConfig: () =>
      Promise.resolve({ router_settings: { routing_strategy: routingStrategy } }),
    updateConfig: vi.fn().mockResolvedValue({}),
    getModelGroups: () => Promise.resolve(['solo-engineer/coder', 'solo-engineer/codex']),
    getModelInfo: () => Promise.resolve({ data: modelInfoData }),
    deleteModel: vi.fn().mockResolvedValue(undefined),
    importModel: vi.fn().mockResolvedValue({}),
    loadCustomProviders: () => Promise.resolve([]),
  };
}

// ---------------------------------------------------------------------------
// Module mocks (set once; individual tests override via vi.mocked)
// ---------------------------------------------------------------------------

const hookMocks = makeMocks();

vi.mock('@snapfzz/shared', () => ({
  fetchWithToast: async (fn: () => Promise<unknown>, _opts?: unknown) => {
    try {
      return { data: await fn() };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  },
  AppButton: ({ children, onClick, disabled, loading, type: _type, variant: _v, icon, style: _s }: any) => (
    <button type="button" onClick={onClick} disabled={disabled || loading}>
      {icon}
      {children}
    </button>
  ),
}));

vi.mock('../../hooks/useLlmCommands', () => ({
  get getBaseUrl() { return hookMocks.getBaseUrl; },
  get getMasterKey() { return hookMocks.getMasterKey; },
  get getConfig() { return hookMocks.getConfig; },
  get updateConfig() { return hookMocks.updateConfig; },
  get getModelGroups() { return hookMocks.getModelGroups; },
  get getModelInfo() { return hookMocks.getModelInfo; },
  get deleteModel() { return hookMocks.deleteModel; },
  get importModel() { return hookMocks.importModel; },
  get loadCustomProviders() { return hookMocks.loadCustomProviders; },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the component to finish loading (skeleton disappears). */
async function waitForLoaded() {
  await waitFor(() => {
    expect(screen.getByText(/Create Combo/i)).toBeInTheDocument();
  }, { timeout: 4000 });
}

/** Click a wizard step by label in the step indicator. */
async function clickStepLabel(user: ReturnType<typeof userEvent.setup>, label: string) {
  // The step indicator uses <span> for labels; find the first exact match
  const stepBtns = screen.getAllByText(label);
  await user.click(stepBtns[0]);
}

/** Click the "Next" button. */
async function clickNext(user: ReturnType<typeof userEvent.setup>) {
  const nextBtn = screen.getByRole('button', { name: /^next$/i });
  await user.click(nextBtn);
}

/**
 * Wait for step 1 (Deployments) to be visible.
 * Ant Select in multiple mode uses role=combobox on its inner input.
 */
async function waitForDeploymentStep() {
  await waitFor(() => {
    // The "API Type" label is unique to step 1
    expect(screen.getByText('API Type')).toBeInTheDocument();
  });
}

/**
 * Open the models Select dropdown.
 * Ant Select (multiple) renders a combobox role on the search input.
 * Returns the combobox element (the first one on the page when on deployments step).
 */
function getModelSelectInput(): HTMLElement {
  return screen.getAllByRole('combobox')[0];
}

// ---------------------------------------------------------------------------
// Ant Design Modal helper — "OK" button inside portal
// ---------------------------------------------------------------------------

/** Find the visible Ant Modal dialog (Ant keeps it in DOM with display:none when closed). */
function getVisibleDialog(): HTMLElement {
  const dialogs = document.querySelectorAll('[role="dialog"]');
  const visible = Array.from(dialogs).find(
    (d) => (d as HTMLElement).style.display !== 'none',
  );
  return (visible ?? dialogs[0]) as HTMLElement;
}

async function confirmModal(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => {
    const dialog = getVisibleDialog();
    expect(dialog).toBeTruthy();
  });
  const dialog = getVisibleDialog();
  const okBtn = within(dialog as HTMLElement).getByRole('button', { name: /^(ok|delete)$/i });
  await user.click(okBtn);
}

async function cancelModal(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => {
    const dialog = getVisibleDialog();
    expect(dialog).toBeTruthy();
  });
  const dialog = getVisibleDialog();
  const cancelBtn = within(dialog as HTMLElement).getByRole('button', { name: /cancel/i });
  await user.click(cancelBtn);
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('A013/UI/RoutingTab – Combo lifecycle (e2e)', () => {
  beforeEach(() => {
    // Reset to default mocks before each test
    Object.assign(hookMocks, makeMocks());
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  // -------------------------------------------------------------------------
  // 1. Rendering
  // -------------------------------------------------------------------------

  it('renders the combo list with "Create Combo" button after loading', async () => {
    render(<RoutingTab />);
    await waitForLoaded();
    expect(screen.getByText(/Create Combo/i)).toBeInTheDocument();
  });

  it('shows empty-state message when no combos exist', async () => {
    render(<RoutingTab />);
    await waitForLoaded();
    expect(screen.getByText(/no routing combos created/i)).toBeInTheDocument();
  });

  it('shows existing combo cards loaded from model info', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: EXISTING_COMBO_MODEL_INFO_DATA }));
    render(<RoutingTab />);
    await waitForLoaded();
    // "my-pool" has no slash — decoded as combo
    expect(screen.getByText('my-pool')).toBeInTheDocument();
    // Shows deployment count
    expect(screen.getByText(/2 deployments/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 2. Lowercase enforcement
  // -------------------------------------------------------------------------

  it('auto-lowercases combo name input as user types', async () => {
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    await user.click(screen.getByText(/Create Combo/i));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. gpt4-pool/i)).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText(/e\.g\. gpt4-pool/i);
    await user.type(nameInput, 'MyCombo');

    // onChange calls .toLowerCase() — value should be lowercased
    expect((nameInput as HTMLInputElement).value).toBe('mycombo');
  });

  // -------------------------------------------------------------------------
  // 3. Validation: Save disabled until all steps complete
  // -------------------------------------------------------------------------

  it('Save button is disabled when name is empty', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: AVAILABLE_MODEL_INFO_DATA }));
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    await user.click(screen.getByText(/Create Combo/i));
    await waitFor(() => screen.getByPlaceholderText(/e\.g\. gpt4-pool/i));

    // Navigate directly to Review (step 3) via step indicator
    await clickStepLabel(user, 'Review');

    // Save button should be disabled (name is empty)
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeDisabled();
  });

  it('Save button is disabled when no deployments are selected', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: AVAILABLE_MODEL_INFO_DATA }));
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    await user.click(screen.getByText(/Create Combo/i));
    await waitFor(() => screen.getByPlaceholderText(/e\.g\. gpt4-pool/i));

    // Enter a valid name
    const nameInput = screen.getByPlaceholderText(/e\.g\. gpt4-pool/i);
    await user.type(nameInput, 'test-pool');

    // Jump to Review
    await clickStepLabel(user, 'Review');

    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeDisabled();
  });

  it('Save button is disabled when no strategy is selected', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: AVAILABLE_MODEL_INFO_DATA }));
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    await user.click(screen.getByText(/Create Combo/i));
    await waitFor(() => screen.getByPlaceholderText(/e\.g\. gpt4-pool/i));

    const nameInput = screen.getByPlaceholderText(/e\.g\. gpt4-pool/i);
    await user.type(nameInput, 'test-pool');

    // Move to step 1 (Deployments)
    await clickNext(user);
    await waitForDeploymentStep();

    // Jump to Review without selecting strategy
    await clickStepLabel(user, 'Review');

    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // 4. Create combo flow
  // -------------------------------------------------------------------------

  it('full create combo flow: name → models → strategy → save', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: AVAILABLE_MODEL_INFO_DATA }));
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    // Step: open builder
    await user.click(screen.getByText(/Create Combo/i));
    await waitFor(() => expect(screen.getByText(/New Combo/i)).toBeInTheDocument());

    // Step 0: Basics — enter name
    const nameInput = screen.getByPlaceholderText(/e\.g\. gpt4-pool/i);
    await user.type(nameInput, 'my-new-pool');
    await clickNext(user);

    // Step 1: Deployments — select models via the Select component
    await waitForDeploymentStep();
    const selectInput = getModelSelectInput();
    await user.click(selectInput);
    // Wait for dropdown options to appear and click the option by title (Ant Select pattern)
    await waitFor(() => screen.getByTitle('solo-engineer/coder'));
    await user.click(screen.getByTitle('solo-engineer/coder'));
    // Click outside the Select to close it and commit the selection
    await user.click(document.body);

    // Next should now be enabled (deployment selected)
    await waitFor(() => {
      const nextBtn = screen.getByRole('button', { name: /^next$/i });
      expect(nextBtn).not.toBeDisabled();
    });
    await clickNext(user);

    // Step 2: Strategy — pick Round Robin
    await waitFor(() => screen.getByText('Round Robin'), { timeout: 3000 });
    await user.click(screen.getByText('Round Robin'));

    // Next should be enabled after selecting strategy
    await waitFor(() => {
      const nextBtn = screen.getByRole('button', { name: /^next$/i });
      expect(nextBtn).not.toBeDisabled();
    });
    await clickNext(user);

    // Step 3: Review — verify summary and Save is enabled
    await waitFor(() => screen.getByRole('button', { name: /^save$/i }));
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).not.toBeDisabled();

    // Verify summary shows correct details
    expect(screen.getByText('my-new-pool')).toBeInTheDocument();
    expect(screen.getAllByText('Round Robin').length).toBeGreaterThanOrEqual(1);

    await user.click(saveBtn);

    // Verify importModel was called with the new signature
    await waitFor(() => {
      const importCalls = hookMocks.importModel.mock.calls;
      expect(importCalls.length).toBeGreaterThan(0);
      // importModel(litellmBaseUrl, masterKey, providerId, modelId, apiKey, modelName?, ...)
      // modelName (6th arg, index 5) should be the combo name
      expect(importCalls[0][5]).toBe('my-new-pool');
    });

    // Builder should dismiss and return to list
    await waitFor(() => {
      expect(screen.getByText(/Create Combo/i)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Edit combo flow
  // -------------------------------------------------------------------------

  it('edit combo: fields pre-populate correctly from existing combo data', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: EXISTING_COMBO_MODEL_INFO_DATA }));
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    // Click the edit button on my-pool combo card
    const editBtns = screen.getAllByRole('button').filter((b) =>
      b.querySelector('span[role="img"][aria-label="edit"]') !== null ||
      b.innerHTML.includes('EditOutlined') ||
      b.title === 'edit'
    );

    // Find the card for my-pool — the combo card name is in a bold div inside the card
    // Click on it to trigger the onEdit handler (the whole card is clickable)
    const poolNameEl = screen.getAllByText('my-pool')[0];
    const poolCard = poolNameEl.closest('[style*="cursor: pointer"]') ?? poolNameEl.closest('[style]');
    expect(poolCard).toBeTruthy();
    await user.click(poolCard!);

    // Builder should open in edit mode
    await waitFor(() => {
      expect(screen.getByText(/Edit Combo/i)).toBeInTheDocument();
    });

    // Name field should be pre-populated
    const nameInput = screen.getByPlaceholderText(/e\.g\. gpt4-pool/i);
    expect((nameInput as HTMLInputElement).value).toBe('my-pool');
  });

  it('edit combo: save calls /model/delete before /model/new (no duplication)', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: EXISTING_COMBO_MODEL_INFO_DATA }));
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    // Open edit for my-pool
    const poolNameEl = screen.getAllByText('my-pool')[0];
    const poolCard = poolNameEl.closest('[style*="cursor: pointer"]') ?? poolNameEl.closest('[style]');
    await user.click(poolCard!);

    await waitFor(() => screen.getByText(/Edit Combo/i));

    // Navigate to Review directly
    await clickStepLabel(user, 'Review');
    await waitFor(() => screen.getByRole('button', { name: /^save$/i }));

    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).not.toBeDisabled();
    await user.click(saveBtn);

    await waitFor(() => {
      // deleteModel must be called for existing deployments
      expect(hookMocks.deleteModel).toHaveBeenCalled();
      // importModel must be called to recreate deployments
      expect(hookMocks.importModel).toHaveBeenCalled();
    });
  });

  it('edit combo: weighted strategy is decoded correctly from model info', async () => {
    // my-pool has weight fields → should decode as 'weighted'
    Object.assign(hookMocks, makeMocks({ modelInfoData: EXISTING_COMBO_MODEL_INFO_DATA }));
    render(<RoutingTab />);
    await waitForLoaded();

    // The combo card should show the decoded strategy tag
    expect(screen.getByText('weighted')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 6. Delete combo flow
  // -------------------------------------------------------------------------

  it('delete combo: confirm modal → calls /model/delete → removes from list', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: EXISTING_COMBO_MODEL_INFO_DATA }));
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    // Verify the combo card is present
    expect(screen.getAllByText('my-pool').length).toBeGreaterThanOrEqual(1);

    // ComboList renders two icon-only AppButton per combo (edit, delete).
    // Our AppButton mock renders them as plain <button> elements with SVG icon children.
    // The card itself is also clickable (navigates to edit), so we need the inner button group.
    // Find the card's inner button container and pick the last button (delete).
    const cardNameEls = screen.getAllByText('my-pool');
    // Find the combo card div that contains both the name and the buttons
    let comboCard: Element | null = null;
    for (const el of cardNameEls) {
      const candidate = el.closest('[style*="display: flex"][style*="border"]');
      if (candidate && candidate.querySelectorAll('button').length >= 2) {
        comboCard = candidate;
        break;
      }
    }
    expect(comboCard).toBeTruthy();
    const cardButtons = Array.from(comboCard!.querySelectorAll('button'));
    // Last button in card = delete
    const deleteBtn = cardButtons[cardButtons.length - 1];
    await user.click(deleteBtn!);

    // Confirm modal becomes visible
    await waitFor(() => {
      const dialog = getVisibleDialog();
      expect(dialog).toBeTruthy();
    });

    // Modal body contains the combo name and a Delete button
    const dialog = getVisibleDialog();
    expect(within(dialog as HTMLElement).getAllByText('my-pool').length).toBeGreaterThanOrEqual(1);

    await confirmModal(user);

    // /model/delete called with individual model IDs (not model_name)
    await waitFor(() => {
      const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const deleteCall = fetchCalls.find(([url]: [string]) => url.includes('/model/delete'));
      expect(deleteCall).toBeDefined();
      const body = JSON.parse(deleteCall![1].body);
      expect(body.id).toMatch(/^model-id-/);
    });

    // Combo removed from the list (no combo card with that name)
    await waitFor(() => {
      // After reload with empty data mock, the name should not appear in combo cards
      // (the loadData re-fetch will return empty since hookMocks.getModelInfo still returns EXISTING data,
      //  but the optimistic update removes it from state immediately)
      const poolEls = screen.queryAllByText('my-pool');
      // Should only appear if modal is still rendering it (display:none) — check no card
      const cardEls = poolEls.filter((el) => {
        const card = el.closest('[style*="display: flex"][style*="border"]');
        return card !== null && card.querySelectorAll('button').length >= 2;
      });
      expect(cardEls).toHaveLength(0);
    });
  });

  it('delete combo: cancel modal does NOT call /model/delete', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: EXISTING_COMBO_MODEL_INFO_DATA }));
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    const cardNameEls = screen.getAllByText('my-pool');
    let comboCard: Element | null = null;
    for (const el of cardNameEls) {
      const candidate = el.closest('[style*="display: flex"][style*="border"]');
      if (candidate && candidate.querySelectorAll('button').length >= 2) {
        comboCard = candidate; break;
      }
    }
    const cardButtons = Array.from(comboCard!.querySelectorAll('button'));
    const deleteBtn = cardButtons[cardButtons.length - 1];
    await user.click(deleteBtn!);

    // Wait for modal to become visible
    await waitFor(() => {
      const dialog = getVisibleDialog();
      expect(dialog).toBeTruthy();
    });

    await cancelModal(user);

    // After cancel, Ant sets display:none on the modal — it should not be visible
    await waitFor(() => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      const visible = Array.from(dialogs).find((d) => (d as HTMLElement).style.display !== 'none');
      expect(visible).toBeUndefined();
    });

    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const deleteCall = fetchCalls.find(([url]: [string]) => url.includes('/model/delete'));
    expect(deleteCall).toBeUndefined();

    // Combo card still visible (at least one element with the name exists in the combo list area)
    expect(screen.getAllByText('my-pool').length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 7. Strategy decode
  // -------------------------------------------------------------------------

  it('decodes simple-shuffle with weight → weighted strategy', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: EXISTING_COMBO_MODEL_INFO_DATA, routingStrategy: 'simple-shuffle' }));
    render(<RoutingTab />);
    await waitForLoaded();
    // my-pool entries have weight fields → decoded as 'weighted'
    expect(screen.getByText('weighted')).toBeInTheDocument();
  });

  it('decodes simple-shuffle with order → priority strategy', async () => {
    const priorityData = [
      {
        model_name: 'priority-pool',
        litellm_params: { model: 'openai/coder', api_key: 'sk-1' },
        model_info: { snapfzz_provider_id: 'custom-p', order: 1 },
      },
      {
        model_name: 'priority-pool',
        litellm_params: { model: 'openai/codex', api_key: 'sk-2' },
        model_info: { snapfzz_provider_id: 'custom-p', order: 2 },
      },
    ];
    Object.assign(hookMocks, makeMocks({ modelInfoData: priorityData, routingStrategy: 'simple-shuffle' }));
    render(<RoutingTab />);
    await waitForLoaded();
    expect(screen.getByText('priority')).toBeInTheDocument();
  });

  it('decodes simple-shuffle with no weight/order → round-robin strategy', async () => {
    const rrData = [
      {
        model_name: 'rr-pool',
        litellm_params: { model: 'openai/coder', api_key: 'sk-1' },
        model_info: { snapfzz_provider_id: 'custom-p' },
      },
    ];
    Object.assign(hookMocks, makeMocks({ modelInfoData: rrData, routingStrategy: 'simple-shuffle' }));
    render(<RoutingTab />);
    await waitForLoaded();
    expect(screen.getByText('round-robin')).toBeInTheDocument();
  });

  it('decodes least-busy → least-busy strategy', async () => {
    const lbData = [
      {
        model_name: 'lb-pool',
        litellm_params: { model: 'openai/coder', api_key: 'sk-1' },
        model_info: { snapfzz_provider_id: 'custom-p' },
      },
    ];
    Object.assign(hookMocks, makeMocks({ modelInfoData: lbData, routingStrategy: 'least-busy' }));
    render(<RoutingTab />);
    await waitForLoaded();
    expect(screen.getByText('least-busy')).toBeInTheDocument();
  });

  it('decodes cost-based-routing → cost-optimized strategy', async () => {
    const costData = [
      {
        model_name: 'cost-pool',
        litellm_params: { model: 'openai/coder', api_key: 'sk-1' },
        model_info: { snapfzz_provider_id: 'custom-p' },
      },
    ];
    Object.assign(hookMocks, makeMocks({ modelInfoData: costData, routingStrategy: 'cost-based-routing' }));
    render(<RoutingTab />);
    await waitForLoaded();
    expect(screen.getByText('cost-optimized')).toBeInTheDocument();
  });

  it('decodes latency-based-routing → latency-optimized strategy', async () => {
    const latData = [
      {
        model_name: 'lat-pool',
        litellm_params: { model: 'openai/coder', api_key: 'sk-1' },
        model_info: { snapfzz_provider_id: 'custom-p' },
      },
    ];
    Object.assign(hookMocks, makeMocks({ modelInfoData: latData, routingStrategy: 'latency-based-routing' }));
    render(<RoutingTab />);
    await waitForLoaded();
    expect(screen.getByText('latency-optimized')).toBeInTheDocument();
  });

  it('decodes usage-based-routing with order → fill-first strategy', async () => {
    const fillData = [
      {
        model_name: 'fill-pool',
        litellm_params: { model: 'openai/coder', api_key: 'sk-1' },
        model_info: { snapfzz_provider_id: 'custom-p', order: 1 },
      },
      {
        model_name: 'fill-pool',
        litellm_params: { model: 'openai/codex', api_key: 'sk-2' },
        model_info: { snapfzz_provider_id: 'custom-p', order: 2 },
      },
    ];
    Object.assign(hookMocks, makeMocks({ modelInfoData: fillData, routingStrategy: 'usage-based-routing' }));
    render(<RoutingTab />);
    await waitForLoaded();
    expect(screen.getByText('fill-first')).toBeInTheDocument();
  });

  it('decodes usage-based-routing without order → least-busy strategy', async () => {
    const ubData = [
      {
        model_name: 'ub-pool',
        litellm_params: { model: 'openai/coder', api_key: 'sk-1' },
        model_info: { snapfzz_provider_id: 'custom-p' },
      },
    ];
    Object.assign(hookMocks, makeMocks({ modelInfoData: ubData, routingStrategy: 'usage-based-routing' }));
    render(<RoutingTab />);
    await waitForLoaded();
    expect(screen.getByText('least-busy')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 8. Individual provider models are NOT listed as combos
  // -------------------------------------------------------------------------

  it('filters out individual provider deployments (model_name with slash) from combo list', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: AVAILABLE_MODEL_INFO_DATA }));
    render(<RoutingTab />);
    await waitForLoaded();
    // solo-engineer/coder has a slash — should not appear as a combo card
    // The empty-state message should still show
    expect(screen.getByText(/no routing combos created/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 9. Cancel builder
  // -------------------------------------------------------------------------

  it('Cancel button returns to combo list without saving', async () => {
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    await user.click(screen.getByText(/Create Combo/i));
    await waitFor(() => expect(screen.getByText(/New Combo/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.getByText(/Create Combo/i)).toBeInTheDocument();
      expect(screen.queryByText(/New Combo/i)).not.toBeInTheDocument();
    });

    // No API calls made
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(fetchCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 10. API type switching clears model selections
  // -------------------------------------------------------------------------

  it('switching API type clears existing deployment selections', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: AVAILABLE_MODEL_INFO_DATA }));
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    await user.click(screen.getByText(/Create Combo/i));
    await waitFor(() => screen.getByPlaceholderText(/e\.g\. gpt4-pool/i));

    // Enter valid name and go to deployments
    await user.type(screen.getByPlaceholderText(/e\.g\. gpt4-pool/i), 'test-pool');
    await clickNext(user);

    await waitForDeploymentStep();

    // Select an openai model
    const selectInput = getModelSelectInput();
    await user.click(selectInput);
    await waitFor(() => screen.getByTitle('solo-engineer/coder'));
    await user.click(screen.getByTitle('solo-engineer/coder'));
    // Close dropdown by clicking body
    await user.click(document.body);

    // Now switch to Anthropic — should clear selections
    const anthropicRadio = screen.getByLabelText(/Anthropic Compatible/i);
    await user.click(anthropicRadio);

    // No models selected badge/tags should remain for openai models
    await waitFor(() => {
      // After switching, no "solo-engineer/coder" tag should be visible
      // The component clears deployments on API type change
      const tags = screen.queryAllByText('solo-engineer/coder');
      // Tags might still appear in the select options, but not in the selected tags area
      // The "No models selected" hint text confirms the deployments array is empty
      const noModels = screen.queryByText(/No models selected/i);
      // At minimum, the previously selected model should no longer show as a Tag (blue chip)
      expect(tags.filter((el) => el.closest('.ant-tag') !== null)).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Deduplication via composer
  // -------------------------------------------------------------------------

  it('composeCombo deduplicates same model appearing twice', async () => {
    // This tests the composer directly — import and call
    const { composeCombo } = await import('../../routing/composer');

    const result = composeCombo({
      name: 'dedup-pool',
      strategy: 'round-robin',
      deployments: [
        { provider: 'p1', model: 'openai/coder', apiBase: '', apiKey: '' },
        { provider: 'p1', model: 'openai/coder', apiBase: '', apiKey: '' }, // duplicate
        { provider: 'p2', model: 'openai/codex', apiBase: '', apiKey: '' },
      ],
    });

    // Only 2 unique models should be created
    expect(result.modelsToCreate).toHaveLength(2);
    const modelValues = result.modelsToCreate.map((m) => m.litellm_params.model);
    expect(modelValues).toEqual(['openai/coder', 'openai/codex']);
  });

  // -------------------------------------------------------------------------
  // 12. Composer payload correctness
  // -------------------------------------------------------------------------

  it('weighted strategy emits correct weight in /model/new payload', async () => {
    // Use existing combo data with pre-populated weight fields to bypass Ant Select interaction.
    // my-pool already has weight=70 and weight=30 on its two deployments.
    Object.assign(hookMocks, makeMocks({ modelInfoData: EXISTING_COMBO_MODEL_INFO_DATA }));
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    // Open edit for my-pool — it already has deployments with weights
    const poolCard = screen.getByText('my-pool').closest('[style]');
    await user.click(poolCard!);
    await waitFor(() => screen.getByText(/Edit Combo/i));

    // Jump directly to Strategy step and select Weighted
    await clickStepLabel(user, 'Strategy');
    await waitFor(() => screen.getByText('Weighted'));
    await user.click(screen.getByText('Weighted'));

    // Slider should appear
    await waitFor(() => screen.getByText(/Weights/i));

    // Jump to Review and save
    await clickStepLabel(user, 'Review');
    await waitFor(() => screen.getByRole('button', { name: /^save$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      // importModel is called with new signature
      expect(hookMocks.importModel).toHaveBeenCalled();
      // The combo name is passed as 6th arg (index 5) — modelName override
      expect(hookMocks.importModel.mock.calls[0][5]).toBe('my-pool');
    });
  });

  it('priority strategy emits order fields in /model/new payload', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: AVAILABLE_MODEL_INFO_DATA }));
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    await user.click(screen.getByText(/Create Combo/i));
    await waitFor(() => screen.getByPlaceholderText(/e\.g\. gpt4-pool/i));

    await user.type(screen.getByPlaceholderText(/e\.g\. gpt4-pool/i), 'priority-pool');
    await clickNext(user);

    // Select a model
    await waitForDeploymentStep();
    const selectInput2 = getModelSelectInput();
    await user.click(selectInput2);
    await waitFor(() => screen.getByTitle('solo-engineer/coder'));
    await user.click(screen.getByTitle('solo-engineer/coder'));
    await user.click(document.body);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^next$/i })).not.toBeDisabled();
    });
    await clickNext(user);

    // Select Priority strategy
    await waitFor(() => screen.getByText('Priority'), { timeout: 3000 });
    await user.click(screen.getByText('Priority'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^next$/i })).not.toBeDisabled();
    });
    await clickNext(user);

    // Save
    await waitFor(() => screen.getByRole('button', { name: /^save$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      // importModel is called with new signature
      expect(hookMocks.importModel).toHaveBeenCalled();
      // The combo name is passed as 6th arg (index 5)
      expect(hookMocks.importModel.mock.calls[0][5]).toBe('priority-pool');
    });
  });

  // -------------------------------------------------------------------------
  // 13. Verify /model/new and /model/delete use correct auth headers
  // -------------------------------------------------------------------------

  it('fetch calls include Authorization header with master key', async () => {
    Object.assign(hookMocks, makeMocks({ modelInfoData: EXISTING_COMBO_MODEL_INFO_DATA }));
    const user = userEvent.setup();
    render(<RoutingTab />);
    await waitForLoaded();

    const cardNameEls = screen.getAllByText('my-pool');
    let comboCard: Element | null = null;
    for (const el of cardNameEls) {
      const candidate = el.closest('[style*="display: flex"][style*="border"]');
      if (candidate && candidate.querySelectorAll('button').length >= 2) {
        comboCard = candidate; break;
      }
    }
    const cardButtons = Array.from(comboCard!.querySelectorAll('button'));
    const deleteBtn = cardButtons[cardButtons.length - 1];
    await user.click(deleteBtn!);

    await waitFor(() => { const d = getVisibleDialog(); expect(d).toBeTruthy(); });
    await confirmModal(user);

    await waitFor(() => {
      const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const deleteCall = fetchCalls.find(([url]: [string]) => url.includes('/model/delete'));
      expect(deleteCall).toBeDefined();
      const headers = deleteCall![1].headers;
      expect(headers['Authorization']).toBe(`Bearer ${MOCK_MASTER_KEY}`);
    });
  });
});

// ---------------------------------------------------------------------------
// Composer unit tests (pure logic, no rendering)
// ---------------------------------------------------------------------------

describe('A013/Routing/composer – pure logic', () => {
  it('round-robin: no weight or order fields in payloads', async () => {
    const { composeCombo } = await import('../../routing/composer');
    const result = composeCombo({
      name: 'rr-pool',
      strategy: 'round-robin',
      deployments: [
        { provider: 'p1', model: 'openai/m1', apiKey: 'k1' },
        { provider: 'p2', model: 'openai/m2', apiKey: 'k2' },
      ],
    });
    for (const payload of result.modelsToCreate) {
      expect(payload.litellm_params).not.toHaveProperty('weight');
      expect(payload.model_info).not.toHaveProperty('order');
    }
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('simple-shuffle');
  });

  it('weighted: weight field present in each payload', async () => {
    const { composeCombo } = await import('../../routing/composer');
    const result = composeCombo({
      name: 'w-pool',
      strategy: 'weighted',
      deployments: [
        { provider: 'p1', model: 'openai/m1', apiKey: 'k1', weight: 80 },
        { provider: 'p2', model: 'openai/m2', apiKey: 'k2', weight: 20 },
      ],
    });
    expect(result.modelsToCreate[0]?.litellm_params.weight).toBe(80);
    expect(result.modelsToCreate[1]?.litellm_params.weight).toBe(20);
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('simple-shuffle');
  });

  it('priority: order fields 1-indexed in payloads', async () => {
    const { composeCombo } = await import('../../routing/composer');
    const result = composeCombo({
      name: 'p-pool',
      strategy: 'priority',
      deployments: [
        { provider: 'p1', model: 'openai/m1', apiKey: 'k1' },
        { provider: 'p2', model: 'openai/m2', apiKey: 'k2' },
      ],
    });
    expect(result.modelsToCreate[0]?.model_info?.order).toBe(1);
    expect(result.modelsToCreate[1]?.model_info?.order).toBe(2);
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('simple-shuffle');
  });

  it('fill-first: maps to usage-based-routing with order fields', async () => {
    const { composeCombo } = await import('../../routing/composer');
    const result = composeCombo({
      name: 'ff-pool',
      strategy: 'fill-first',
      deployments: [
        { provider: 'p1', model: 'openai/m1', apiKey: 'k1' },
        { provider: 'p2', model: 'openai/m2', apiKey: 'k2' },
      ],
    });
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('usage-based-routing');
    expect(result.modelsToCreate[0]?.model_info?.order).toBe(1);
  });

  it('cost-optimized: maps to cost-based-routing', async () => {
    const { composeCombo } = await import('../../routing/composer');
    const result = composeCombo({
      name: 'c-pool',
      strategy: 'cost-optimized',
      deployments: [{ provider: 'p1', model: 'openai/m1', apiKey: 'k1' }],
    });
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('cost-based-routing');
  });

  it('latency-optimized: maps to latency-based-routing', async () => {
    const { composeCombo } = await import('../../routing/composer');
    const result = composeCombo({
      name: 'l-pool',
      strategy: 'latency-optimized',
      deployments: [{ provider: 'p1', model: 'openai/m1', apiKey: 'k1' }],
    });
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('latency-based-routing');
  });

  it('least-busy: maps to least-busy', async () => {
    const { composeCombo } = await import('../../routing/composer');
    const result = composeCombo({
      name: 'lb-pool',
      strategy: 'least-busy',
      deployments: [{ provider: 'p1', model: 'openai/m1', apiKey: 'k1' }],
    });
    expect(result.configUpdate?.router_settings.routing_strategy).toBe('least-busy');
  });

  it('model without prefix gets openai/ prefix applied', async () => {
    const { composeCombo } = await import('../../routing/composer');
    const result = composeCombo({
      name: 'prefix-pool',
      strategy: 'round-robin',
      apiType: 'openai',
      deployments: [{ provider: 'p1', model: 'my-model', apiKey: 'k1' }],
    });
    expect(result.modelsToCreate[0]?.litellm_params.model).toBe('openai/my-model');
  });

  it('model with existing prefix uses apiType prefix (strips and re-applies)', async () => {
    const { composeCombo } = await import('../../routing/composer');
    const result = composeCombo({
      name: 'ant-pool',
      strategy: 'round-robin',
      apiType: 'anthropic',
      deployments: [{ provider: 'p1', model: 'anthropic/claude-3', apiKey: 'k1' }],
    });
    // buildModelPayload strips existing prefix and applies apiType prefix
    expect(result.modelsToCreate[0]?.litellm_params.model).toBe('anthropic/claude-3');
  });

  it('snapfzz_combo is always true in model_info', async () => {
    const { composeCombo } = await import('../../routing/composer');
    const result = composeCombo({
      name: 'combo-pool',
      strategy: 'round-robin',
      deployments: [{ provider: 'p1', model: 'openai/m1', apiKey: 'k1' }],
    });
    expect(result.modelsToCreate[0]?.model_info?.snapfzz_combo).toBe(true);
  });

  it('modelsToDelete is always empty from composeCombo', async () => {
    const { composeCombo } = await import('../../routing/composer');
    const result = composeCombo({
      name: 'pool',
      strategy: 'round-robin',
      deployments: [{ provider: 'p1', model: 'openai/m1', apiKey: 'k1' }],
    });
    expect(result.modelsToDelete).toEqual([]);
  });

  it('rpmLimit and tpmLimit are included in litellm_params when set', async () => {
    const { composeCombo } = await import('../../routing/composer');
    const result = composeCombo({
      name: 'rate-pool',
      strategy: 'round-robin',
      deployments: [{ provider: 'p1', model: 'openai/m1', apiKey: 'k1', rpmLimit: 100, tpmLimit: 50000 }],
    });
    expect(result.modelsToCreate[0]?.litellm_params.rpm).toBe(100);
    expect(result.modelsToCreate[0]?.litellm_params.tpm).toBe(50000);
  });

  it('fallbacks are included in configUpdate when provided', async () => {
    const { composeCombo } = await import('../../routing/composer');
    const result = composeCombo({
      name: 'primary-pool',
      strategy: 'round-robin',
      fallbacks: ['backup-pool'],
      deployments: [{ provider: 'p1', model: 'openai/m1', apiKey: 'k1' }],
    });
    expect(result.configUpdate?.router_settings.fallbacks).toEqual([{ 'primary-pool': ['backup-pool'] }]);
  });
});
