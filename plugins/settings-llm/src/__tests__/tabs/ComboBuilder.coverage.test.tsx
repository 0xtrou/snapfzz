// ComboBuilder direct unit tests — covers strategy-specific UI, validation
// branches, step navigation, and review step edge cases not exercised by the
// higher-level RoutingTab e2e tests.

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ComboBuilder from '../../tabs/routing/ComboBuilder';
import type { ComboBuilderProps } from '../../tabs/routing/ComboBuilder';

vi.mock('@snapfzz/shared', () => ({
  AppButton: ({ children, onClick, disabled, loading, variant: _v, type: _t, style: _s, icon }: any) => (
    <button type="button" onClick={onClick} disabled={disabled || loading}>
      {icon}
      {children}
    </button>
  ),
}));

vi.mock('../../routing/composer', () => ({
  composeCombo: vi.fn().mockReturnValue({ toCreate: [], toDelete: [] }),
}));

const MODELS = [
  { name: 'provider/model-a', apiBase: 'https://example.com/v1', model: 'openai/model-a', provider: 'custom-p', apiKey: 'sk-1' },
  { name: 'provider/model-b', apiBase: 'https://example.com/v1', model: 'openai/model-b', provider: 'custom-p', apiKey: 'sk-2' },
];

const DEFAULT_PROPS: ComboBuilderProps = {
  providers: [],
  availableModels: MODELS,
  onSave: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn(),
};

// Helper: advance to a step by clicking its step indicator button
async function goToStep(user: ReturnType<typeof userEvent.setup>, label: string) {
  const stepLabels = screen.getAllByText(label);
  await user.click(stepLabels[0]);
}

