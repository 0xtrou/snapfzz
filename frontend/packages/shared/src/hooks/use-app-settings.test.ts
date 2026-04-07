import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeMock = vi.hoisted(() => ({
  isAvailable: true,
  invoke: vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(),
  listen: vi.fn<(event: string, handler: (payload: unknown) => void) => Promise<() => void>>(),
}));

class FontFaceMock {
  static failWoff2 = false;

  readonly source: string;

  constructor(_family: string, source: string) {
    this.source = source;
  }

  load(): Promise<FontFaceMock> {
    if (FontFaceMock.failWoff2 && this.source.includes('.woff2')) {
      return Promise.reject(new Error('woff2 failed'));
    }
    return Promise.resolve(this);
  }
}

vi.mock('../lib', () => ({
  createTauriBridge: () => bridgeMock,
}));

describe('useAppSettings', () => {
  beforeEach(() => {
    vi.resetModules();
    bridgeMock.isAvailable = true;
    bridgeMock.listen.mockReset().mockResolvedValue(vi.fn());
    bridgeMock.invoke.mockReset().mockImplementation(async (command) => {
      if (command === 'get_settings') {
        return { theme: 'dark', fontFamily: 'Inter', fontSize: '14' };
      }
      if (command === 'list_installed_fonts') {
        return [];
      }
      if (command === 'get_data_dir') {
        return '/tmp/snapfzz';
      }
      return undefined;
    });

    FontFaceMock.failWoff2 = false;
    Object.defineProperty(globalThis, 'FontFace', {
      configurable: true,
      writable: true,
      value: FontFaceMock,
    });

    const addFont = vi.fn();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: addFont },
    });

    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('--font-family');
    document.documentElement.style.removeProperty('--font-size');
    document.body.style.fontFamily = '';
    document.body.style.fontSize = '';
    document.getElementById('snapfzz-font-override')?.remove();

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.getElementById('snapfzz-font-override')?.remove();
    document.documentElement.removeAttribute('data-theme');
  });

  it('returns theme, toggleTheme, and customFonts', async () => {
    const { useAppSettings } = await import('./use-app-settings');

    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => {
      expect(result.current.theme).toBe('dark');
      expect(result.current.customFonts).toEqual([]);
    });

    expect(typeof result.current.toggleTheme).toBe('function');
  });

  it('applies DOM theme and font settings', async () => {
    bridgeMock.invoke.mockImplementation(async (command) => {
      if (command === 'get_settings') {
        return { theme: 'light', fontFamily: 'JetBrains Mono', fontSize: '18' };
      }
      if (command === 'list_installed_fonts') return [];
      return '/tmp/snapfzz';
    });
    const { useAppSettings } = await import('./use-app-settings');

    renderHook(() => useAppSettings());

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.body.style.fontFamily).toContain('JetBrains Mono');
      expect(document.body.style.fontSize).toBe('18px');
    });

    expect(document.documentElement.style.getPropertyValue('--font-family')).toContain('JetBrains Mono');
    expect(document.documentElement.style.getPropertyValue('--font-size')).toBe('18px');
    expect(document.getElementById('snapfzz-font-override')?.textContent).toContain('font-family: JetBrains Mono');
  });

  it('resolves system theme using matchMedia (dark and light)', async () => {
    bridgeMock.invoke.mockImplementation(async (command) => {
      if (command === 'get_settings') return { theme: 'system', fontFamily: 'System', fontSize: '12' };
      if (command === 'list_installed_fonts') return [];
      return '/tmp/snapfzz';
    });
    const darkMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: darkMedia,
    });
    const { useAppSettings } = await import('./use-app-settings');

    const { result, rerender } = renderHook(() => useAppSettings());

    await waitFor(() => {
      expect(result.current.theme).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    const lightMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: lightMedia,
    });

    bridgeMock.invoke.mockImplementation(async (command) => {
      if (command === 'get_settings') return { theme: 'system', fontFamily: 'System', fontSize: '12' };
      if (command === 'list_installed_fonts') return [];
      return '/tmp/snapfzz';
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('snapfzz:settings-changed'));
      rerender();
    });

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });

  it('uses fallback defaults for invalid font size and system font alias', async () => {
    bridgeMock.invoke.mockImplementation(async (command) => {
      if (command === 'get_settings') {
        return { theme: 'dark', fontFamily: 'System', fontSize: '0' };
      }
      if (command === 'list_installed_fonts') return [];
      return '/tmp/snapfzz';
    });
    const { useAppSettings } = await import('./use-app-settings');

    renderHook(() => useAppSettings());

    await waitFor(() => {
      expect(document.body.style.fontSize).toBe('14px');
    });
    expect(document.body.style.fontFamily).toContain('-apple-system');
  });

  it('toggles theme and saves flipped value via invoke', async () => {
    bridgeMock.invoke.mockImplementation(async (command) => {
      if (command === 'get_settings') return { theme: 'dark', fontFamily: 'Inter', fontSize: '14' };
      if (command === 'list_installed_fonts') return [];
      if (command === 'save_settings') return undefined;
      return '/tmp/snapfzz';
    });
    const { useAppSettings } = await import('./use-app-settings');

    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => {
      expect(result.current.theme).toBe('dark');
    });

    await act(async () => {
      await result.current.toggleTheme();
    });

    const saveCall = bridgeMock.invoke.mock.calls.find(([command]) => command === 'save_settings');
    expect(saveCall).toBeTruthy();
    expect(saveCall?.[1]).toEqual({
      settings: {
        theme: 'light',
        fontFamily: 'Inter',
        fontSize: '14',
      },
    });
  });

  it('listens to and responds to snapfzz:settings-changed, then removes listener on cleanup', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const tauriHandler = vi.fn();
    bridgeMock.listen.mockImplementation(async (_event, handler) => {
      tauriHandler.mockImplementation(handler as (payload: unknown) => void);
      return vi.fn();
    });

    const { useAppSettings } = await import('./use-app-settings');
    const { unmount } = renderHook(() => useAppSettings());

    await waitFor(() => {
      expect(bridgeMock.invoke).toHaveBeenCalledWith('get_settings');
    });

    const initialGetSettingsCalls = bridgeMock.invoke.mock.calls.filter(([cmd]) => cmd === 'get_settings').length;

    act(() => {
      window.dispatchEvent(new CustomEvent('snapfzz:settings-changed'));
    });

    await waitFor(() => {
      const afterDispatchCalls = bridgeMock.invoke.mock.calls.filter(([cmd]) => cmd === 'get_settings').length;
      expect(afterDispatchCalls).toBeGreaterThan(initialGetSettingsCalls);
    });

    act(() => {
      tauriHandler(undefined);
    });

    await waitFor(() => {
      const afterTauriCalls = bridgeMock.invoke.mock.calls.filter(([cmd]) => cmd === 'get_settings').length;
      expect(afterTauriCalls).toBeGreaterThan(initialGetSettingsCalls + 1);
    });

    expect(addSpy).toHaveBeenCalledWith('snapfzz:settings-changed', expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('snapfzz:settings-changed', expect.any(Function));
  });

  it('returns early when bridge is unavailable', async () => {
    bridgeMock.isAvailable = false;
    const { useAppSettings } = await import('./use-app-settings');

    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => {
      expect(result.current.theme).toBe('dark');
      expect(result.current.customFonts).toEqual([]);
    });

    expect(bridgeMock.invoke).not.toHaveBeenCalled();
  });

  it('handles font discovery and loading branches', async () => {
    const addSpy = vi.fn();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: addSpy },
    });

    bridgeMock.invoke.mockImplementation(async (command) => {
      if (command === 'get_settings') return { theme: 'dark', fontFamily: 'Inter', fontSize: '14' };
      if (command === 'list_installed_fonts') return ['A', 'B'];
      if (command === 'get_data_dir') return 'C:\\snapfzz';
      return undefined;
    });

    FontFaceMock.failWoff2 = true;
    const { useAppSettings } = await import('./use-app-settings');

    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => {
      expect(result.current.customFonts).toEqual(['A', 'B']);
    });

    expect(addSpy).toHaveBeenCalledTimes(2);
  });

  it('handles font listing and data dir failures gracefully', async () => {
    bridgeMock.invoke.mockImplementation(async (command) => {
      if (command === 'get_settings') return { theme: 'dark', fontFamily: 'Inter', fontSize: '14' };
      if (command === 'list_installed_fonts') throw new Error('list fail');
      return undefined;
    });
    const { useAppSettings } = await import('./use-app-settings');

    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => {
      expect(result.current.customFonts).toEqual([]);
    });

    bridgeMock.invoke.mockImplementation(async (command) => {
      if (command === 'get_settings') return { theme: 'dark', fontFamily: 'Inter', fontSize: '14' };
      if (command === 'list_installed_fonts') return ['X'];
      if (command === 'get_data_dir') throw new Error('dir fail');
      return undefined;
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('snapfzz:settings-changed'));
    });

    await waitFor(() => {
      expect(result.current.customFonts).toEqual(['X']);
    });
  });

  it('falls back to direct DOM toggle when backend save fails', async () => {
    bridgeMock.invoke.mockImplementation(async (command) => {
      if (command === 'get_settings') return { theme: 'dark', fontFamily: 'Inter', fontSize: '14' };
      if (command === 'list_installed_fonts') return [];
      if (command === 'save_settings') throw new Error('save failed');
      return '/tmp/snapfzz';
    });
    const { useAppSettings } = await import('./use-app-settings');
    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => {
      expect(result.current.theme).toBe('dark');
    });

    await act(async () => {
      await result.current.toggleTheme();
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(result.current.theme).toBe('light');
  });
});
