import { useState, useEffect, useCallback } from 'react';

type Theme = 'dark' | 'light';

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem('snapfzz-theme');
  return stored === 'dark' || stored === 'light' ? stored : null;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme());

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('snapfzz-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);

    const tauri = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ as
      | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
      | undefined;
    if (tauri) {
      tauri.invoke('plugin:window|set_theme', { label: 'launcher', value: theme }).catch(() => {});
    }
  }, [theme]);

  return { theme, setTheme, toggleTheme };
}
