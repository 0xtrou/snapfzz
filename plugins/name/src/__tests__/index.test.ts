import { describe, it, expect } from 'vitest';
import plugin from '../index';

describe('name plugin manifest', () => {
  it('has correct id', () => {
    expect(plugin.id).toBe('snapfzz.name');
  });

  it('has correct name', () => {
    expect(plugin.name).toBe('Name');
  });

  it('has a version', () => {
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has an activate function', () => {
    expect(typeof plugin.activate).toBe('function');
  });

  it('declares budget zone', () => {
    expect(plugin.budget.zone).toBeDefined();
  });
});
