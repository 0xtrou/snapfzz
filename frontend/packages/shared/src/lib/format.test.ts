import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatBytes, formatDate, formatTokens } from './format';

describe('format utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formatDate handles just-now, minutes, hours, days, and locale date', () => {
    expect(formatDate('2026-01-01T00:00:00.000Z')).toBe('just now');
    expect(formatDate('2025-12-31T23:30:00.000Z')).toBe('30m ago');
    expect(formatDate('2025-12-31T19:00:00.000Z')).toBe('5h ago');
    expect(formatDate('2025-12-29T00:00:00.000Z')).toBe('3d ago');
    expect(formatDate('2025-12-20T00:00:00.000Z')).toBe(new Date('2025-12-20T00:00:00.000Z').toLocaleDateString());
  });

  it('formatTokens renders under and over 1000', () => {
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1000)).toBe('1.0K');
    expect(formatTokens(1599)).toBe('1.6K');
  });

  it('formatBytes renders B, KB, and MB tiers', () => {
    expect(formatBytes(1023)).toBe('1023B');
    expect(formatBytes(1024)).toBe('1.0KB');
    expect(formatBytes(1536)).toBe('1.5KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0MB');
  });
});
