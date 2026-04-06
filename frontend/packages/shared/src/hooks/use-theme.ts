import { useState, useEffect, useCallback } from 'react';

type Theme = 'dark' | 'light';
const THEME_STORAGE_KEY = 'snapfzz-theme';

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'dark' || stored === 'light' ? stored : null;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme());

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_STORAGE_KEY, t);
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

  useEffect(() => {
    const applyCurrentTheme = () => {
      const nextTheme = getStoredTheme() ?? getSystemTheme();
      setThemeState(nextTheme);
      document.documentElement.setAttribute('data-theme', nextTheme);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      applyCurrentTheme();
    };

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (getStoredTheme() !== null) return;
      applyCurrentTheme();
    };

    window.addEventListener('storage', handleStorage);
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => {
      window.removeEventListener('storage', handleStorage);
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  return { theme, setTheme, toggleTheme };
}
