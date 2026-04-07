import { theme } from 'antd';
import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from './antd-theme';

describe('antd themes', () => {
  it('darkTheme uses dark algorithm and expected primary token', () => {
    expect(darkTheme.algorithm).toBe(theme.darkAlgorithm);
    expect(darkTheme.token?.colorPrimary).toBe('#3b82f6');
  });

  it('lightTheme uses default algorithm and expected primary token', () => {
    expect(lightTheme.algorithm).toBe(theme.defaultAlgorithm);
    expect(lightTheme.token?.colorPrimary).toBe('#2563eb');
  });

  it('both themes share font size and font family tokens', () => {
    expect(darkTheme.token?.fontSize).toBe(13);
    expect(lightTheme.token?.fontSize).toBe(13);
    expect(String(darkTheme.token?.fontFamily)).toContain('Inter');
    expect(String(lightTheme.token?.fontFamily)).toContain('Inter');
  });
});
