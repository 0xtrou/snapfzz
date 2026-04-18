// Reads live design-token values off :root so Spark's theme matches the rest of
// the app (dark/light, our `--color-info` blue, `--bg-default` panel, etc.).
//
// Spark feeds these into its internal AntD ConfigProvider via
// `options.theme.{colorPrimary,colorBgBase,colorTextBase,background,darkMode}`,
// which re-derives the full palette automatically.
//
// Updates on `data-theme` flips by observing the <html> attribute — so theme
// toggles mid-session re-render with the correct palette.

import { useEffect, useState } from 'react';

export interface SparkThemeSnapshot {
  readonly darkMode: boolean;
  readonly colorPrimary: string;
  readonly colorBgBase: string;
  readonly colorTextBase: string;
  readonly background: string;
}

function cssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readSnapshot(): SparkThemeSnapshot {
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    darkMode: isDark,
    // `--color-info` is our primary accent blue in tokens.css — no `--color-primary` token exists.
    colorPrimary: cssVar('--color-info') || '#3b82f6',
    colorBgBase: cssVar('--bg-default') || (isDark ? '#18181b' : '#ffffff'),
    colorTextBase: cssVar('--text-primary') || (isDark ? 'rgba(250,250,250,0.7)' : '#09090b'),
    background: cssVar('--bg-default') || (isDark ? '#18181b' : '#ffffff'),
  };
}

export function useSparkTheme(): SparkThemeSnapshot {
  const [snap, setSnap] = useState<SparkThemeSnapshot>(() => readSnapshot());

  useEffect(() => {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    const obs = new MutationObserver(() => setSnap(readSnapshot()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return snap;
}
