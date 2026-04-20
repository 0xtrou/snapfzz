// Spec: A013/Composer — pure-TS data layer tests.

import { describe, it, expect } from 'vitest';
import { COMPOSER_ACTIONS, UPLOAD_ACCEPT } from './data';

describe('A013/Composer/data: COMPOSER_ACTIONS', () => {
  it('A013/data: is frozen to prevent runtime mutation', () => {
    expect(Object.isFrozen(COMPOSER_ACTIONS)).toBe(true);
  });

  it('A013/data: ships at least one action', () => {
    expect(COMPOSER_ACTIONS.length).toBeGreaterThan(0);
  });

  it('A013/data: every action has id, label, Icon component', () => {
    for (const action of COMPOSER_ACTIONS) {
      expect(action.id.length).toBeGreaterThan(0);
      expect(action.label.length).toBeGreaterThan(0);
      expect(typeof action.Icon).toBe('object');
    }
  });

  it('A013/data: includes the upload action by id', () => {
    expect(COMPOSER_ACTIONS.some((a) => a.id === 'upload')).toBe(true);
  });
});

describe('A013/Composer/data: UPLOAD_ACCEPT', () => {
  it('A013/data: is a non-empty comma-separated accept string', () => {
    expect(UPLOAD_ACCEPT.length).toBeGreaterThan(0);
    expect(UPLOAD_ACCEPT).toContain('image/*');
  });
});