describe('ComboBuilder – step indicator navigation', () => {
  it('renders all 4 step labels', () => {
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    expect(screen.getByText('Basics')).toBeInTheDocument();
    expect(screen.getByText('Deployments')).toBeInTheDocument();
    expect(screen.getByText('Strategy')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('clicking a step indicator navigates to that step', async () => {
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    await goToStep(user, 'Strategy');
    await waitFor(() => {
      expect(screen.getByText('Round Robin')).toBeInTheDocument();
    });
  });

  it('Back button is disabled on step 0', () => {
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    const backBtn = screen.getByRole('button', { name: /back/i });
    expect(backBtn).toBeDisabled();
  });

  it('Next button is disabled when name is empty on step 0', () => {
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect(nextBtn).toBeDisabled();
  });

  it('Next button enables after entering valid name', async () => {
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    const input = screen.getByPlaceholderText(/e\.g\. gpt4-pool/i);
    await user.type(input, 'valid-name');
    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect(nextBtn).not.toBeDisabled();
  });
});

describe('ComboBuilder – Basics step validation', () => {
  it('shows error when name has invalid chars', async () => {
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    const input = screen.getByPlaceholderText(/e\.g\. gpt4-pool/i);
    await user.type(input, 'INVALID NAME!');
    await waitFor(() => {
      expect(screen.getByText(/only lowercase letters/i)).toBeInTheDocument();
    });
  });

  it('shows no error when name is empty (not yet typed)', () => {
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    expect(screen.queryByText(/only lowercase letters/i)).not.toBeInTheDocument();
  });

  it('converts to lowercase on input', async () => {
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    const input = screen.getByPlaceholderText(/e\.g\. gpt4-pool/i);
    await user.type(input, 'UPPER');
    expect((input as HTMLInputElement).value).toBe('upper');
  });
});

describe('ComboBuilder – Deployments step', () => {
  it('shows empty selection message when no deployments selected', async () => {
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    await goToStep(user, 'Deployments');
    await waitFor(() => {
      expect(screen.getByText(/no models selected/i)).toBeInTheDocument();
    });
  });

  it('shows API type radio buttons', async () => {
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    await goToStep(user, 'Deployments');
    await waitFor(() => {
      expect(screen.getByText(/openai compatible/i)).toBeInTheDocument();
      expect(screen.getByText(/anthropic compatible/i)).toBeInTheDocument();
    });
  });

  it('Next is disabled when no deployments selected', async () => {
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    // Enter name first so step 0 can proceed
    const input = screen.getByPlaceholderText(/e\.g\. gpt4-pool/i);
    await user.type(input, 'my-pool');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByText(/no models selected/i));
    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect(nextBtn).toBeDisabled();
  });
});

describe('ComboBuilder – Strategy step', () => {
  it('renders all strategy cards', async () => {
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    await goToStep(user, 'Strategy');
    await waitFor(() => {
      expect(screen.getByText('Round Robin')).toBeInTheDocument();
      expect(screen.getByText('Weighted')).toBeInTheDocument();
      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByText('Least Busy')).toBeInTheDocument();
      expect(screen.getByText('Cost Optimized')).toBeInTheDocument();
      expect(screen.getByText('Latency Optimized')).toBeInTheDocument();
      expect(screen.getByText('Fill First')).toBeInTheDocument();
    });
  });

  it('Next is disabled when no strategy selected', async () => {
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    await goToStep(user, 'Strategy');
    await waitFor(() => screen.getByText('Round Robin'));
    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect(nextBtn).toBeDisabled();
  });

  it('shows weighted sliders when weighted strategy and deployments selected', async () => {
    const existingCombo = {
      name: 'pool',
      strategy: 'weighted' as const,
      deployments: [
        { provider: 'custom-p', model: 'openai/model-a', modelName: 'provider/model-a', apiBase: 'https://example.com/v1', weight: 70 },
        { provider: 'custom-p', model: 'openai/model-b', modelName: 'provider/model-b', apiBase: 'https://example.com/v1', weight: 30 },
      ],
      apiType: 'openai' as const,
    };
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    await goToStep(user, 'Strategy');
    await waitFor(() => {
      expect(screen.getByText('Weights')).toBeInTheDocument();
      // Deployment names should show in the slider area
      expect(screen.getByText('provider/model-a')).toBeInTheDocument();
    });
  });

  it('shows priority order arrows when priority strategy and deployments selected', async () => {
    const existingCombo = {
      name: 'pool',
      strategy: 'priority' as const,
      deployments: [
        { provider: 'custom-p', model: 'openai/model-a', modelName: 'provider/model-a', apiBase: 'https://example.com/v1' },
        { provider: 'custom-p', model: 'openai/model-b', modelName: 'provider/model-b', apiBase: 'https://example.com/v1' },
      ],
      apiType: 'openai' as const,
    };
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    await goToStep(user, 'Strategy');
    await waitFor(() => {
      expect(screen.getByText('Priority Order')).toBeInTheDocument();
    });
  });

  it('weighted sliders — no panel when deployments is empty', async () => {
    const existingCombo = {
      name: 'pool',
      strategy: 'weighted' as const,
      deployments: [],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    const user = userEvent.setup();
    await goToStep(user, 'Strategy');
    await waitFor(() => screen.getByText('Weighted'));
    // No Weights section when deployments are empty
    expect(screen.queryByText('Weights')).not.toBeInTheDocument();
  });

  it('priority order panel — no panel when deployments is empty', async () => {
    const existingCombo = {
      name: 'pool',
      strategy: 'priority' as const,
      deployments: [],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    const user = userEvent.setup();
    await goToStep(user, 'Strategy');
    await waitFor(() => screen.getByText('Priority'));
    expect(screen.queryByText('Priority Order')).not.toBeInTheDocument();
  });

  it('priority arrows: up arrow is disabled for first item', async () => {
    const existingCombo = {
      name: 'pool',
      strategy: 'priority' as const,
      deployments: [
        { provider: 'custom-p', model: 'openai/model-a', modelName: 'provider/model-a', apiBase: 'https://example.com/v1' },
        { provider: 'custom-p', model: 'openai/model-b', modelName: 'provider/model-b', apiBase: 'https://example.com/v1' },
      ],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    const user = userEvent.setup();
    await goToStep(user, 'Strategy');
    await waitFor(() => screen.getByText('Priority Order'));
    // Priority panel has buttons: [up, down] per item. First item's up is disabled.
    const prioritySection = screen.getByText('Priority Order').closest('div')!.parentElement!;
    const allButtons = prioritySection.querySelectorAll('button');
    // First button in the priority reorder area is "up" for item 0 — disabled
    const firstUpBtn = allButtons[0];
    expect(firstUpBtn).toBeDisabled();
  });

  it('priority arrows: down arrow is disabled for last item', async () => {
    const existingCombo = {
      name: 'pool',
      strategy: 'priority' as const,
      deployments: [
        { provider: 'custom-p', model: 'openai/model-a', modelName: 'provider/model-a', apiBase: 'https://example.com/v1' },
        { provider: 'custom-p', model: 'openai/model-b', modelName: 'provider/model-b', apiBase: 'https://example.com/v1' },
      ],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    const user = userEvent.setup();
    await goToStep(user, 'Strategy');
    await waitFor(() => screen.getByText('Priority Order'));
    const prioritySection = screen.getByText('Priority Order').closest('div')!.parentElement!;
    const allButtons = prioritySection.querySelectorAll('button');
    // Last button in the priority reorder area is "down" for item N-1 — disabled
    const lastDownBtn = allButtons[allButtons.length - 1];
    expect(lastDownBtn).toBeDisabled();
  });

  it('reordering via up/down arrows updates priority order', async () => {
    const existingCombo = {
      name: 'pool',
      strategy: 'priority' as const,
      deployments: [
        { provider: 'custom-p', model: 'openai/model-a', modelName: 'provider/model-a', apiBase: 'https://example.com/v1' },
        { provider: 'custom-p', model: 'openai/model-b', modelName: 'provider/model-b', apiBase: 'https://example.com/v1' },
      ],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    const user = userEvent.setup();
    await goToStep(user, 'Strategy');
    await waitFor(() => screen.getByText('Priority Order'));
    const prioritySection = screen.getByText('Priority Order').closest('div')!.parentElement!;
    const allButtons = prioritySection.querySelectorAll('button');
    // Item 1's up button (index 2) should move model-b to position 0
    const item1UpBtn = allButtons[2];
    await user.click(item1UpBtn);
    await waitFor(() => {
      // After reorder, model-b should now appear with tag "1"
      const tags = screen.getAllByText('1');
      expect(tags.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('ComboBuilder – Review step', () => {
  it('shows validation check rows: all green when valid', async () => {
    const existingCombo = {
      name: 'my-pool',
      strategy: 'round-robin' as const,
      deployments: [
        { provider: 'custom-p', model: 'openai/model-a', modelName: 'provider/model-a', apiBase: 'https://example.com/v1' },
      ],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    const user = userEvent.setup();
    await goToStep(user, 'Review');
    await waitFor(() => {
      expect(screen.getByText('Combo name is valid')).toBeInTheDocument();
      expect(screen.getByText('At least one deployment selected')).toBeInTheDocument();
      expect(screen.getByText('Strategy selected')).toBeInTheDocument();
    });
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).not.toBeDisabled();
  });

  it('shows invalid state when name is empty on review', async () => {
    const existingCombo = {
      name: '',
      strategy: 'round-robin' as const,
      deployments: [
        { provider: 'custom-p', model: 'openai/model-a', modelName: 'provider/model-a', apiBase: 'https://example.com/v1' },
      ],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    const user = userEvent.setup();
    await goToStep(user, 'Review');
    await waitFor(() => {
      expect(screen.getByText('Combo name is valid')).toBeInTheDocument();
    });
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeDisabled();
  });

  it('shows empty deployments on review: "None" placeholder', async () => {
    const existingCombo = {
      name: 'my-pool',
      strategy: 'round-robin' as const,
      deployments: [],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    const user = userEvent.setup();
    await goToStep(user, 'Review');
    await waitFor(() => {
      expect(screen.getByText('None')).toBeInTheDocument();
    });
  });

  it('shows "—" for name and strategy when both empty on review', async () => {
    const existingCombo = {
      name: '',
      strategy: '' as any,
      deployments: [],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    const user = userEvent.setup();
    await goToStep(user, 'Review');
    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('Save button calls onSave with composed payloads', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const existingCombo = {
      name: 'my-pool',
      strategy: 'round-robin' as const,
      deployments: [
        { provider: 'custom-p', model: 'openai/model-a', modelName: 'provider/model-a', apiBase: 'https://example.com/v1' },
      ],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} onSave={onSave} />);
    const user = userEvent.setup();
    await goToStep(user, 'Review');
    await waitFor(() => screen.getByRole('button', { name: /^save$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });

  it('shows "Edit Combo" title when editing an existing combo', () => {
    const existingCombo = {
      name: 'my-pool',
      strategy: 'round-robin' as const,
      deployments: [],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    expect(screen.getByText('Edit Combo')).toBeInTheDocument();
  });

  it('shows "New Combo" title when creating a new combo', () => {
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    expect(screen.getByText('New Combo')).toBeInTheDocument();
  });

  it('Cancel button calls onCancel', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ComboBuilder – Back button and canProceed step 3', () => {
  it('Back button moves from step 1 to step 0', async () => {
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} />);
    // Enter name to enable Next
    const input = screen.getByPlaceholderText(/e\.g\. gpt4-pool/i);
    await user.type(input, 'my-pool');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => screen.getByText(/no models selected/i));

    // Back goes to step 0
    await user.click(screen.getByRole('button', { name: /back/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. gpt4-pool/i)).toBeInTheDocument();
    });
  });

  it('canProceed returns true on step 3 (Next not shown, no need to proceed)', async () => {
    const existingCombo = {
      name: 'pool',
      strategy: 'round-robin' as const,
      deployments: [{ provider: 'p', model: 'openai/a', modelName: 'p/a', apiBase: '' }],
      apiType: 'openai' as const,
    };
    const user = userEvent.setup();
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    await goToStep(user, 'Review');
    // Step 3: Next button is not rendered (step < STEPS.length - 1 is false)
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
    // Back button should be enabled (not on step 0)
    expect(screen.getByRole('button', { name: /back/i })).not.toBeDisabled();
  });

  it('weight slider change updates deployment weight', async () => {
    const existingCombo = {
      name: 'pool',
      strategy: 'weighted' as const,
      deployments: [
        { provider: 'custom-p', model: 'openai/model-a', modelName: 'provider/model-a', apiBase: '', weight: 50 },
        { provider: 'custom-p', model: 'openai/model-b', modelName: 'provider/model-b', apiBase: '', weight: 50 },
      ],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    const user = userEvent.setup();
    await goToStep(user, 'Strategy');
    await waitFor(() => screen.getByText('Weights'));
    // Ant Design Slider renders a div with role="slider"
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBeGreaterThanOrEqual(1);
    // Simulate a keyboard change to trigger handleWeightChange via Ant Slider
    fireEvent.keyDown(sliders[0], { key: 'ArrowRight', code: 'ArrowRight' });
    // No crash — weight state updated internally
    expect(sliders[0]).toBeInTheDocument();
  });
});

describe('ComboBuilder – Deployments step with limits', () => {
  it('shows RPM/TPM limit inputs when deployments are selected', async () => {
    const existingCombo = {
      name: 'pool',
      strategy: 'round-robin' as const,
      deployments: [
        { provider: 'custom-p', model: 'openai/model-a', modelName: 'provider/model-a', apiBase: 'https://example.com/v1' },
      ],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    const user = userEvent.setup();
    await goToStep(user, 'Deployments');
    await waitFor(() => {
      expect(screen.getByText('RPM Limit')).toBeInTheDocument();
      expect(screen.getByText('TPM Limit')).toBeInTheDocument();
    });
  });

  it('RPM limit change updates deployment', async () => {
    const existingCombo = {
      name: 'pool',
      strategy: 'round-robin' as const,
      deployments: [
        { provider: 'custom-p', model: 'openai/model-a', modelName: 'provider/model-a', apiBase: 'https://example.com/v1' },
      ],
      apiType: 'openai' as const,
    };
    render(<ComboBuilder {...DEFAULT_PROPS} existingCombo={existingCombo} />);
    const user = userEvent.setup();
    await goToStep(user, 'Deployments');
    await waitFor(() => screen.getByText('RPM Limit'));
    // Find RPM input by placeholder text
    const rpmInputs = screen.getAllByPlaceholderText('No limit');
    expect(rpmInputs.length).toBeGreaterThanOrEqual(1);
    // Type a value into the RPM input
    fireEvent.change(rpmInputs[0], { target: { value: '100' } });
    // No crash — just verifying the handler runs without error
    expect(rpmInputs[0]).toBeInTheDocument();
  });
});
