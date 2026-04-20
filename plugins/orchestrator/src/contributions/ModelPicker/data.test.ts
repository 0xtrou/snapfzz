// Per A013/ModelPicker + feedback/five-layer: pure TS data layer tests.
// No React, no DOM — runs at native TypeScript speed.

import { describe, it, expect } from 'vitest';
import {
  deriveCapabilities,
  toCostPer1M,
  formatCost,
  toContextWindow,
  formatTokenCount,
  extractProvider,
  toDescriptor,
  filterBySearch,
  sortForDisplay,
  SELECTED_MODEL_STORAGE_KEY,
  PINNED_MODELS_STORAGE_KEY,
} from './data';
import type { ModelInfoEntry } from '@snapfzz/shared';
import type { ModelDescriptor } from './contracts';

// ─── Storage keys ─────────────────────────────────────────────────────────────

describe('A013/ModelPicker/data: storage keys', () => {
  it('A013/data: SELECTED_MODEL_STORAGE_KEY is defined', () => {
    expect(SELECTED_MODEL_STORAGE_KEY).toBe('model.selectedId');
  });
  it('A013/data: PINNED_MODELS_STORAGE_KEY is defined', () => {
    expect(PINNED_MODELS_STORAGE_KEY).toBe('model.pinnedIds');
  });
});

// ─── deriveCapabilities ───────────────────────────────────────────────────────

describe('A013/ModelPicker/data: deriveCapabilities', () => {
  it('A013/data: all false when info is empty', () => {
    expect(deriveCapabilities({})).toEqual({ vision: false, tools: false, reasoning: false });
  });

  it('A013/data: vision=true when supports_vision is true', () => {
    expect(deriveCapabilities({ supports_vision: true }).vision).toBe(true);
  });

  it('A013/data: tools=true when supports_function_calling is true', () => {
    expect(deriveCapabilities({ supports_function_calling: true }).tools).toBe(true);
  });

  it('A013/data: reasoning=true when supports_reasoning is true', () => {
    expect(deriveCapabilities({ supports_reasoning: true }).reasoning).toBe(true);
  });

  it('A013/data: false flags when explicitly false', () => {
    const caps = deriveCapabilities({
      supports_vision: false,
      supports_function_calling: false,
      supports_reasoning: false,
    });
    expect(caps).toEqual({ vision: false, tools: false, reasoning: false });
  });
});

// ─── toCostPer1M ─────────────────────────────────────────────────────────────

describe('A013/ModelPicker/data: toCostPer1M', () => {
  it('A013/data: returns null for undefined', () => {
    expect(toCostPer1M(undefined)).toBeNull();
  });

  it('A013/data: returns null for null', () => {
    expect(toCostPer1M(null)).toBeNull();
  });

  it('A013/data: converts per-token to per-1M', () => {
    // 0.000001 per token → $1 per 1M
    expect(toCostPer1M(0.000001)).toBe(1);
  });

  it('A013/data: rounds to 2 decimal places', () => {
    // 0.0000015 → $1.50 per 1M
    expect(toCostPer1M(0.0000015)).toBe(1.5);
  });

  it('A013/data: handles NaN → null', () => {
    expect(toCostPer1M(NaN)).toBeNull();
  });
});

// ─── formatCost ──────────────────────────────────────────────────────────────

describe('A013/ModelPicker/data: formatCost', () => {
  it('A013/data: formats both known', () => {
    expect(formatCost(1, 3)).toBe('$1/$3');
  });

  it('A013/data: returns null when both null', () => {
    expect(formatCost(null, null)).toBeNull();
  });

  it('A013/data: uses ? for unknown input', () => {
    expect(formatCost(null, 3)).toBe('?/$3');
  });

  it('A013/data: uses ? for unknown output', () => {
    expect(formatCost(1, null)).toBe('$1/?');
  });
});

// ─── toContextWindow ─────────────────────────────────────────────────────────

