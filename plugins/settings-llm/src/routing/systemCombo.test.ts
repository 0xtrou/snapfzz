// Spec: A013/Orchestrator — system-combo registry + guard helpers.

import { describe, expect, it } from 'vitest';
import {
  SYSTEM_COMBO_LABEL,
  SYSTEM_COMBO_NAMES,
  SYSTEM_COMBO_TOOLTIP,
  isSystemCombo,
} from './systemCombo';

describe('A013/systemCombo: registry', () => {
  it('A013/systemCombo: `orchestrator` is the canonical system combo', () => {
    expect(SYSTEM_COMBO_NAMES.has('orchestrator')).toBe(true);
  });

  it('A013/systemCombo: isSystemCombo returns true for registered names', () => {
    expect(isSystemCombo('orchestrator')).toBe(true);
  });

  it('A013/systemCombo: isSystemCombo returns false for user combos', () => {
    expect(isSystemCombo('my-combo')).toBe(false);
    expect(isSystemCombo('')).toBe(false);
    expect(isSystemCombo('orchestrator-v2')).toBe(false);
  });

  it('A013/systemCombo: label + tooltip are non-empty strings', () => {
    expect(SYSTEM_COMBO_LABEL.length).toBeGreaterThan(0);
    expect(SYSTEM_COMBO_TOOLTIP.length).toBeGreaterThan(0);
  });
});
