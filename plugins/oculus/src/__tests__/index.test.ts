import { describe, it, expect } from 'vitest';
import plugin from '../index';

describe('oculus plugin manifest', () => {
  it('has correct id', () => {
    expect(plugin.id).toBe('snapfzz.oculus');
  });

  it('has correct name', () => {
    expect(plugin.name).toBe('Oculus');
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