describe('A013/ModelPicker/data: toContextWindow', () => {
  it('A013/data: prefers max_input_tokens over max_tokens', () => {
    expect(toContextWindow({ max_input_tokens: 128000, max_tokens: 4096 })).toBe(128000);
  });

  it('A013/data: falls back to max_tokens when max_input_tokens is missing', () => {
    expect(toContextWindow({ max_tokens: 8192 })).toBe(8192);
  });

  it('A013/data: returns null when no token fields present', () => {
    expect(toContextWindow({})).toBeNull();
  });

  it('A013/data: returns null for zero or negative values', () => {
    expect(toContextWindow({ max_tokens: 0 })).toBeNull();
    expect(toContextWindow({ max_input_tokens: -1 })).toBeNull();
  });

  it('A013/data: returns null for non-finite values', () => {
    expect(toContextWindow({ max_tokens: Number.NaN })).toBeNull();
    expect(toContextWindow({ max_input_tokens: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

// ─── formatTokenCount ────────────────────────────────────────────────────────

describe('A013/ModelPicker/data: formatTokenCount', () => {
  it('A013/data: returns null for null', () => {
    expect(formatTokenCount(null)).toBeNull();
  });

  it('A013/data: renders sub-1k counts raw', () => {
    expect(formatTokenCount(512)).toBe('512');
  });

  it('A013/data: renders thousands as "Nk"', () => {
    expect(formatTokenCount(128_000)).toBe('128k');
    expect(formatTokenCount(8_192)).toBe('8k');
  });

  it('A013/data: renders millions as "N.NM" with one decimal', () => {
    expect(formatTokenCount(1_000_000)).toBe('1M');
    expect(formatTokenCount(2_500_000)).toBe('2.5M');
  });
});

// ─── extractProvider ─────────────────────────────────────────────────────────

describe('A013/ModelPicker/data: extractProvider', () => {
  it('A013/data: extracts from litellm_params.model slash prefix', () => {
    const entry: ModelInfoEntry = {
      model_name: 'gpt-4',
      litellm_params: { model: 'openai/gpt-4' },
      model_info: {},
    };
    expect(extractProvider(entry)).toBe('openai');
  });

  it('A013/data: falls back to litellm_provider field', () => {
    const entry: ModelInfoEntry = {
      model_name: 'gpt-4',
      model_info: { litellm_provider: 'anthropic' },
    };
    expect(extractProvider(entry)).toBe('anthropic');
  });

  it('A013/data: falls back to model_name slash prefix', () => {
    const entry: ModelInfoEntry = {
      model_name: 'anthropic/claude-3',
      model_info: {},
    };
    expect(extractProvider(entry)).toBe('anthropic');
  });

  it('A013/data: returns unknown when no slash anywhere', () => {
    const entry: ModelInfoEntry = {
      model_name: 'gpt4',
      model_info: {},
    };
    expect(extractProvider(entry)).toBe('unknown');
  });
});

// ─── toDescriptor ─────────────────────────────────────────────────────────────

describe('A013/ModelPicker/data: toDescriptor', () => {
  it('A013/data: maps entry to ModelDescriptor correctly', () => {
    const entry: ModelInfoEntry = {
      model_name: 'openai/gpt-4',
      litellm_params: { model: 'openai/gpt-4' },
      model_info: {
        supports_vision: true,
        supports_function_calling: true,
        input_cost_per_token: 0.00001,
        output_cost_per_token: 0.00003,
      },
    };
    const desc = toDescriptor(entry);
    expect(desc.id).toBe('openai/gpt-4');
    expect(desc.provider).toBe('openai');
    expect(desc.capabilities.vision).toBe(true);
    expect(desc.capabilities.tools).toBe(true);
    expect(desc.inputCostPer1M).toBe(10);
    expect(desc.outputCostPer1M).toBe(30);
  });

  it('A013/data: handles missing costs gracefully', () => {
    const entry: ModelInfoEntry = { model_name: 'x', model_info: {} };
    const desc = toDescriptor(entry);
    expect(desc.inputCostPer1M).toBeNull();
    expect(desc.outputCostPer1M).toBeNull();
  });
});

// ─── filterBySearch ───────────────────────────────────────────────────────────

describe('A013/ModelPicker/data: filterBySearch', () => {
  const models: ModelDescriptor[] = [
    { id: 'openai/gpt-4', displayName: 'openai/gpt-4', provider: 'openai', capabilities: { vision: false, tools: false, reasoning: false }, inputCostPer1M: null, outputCostPer1M: null, contextWindow: null },
    { id: 'anthropic/claude-3', displayName: 'anthropic/claude-3', provider: 'anthropic', capabilities: { vision: false, tools: false, reasoning: false }, inputCostPer1M: null, outputCostPer1M: null, contextWindow: null },
  ];

  it('A013/data: empty query returns all', () => {
    expect(filterBySearch(models, '')).toHaveLength(2);
  });

  it('A013/data: filters by display name (case-insensitive)', () => {
    const result = filterBySearch(models, 'GPT');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('openai/gpt-4');
  });

  it('A013/data: filters by provider', () => {
    const result = filterBySearch(models, 'anthropic');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('anthropic/claude-3');
  });

  it('A013/data: returns empty for no matches', () => {
    expect(filterBySearch(models, 'gemini')).toHaveLength(0);
  });
});

// ─── sortForDisplay (flat: pinned first, then alphabetical) ────────────────────

describe('A013/ModelPicker/data: sortForDisplay', () => {
  const mk = (id: string, provider: string): ModelDescriptor => ({
    id,
    displayName: id,
    provider,
    capabilities: { vision: false, tools: false, reasoning: false },
    inputCostPer1M: null,
    outputCostPer1M: null,
    contextWindow: null,
  });

  it('A013/data: sorts alphabetically by provider then name when no pins', () => {
    const models = [mk('b', 'z'), mk('a', 'a'), mk('c', 'a')];
    const sorted = sortForDisplay(models, []);
    expect(sorted.map((m) => m.id)).toEqual(['a', 'c', 'b']);
  });

  it('A013/data: pinned models come first, preserving alphabetical order within each group', () => {
    const models = [
      mk('zebra', 'z'),
      mk('alpha', 'a'),
      mk('bravo', 'b'),
      mk('charlie', 'c'),
    ];
    const sorted = sortForDisplay(models, ['zebra', 'bravo']);
    // pinned first (alpha within pinned: bravo, zebra) — then rest (alpha, charlie)
    expect(sorted.map((m) => m.id)).toEqual(['bravo', 'zebra', 'alpha', 'charlie']);
  });

  it('A013/data: does not mutate the input array', () => {
    const models = [mk('z', 'z'), mk('a', 'a')];
    const snapshot = models.map((m) => m.id);
    sortForDisplay(models, ['z']);
    expect(models.map((m) => m.id)).toEqual(snapshot);
  });

  it('A013/data: unknown pin ids are ignored (no dead entries in output)', () => {
    const models = [mk('a', 'a'), mk('b', 'b')];
    const sorted = sortForDisplay(models, ['does-not-exist']);
    expect(sorted.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

// NOTE: combo-detection / target-resolution tests live in
// `frontend/packages/shared/src/llm/orchestrator.test.ts` — the helpers moved
// to `@snapfzz/shared/llm/orchestrator` so settings-llm and the orchestrator
// plugin can share them, and the tests moved with them.
