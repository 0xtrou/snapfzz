// A013/Catalog: Tests for the bundled model catalog lookup module.

import { describe, it, expect } from 'vitest';
import {
  getProviderIds,
  getModelsForProvider,
  getCatalogModelInfo,
  getProviderInfo,
} from '../catalog';

describe('A013/Catalog', () => {
  it('getProviderIds returns a non-empty sorted array of unique provider IDs', () => {
    const ids = getProviderIds();
    expect(ids.length).toBeGreaterThan(0);
    // Should be sorted
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    // Should contain well-known providers
    expect(ids).toContain('openai');
    expect(ids).toContain('anthropic');
    // No duplicates
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getModelsForProvider returns models for a known provider', () => {
    const openaiModels = getModelsForProvider('openai');
    expect(openaiModels.length).toBeGreaterThan(0);
    // Each entry has id and info
    for (const m of openaiModels) {
      expect(m.id).toBeTruthy();
      expect(m.info.litellm_provider).toBe('openai');
    }
  });

  it('getModelsForProvider returns empty array for unknown provider', () => {
    const models = getModelsForProvider('nonexistent_provider_xyz');
    expect(models).toEqual([]);
  });

  it('getCatalogModelInfo returns entry for known model', () => {
    const info = getCatalogModelInfo('gpt-4o');
    expect(info).toBeDefined();
    expect(info!.litellm_provider).toBe('openai');
    expect(info!.mode).toBe('chat');
  });

  it('getCatalogModelInfo returns undefined for unknown model', () => {
    expect(getCatalogModelInfo('nonexistent/model')).toBeUndefined();
  });

  it('getCatalogModelInfo returns undefined for sample_spec', () => {
    expect(getCatalogModelInfo('sample_spec')).toBeUndefined();
  });

  it('getProviderInfo returns model count and modes', () => {
    const info = getProviderInfo('openai');
    expect(info.modelCount).toBeGreaterThan(0);
    expect(info.modes).toContain('chat');
    expect(Array.isArray(info.modes)).toBe(true);
  });

  it('getProviderInfo returns zero count for unknown provider', () => {
    const info = getProviderInfo('nonexistent_provider_xyz');
    expect(info.modelCount).toBe(0);
    expect(info.modes).toEqual([]);
  });
});
