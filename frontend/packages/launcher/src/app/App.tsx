// Per A003/InstantLoading: skeleton in index.html visible at 0ms, React replaces when hydrated.
// Per A003/BootComplete: skeleton stays visible until all boot phases complete.
// Per A005/PluginArchitecture: shell reads ContributionStore, empty until plugins register.
// Per A006/CoreRuntime: launcher shell = header + main + status bar, all from store.
import { ConfigProvider } from 'antd';
import { useAppSettings, darkTheme, lightTheme, createTauriBridge } from '@snapfzz/shared';
import {
  PluginHost,
  ContributionStore,
  useContributionStore,
  PluginHostProvider,
  PluginErrorBoundary,
  registerDiscoveredPlugins,
} from '@snapfzz/plugin-host';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentContribution, StatusItemContribution } from '@snapfzz/plugin-sdk';

// Per A003/InstantLoading: measure TTI and LCP on every boot.
// Per A002/ZoneViolation: report long tasks and LCP violations to BudgetRegistry.
function measureStartup() {
  if (typeof window === 'undefined' || !window.performance) return;

  const bridge = createTauriBridge();

  // LCP — when the skeleton logo becomes visible
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    // eslint-disable-next-line no-console
    console.log(`[A003/metrics] LCP: ${Math.round(last.startTime)}ms`);
    // Per A002/ZoneViolation: report LCP to BudgetRegistry via Tauri IPC.
    void bridge.invoke('budget_report_violation', { class: 'startup', metric: 'lcp', actual_ms: last.startTime });
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  // Long tasks — any JS blocking > 50ms
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // eslint-disable-next-line no-console
      console.log(`[A003/metrics] Long task: ${Math.round(entry.duration)}ms at ${Math.round(entry.startTime)}ms`);
      // Per A002/ZoneViolation: report long task to BudgetRegistry via Tauri IPC.
      void bridge.invoke('budget_report_violation', { class: 'cpu', metric: 'longtask', actual_ms: entry.duration });
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
  const { theme } = useAppSettings();
  const antdTheme = theme === 'dark' ? darkTheme : lightTheme;

  const { store, host } = useMemo(() => {
    const contributionStore = new ContributionStore();
    const pluginHost = new PluginHost(contributionStore, 'launcher');
    return { store: contributionStore, host: pluginHost };
  }, []);

  const contributions = useContributionStore(() => store);

  // Per A003/BootComplete: skeleton stays visible until all boot phases complete.
  const [bootComplete, setBootComplete] = useState(false);

  useEffect(() => {
    // Per A003/InstantLoading: measure TTI and register plugins immediately — not gated on boot.
    measureStartup();
  }, []);

  useEffect(() => {
    // Per A003/BootComplete: skeleton stays visible until all boot phases complete.
    // Fallback: 30s timeout ensures skeleton is removed even if boot-complete event is lost.
    const bridge = createTauriBridge();
    let unlisten: (() => void) | null = null;

    bridge.listen('boot-complete', () => {
      setBootComplete(true);
    }).then((fn) => { unlisten = fn; });

    const timeout = setTimeout(() => setBootComplete(true), 30000);

    return () => {
      unlisten?.();
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    // Per A003/BootComplete: skeleton stays visible until all boot phases complete.
    if (!bootComplete) return;
    document.documentElement.setAttribute('data-app-ready', 'true');
    const skeleton = document.getElementById('skeleton');
    if (skeleton) {
      skeleton.classList.add('fade-out');
      skeleton.addEventListener('transitionend', () => skeleton.remove(), { once: true });
    }
  }, [bootComplete]);

  useEffect(() => {
    // Per A003/BootComplete: update skeleton status text while boot is in progress.
    if (bootComplete) return;
    const bridge = createTauriBridge();
    let unlisten: (() => void) | null = null;

    bridge.listen<{ process: string; message: string }>('supervisor-event', (event) => {
      const el = document.getElementById('skeleton-status');
      if (el) el.textContent = event.message;
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, [bootComplete]);

  useEffect(() => {
    // Per A006/BootSequence: discover manifests → register → activate critical plugins.
    registerDiscoveredPlugins(host, 'launcher').then(() => {
      void host.activateByEvent('onStartupFinished');
    });
  }, [host]);

  // Per A005/Isolation: crash callback routes through host crash supervision (3-strike auto-disable).
  const handleCrash = useCallback((pluginId: string, _error: Error) => {
    host.reportCrash(pluginId);
  }, [host]);

  return (
    <PluginHostProvider host={host}>
      <ConfigProvider theme={antdTheme}>
        <PluginErrorBoundary>
          <LauncherShell contributions={contributions} onCrash={handleCrash} />
        </PluginErrorBoundary>
      </ConfigProvider>
    </PluginHostProvider>
  );
}

function LauncherShell({ contributions, onCrash }: { contributions: ContributionSnapshot; onCrash: (pluginId: string, error: Error) => void }) {
  const launcherContributions = contributions as LauncherContributionSnapshot;

  const headerItems = useMemo(
    () => launcherContributions.headerItems ?? contributions.genericComponents.filter((item: ComponentContribution) => item.id.startsWith('launcher:header:')),
    [launcherContributions.headerItems, contributions.genericComponents],
  );

  const mainContent = useMemo(
    () => launcherContributions.mainContent ?? contributions.genericComponents.filter((item: ComponentContribution) => item.id.startsWith('launcher:main:')),
    [launcherContributions.mainContent, contributions.genericComponents],
  );

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <header className="h-12 flex items-center px-4 border-b gap-3" style={{ borderColor: 'var(--border-default)' }}>
        <img src="/logo.svg" alt="Snapfzz" className="w-6 h-6" />
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Snapfzz
        </span>
        <div className="flex items-center gap-2">
          <RenderComponentContributions items={headerItems} onCrash={onCrash} />
        </div>
      </header>

      <main className="flex-1" style={{ contain: 'layout paint' }}>
        {mainContent.length > 0 ? (
          <RenderComponentContributions items={mainContent} onCrash={onCrash} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Core shell ready. Plugins will load here.
            </p>
          </div>
        )}
      </main>

      <StatusBar statusItems={contributions.statusItems} onCrash={onCrash} />
    </div>
  );
}

function RenderComponentContributions({ items, onCrash }: { items: readonly ComponentContribution[]; onCrash: (pluginId: string, error: Error) => void }) {
  const resolved = useMemo(
    () => items.map((item) => ({ id: item.id, Component: lazy(item.component) })),
    [items],
  );

  return (
    <>
      {resolved.map(({ id, Component }) => (
        <Suspense key={id} fallback={null}>
          <PluginErrorBoundary pluginId={id} onCrash={onCrash}>
            <Component />
          </PluginErrorBoundary>
        </Suspense>
      ))}
    </>
  );
}

function StatusBar({ statusItems, onCrash }: { statusItems: readonly StatusItemContribution[]; onCrash: (pluginId: string, error: Error) => void }) {
  const leftItems = useMemo(() => statusItems.filter((item) => item.position === 'left'), [statusItems]);
  const rightItems = useMemo(() => statusItems.filter((item) => item.position === 'right'), [statusItems]);

  return (
    <footer
      className="h-8 flex items-center justify-between px-4 text-xs border-t"
      style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}
    >
      <div className="flex items-center gap-2">
        {leftItems.length > 0 ? (
          <RenderStatusContributions items={leftItems} onCrash={onCrash} />
        ) : (
          <span>● Ready</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <RenderStatusContributions items={rightItems} onCrash={onCrash} />
      </div>
    </footer>
  );
}

function RenderStatusContributions({ items, onCrash }: { items: readonly StatusItemContribution[]; onCrash: (pluginId: string, error: Error) => void }) {
  const resolved = useMemo(
    () => items.map((item) => ({ id: item.id, Component: lazy(item.component) })),
    [items],
  );

  return (
    <>
      {resolved.map(({ id, Component }) => (
        <Suspense key={id} fallback={null}>
          <PluginErrorBoundary pluginId={id} onCrash={onCrash}>
            <Component />
          </PluginErrorBoundary>
        </Suspense>
      ))}
    </>
  );
}
