// Pure TS tests for the orchestrator combo helpers — both settings-llm and
// the orchestrator plugin depend on this behaviour staying stable.

import { describe, expect, it } from 'vitest';
import {
  ORCHESTRATOR_COMBO_NAME,
  buildPickerListing,
  filterOutCombos,
  findOrchestratorUnderlyingTarget,
  isComboEntry,
} from './orchestrator';
import type { ModelInfoEntry } from './contracts';

function makeEntry(
  model_name: string,
  extras: {
    model?: string;
    api_base?: string;
    model_info?: Record<string, unknown>;
  } = {},
): ModelInfoEntry {
  return {
    model_name,
    litellm_params:
      extras.model || extras.api_base
        ? { model: extras.model, api_base: extras.api_base }
        : undefined,
    model_info: (extras.model_info ?? {}) as never,
  };
}

describe('A013/shared/orchestrator: combo detection', () => {
  it('exports the stable system combo name', () => {
    expect(ORCHESTRATOR_COMBO_NAME).toBe('orchestrator');
  });

  it('flags the orchestrator combo by name', () => {
    expect(isComboEntry(makeEntry('orchestrator'))).toBe(true);
  });

  it('flags any entry carrying snapfzz_system_combo=true', () => {
    expect(
      isComboEntry(makeEntry('foo', { model_info: { snapfzz_system_combo: true } })),
    ).toBe(true);
  });

  it('flags user-created combos via snapfzz_combo=true', () => {
    expect(
      isComboEntry(makeEntry('my-pool', { model_info: { snapfzz_combo: true } })),
    ).toBe(true);
  });

  it('treats plain imported models as non-combos', () => {
    expect(isComboEntry(makeEntry('acme/gpt-4'))).toBe(false);
  });
});

describe('A013/shared/orchestrator: filterOutCombos', () => {
  it('drops the orchestrator combo and user combos', () => {
    const entries = [
      makeEntry('acme/gpt-4'),
      makeEntry('orchestrator'),
      makeEntry('my-pool', { model_info: { snapfzz_combo: true } }),
      makeEntry('anthropic/claude'),
    ];
    expect(filterOutCombos(entries).map((e) => e.model_name)).toEqual([
      'acme/gpt-4',
      'anthropic/claude',
    ]);
  });
});

describe('A013/shared/orchestrator: findOrchestratorUnderlyingTarget', () => {
  it('returns null when no combo is present', () => {
    expect(findOrchestratorUnderlyingTarget([makeEntry('acme/gpt-4')])).toBeNull();
  });

  it('matches on litellm_params.model + api_base', () => {
    const entries = [
      makeEntry('acme/gpt-4', { model: 'openai/gpt-4', api_base: 'https://api.openai.com/v1' }),
      makeEntry('orchestrator', { model: 'openai/gpt-4', api_base: 'https://api.openai.com/v1' }),
    ];
    expect(findOrchestratorUnderlyingTarget(entries)?.model_name).toBe('acme/gpt-4');
  });

  it('returns null when the combo has no matching real target', () => {
    expect(
      findOrchestratorUnderlyingTarget([makeEntry('orchestrator', { model: 'openai/gpt-4' })]),
    ).toBeNull();
  });

  it('refuses to pick another combo as the underlying target', () => {
    const entries = [
      makeEntry('my-combo', {
        model: 'openai/gpt-4',
        model_info: { snapfzz_combo: true },
      }),
      makeEntry('orchestrator', { model: 'openai/gpt-4' }),
    ];
    expect(findOrchestratorUnderlyingTarget(entries)).toBeNull();
  });
});

describe('A013/shared/orchestrator: buildPickerListing', () => {
  it('returns real models plus the resolved orchestrator target in one pass', () => {
    const response = {
      data: [
        makeEntry('acme/gpt-4', { model: 'openai/gpt-4', api_base: 'https://api.openai.com/v1' }),
        makeEntry('orchestrator', { model: 'openai/gpt-4', api_base: 'https://api.openai.com/v1' }),
        makeEntry('anthropic/claude'),
      ],
    };
    const listing = buildPickerListing(response);
    expect(listing.models.map((m) => m.model_name)).toEqual([
      'acme/gpt-4',
      'anthropic/claude',
    ]);
    expect(listing.orchestratorTarget?.model_name).toBe('acme/gpt-4');
  });

  it('returns null target when combo is absent, still filters other combos', () => {
    const response = {
      data: [
        makeEntry('acme/gpt-4'),
        makeEntry('my-pool', { model_info: { snapfzz_combo: true } }),
      ],
    };
    const listing = buildPickerListing(response);
    expect(listing.models.map((m) => m.model_name)).toEqual(['acme/gpt-4']);
    expect(listing.orchestratorTarget).toBeNull();
  });
});
