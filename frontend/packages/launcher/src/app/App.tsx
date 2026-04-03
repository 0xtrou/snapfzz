// Per A003/InstantLoading: skeleton in index.html visible at 0ms, React replaces when hydrated.
// Per A005/PluginArchitecture: shell reads ContributionStore, empty until plugins register.
// Per A006/CoreRuntime: launcher shell = header + main + status bar, all from store.
import { ConfigProvider } from 'antd';
import { useTheme, darkTheme, lightTheme } from '@snapfzz/shared';
import {
  PluginHost,
  ContributionStore,
  useContributionStore,
  PluginHostProvider,
  PluginErrorBoundary,
} from '@snapfzz/plugin-host';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import type { ComponentContribution, StatusItemContribution } from '@snapfzz/plugin-sdk';

// Per A003/InstantLoading: measure TTI and LCP on every boot.
function measureStartup() {
  if (typeof window === 'undefined' || !window.performance) return;

  // LCP — when the skeleton logo becomes visible
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    // eslint-disable-next-line no-console
    console.log(`[A003/metrics] LCP: ${Math.round(last.startTime)}ms`);
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  // Long tasks — any JS blocking > 50ms
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // eslint-disable-next-line no-console
      console.log(`[A003/metrics] Long task: ${Math.round(entry.duration)}ms at ${Math.round(entry.startTime)}ms`);
    }
  }).observe({ type: 'longtask', buffered: true });

  // TTI approximation — when React hydrates and removes skeleton
  const tti = performance.now();
  // eslint-disable-next-line no-console
  console.log(`[A003/metrics] TTI (hydration): ${Math.round(tti)}ms`);
}

type ContributionSnapshot = ReturnType<typeof useContributionStore>;
type LauncherContributionSnapshot = ContributionSnapshot & {
  headerItems?: readonly ComponentContribution[];
  mainContent?: readonly ComponentContribution[];
};

export function App() {
  const { theme } = useTheme();
  const antdTheme = theme === 'dark' ? darkTheme : lightTheme;

  const { store, host } = useMemo(() => {
    const contributionStore = new ContributionStore();
    const pluginHost = new PluginHost(contributionStore, 'launcher');
    return { store: contributionStore, host: pluginHost };
  }, []);

  const contributions = useContributionStore(() => store);

  useEffect(() => {
    // Per A003/InstantLoading: hide skeleton skeleton once React hydrates.
    document.documentElement.setAttribute('data-app-ready', 'true');
    const skeleton = document.getElementById('skeleton');
    if (skeleton) {
      skeleton.classList.add('fade-out');
      skeleton.addEventListener('transitionend', () => skeleton.remove(), { once: true });
    }
    measureStartup();
  }, []);

  useEffect(() => {
    // Per A005/Lifecycle: activate critical plugins on startup.
    host.activateByEvent('onStartupFinished');
  }, [host]);

  return (
    <PluginHostProvider host={host}>
      <ConfigProvider theme={antdTheme}>
        <PluginErrorBoundary>
          <LauncherShell contributions={contributions} />
        </PluginErrorBoundary>
      </ConfigProvider>
    </PluginHostProvider>
  );
}

function LauncherShell({ contributions }: { contributions: ContributionSnapshot }) {
  const launcherContributions = contributions as LauncherContributionSnapshot;

  const headerItems =
    launcherContributions.headerItems ??
    contributions.genericComponents.filter((item: ComponentContribution) => item.id.startsWith('launcher:header:'));

  const mainContent =
    launcherContributions.mainContent ??
    contributions.genericComponents.filter((item: ComponentContribution) => item.id.startsWith('launcher:main:'));

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <header className="h-12 flex items-center px-4 border-b gap-3" style={{ borderColor: 'var(--border-default)' }}>
        <img src="/logo.svg" alt="Snapfzz" className="w-6 h-6" />
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Snapfzz
        </span>
        <div className="flex items-center gap-2">
          <RenderComponentContributions items={headerItems} />
        </div>
      </header>

      <main className="flex-1">
        {mainContent.length > 0 ? (
          <RenderComponentContributions items={mainContent} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Core shell ready. Plugins will load here.
            </p>
          </div>
        )}
      </main>

      <StatusBar statusItems={contributions.statusItems} />
    </div>
  );
}

function RenderComponentContributions({ items }: { items: readonly ComponentContribution[] }) {
  const resolved = useMemo(
    () => items.map((item) => ({ id: item.id, Component: lazy(item.component) })),
    [items],
  );

  return (
    <>
      {resolved.map(({ id, Component }) => (
        <Suspense key={id} fallback={null}>
          <Component />
        </Suspense>
      ))}
    </>
  );
}

function StatusBar({ statusItems }: { statusItems: readonly StatusItemContribution[] }) {
  const leftItems = statusItems.filter((item) => item.position === 'left');
  const rightItems = statusItems.filter((item) => item.position === 'right');

  return (
    <footer
      className="h-8 flex items-center justify-between px-4 text-xs border-t"
      style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}
    >
      <div className="flex items-center gap-2">
        {leftItems.length > 0 ? (
          <RenderStatusContributions items={leftItems} />
        ) : (
          <span>● Ready</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <RenderStatusContributions items={rightItems} />
      </div>
    </footer>
  );
}

function RenderStatusContributions({ items }: { items: readonly StatusItemContribution[] }) {
  const resolved = useMemo(
    () => items.map((item) => ({ id: item.id, Component: lazy(item.component) })),
    [items],
  );

  return (
    <>
      {resolved.map(({ id, Component }) => (
        <Suspense key={id} fallback={null}>
          <Component />
        </Suspense>
      ))}
    </>
  );
}
