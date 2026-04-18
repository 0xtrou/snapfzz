import { useState, lazy, Suspense, useEffect, useCallback, useMemo, type ComponentType } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { WindowShell, AntIcon } from '@snapfzz/shared';
import {
  PluginHost,
  ContributionStore,
  useContributionStore,
  PluginHostProvider,
  PluginErrorBoundary,
  registerDiscoveredPlugins,
} from '@snapfzz/plugin-host';
import type { TabContribution, PanelContribution, StatusItemContribution } from '@snapfzz/plugin-sdk';

/** Which of the three global panels is currently filling the viewport. */
type MaximizedPane = 'left' | 'right' | 'bottom' | null;

function LazyComponent({ loader, pluginId, onCrash }: {
  loader: () => Promise<{ default: ComponentType }>;
  pluginId?: string;
  onCrash?: (pluginId: string, error: Error) => void;
}) {
  const Component = lazy(loader);
  return (
    <Suspense fallback={
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-default)' }}>
        <div style={{ width: 24, height: 24, border: '2px solid var(--border-default)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <PluginErrorBoundary pluginId={pluginId} onCrash={onCrash}>
        <Component />
      </PluginErrorBoundary>
    </Suspense>
  );
}

/** Small icon-only button that toggles a global-panel maximise state. */
function MaximizeButton({ isMaximized, onToggle, label }: {
  isMaximized: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isMaximized ? `Restore ${label}` : `Maximise ${label}`}
      title={isMaximized ? 'Restore panes' : 'Maximise this panel'}
      className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
    >
      <AntIcon name={isMaximized ? 'FullscreenExitOutlined' : 'FullscreenOutlined'} />
    </button>
  );
}

function TabBar({ tabs, activeTabId, onTabClick, trailing }: {
  tabs: readonly TabContribution[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  /** Optional right-aligned controls (e.g. maximise button). */
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-default)]">
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabClick(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
              activeTabId === tab.id
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <AntIcon name={tab.icon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      {trailing && <div className="flex items-center gap-1 flex-shrink-0">{trailing}</div>}
    </div>
  );
}

function LeftPanel({ tabs, activeTabId, onTabChange, onCrash, maxControls }: {
  tabs: readonly TabContribution[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  onCrash: (pluginId: string, error: Error) => void;
  maxControls?: React.ReactNode;
}) {
  const activeTab = tabs.find((t) => t.id === activeTabId);
  return (
    <div className="h-full flex flex-col" style={{ contain: 'layout paint' }}>
      <TabBar tabs={tabs} activeTabId={activeTabId} onTabClick={onTabChange} trailing={maxControls} />
      <div className="flex-1 overflow-hidden">
        {activeTab ? (
          <LazyComponent loader={activeTab.component} pluginId={activeTab.id} onCrash={onCrash} />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
            No tabs available — install plugins to see content
          </div>
        )}
      </div>
    </div>
  );
}

function RightPanel({ tabs, activeTabId, onTabChange, onCrash, maxControls }: {
  tabs: readonly TabContribution[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  onCrash: (pluginId: string, error: Error) => void;
  maxControls?: React.ReactNode;
}) {
  const activeTab = tabs.find((t) => t.id === activeTabId);
  return (
    <div className="h-full flex flex-col" style={{ contain: 'layout paint' }}>
      <TabBar tabs={tabs} activeTabId={activeTabId} onTabClick={onTabChange} trailing={maxControls} />
      <div className="flex-1 overflow-hidden">
        {activeTab ? (
          <LazyComponent loader={activeTab.component} pluginId={activeTab.id} onCrash={onCrash} />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
            No tabs available — install plugins to see content
          </div>
        )}
      </div>
    </div>
  );
}

function BottomPanel({ panels, onCrash, maxControls }: {
  panels: readonly PanelContribution[];
  onCrash: (pluginId: string, error: Error) => void;
  maxControls?: React.ReactNode;
}) {
  // Always render a slim header so the maximise control is reachable even when
  // there are zero panel contributions (the body shows a placeholder then).
  return (
    <div className="h-full flex flex-col" style={{ contain: 'layout paint' }}>
      <div className="flex items-center justify-between gap-1 px-3 py-1 bg-[var(--bg-default)] border-b border-[var(--border-default)]">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Bottom panel
        </span>
        {maxControls && <div className="flex items-center gap-1">{maxControls}</div>}
      </div>
      <div className="flex-1 overflow-hidden">
        {panels.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
            No agent panels — plugins will provide agent network
          </div>
        ) : (
          <div className="h-full flex">
            {panels.map((panel) => (
              <div key={panel.id} className="flex-1 min-w-0">
                <LazyComponent loader={panel.component} pluginId={panel.id} onCrash={onCrash} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusItemWrapper({ item, onCrash }: { item: StatusItemContribution; onCrash: (pluginId: string, error: Error) => void }) {
  return <LazyComponent loader={item.component} pluginId={item.id} onCrash={onCrash} />;
}

const store = new ContributionStore();
const host = new PluginHost(store, 'project');
let pluginsInitialized = false;

export function App() {
  const contributions = useContributionStore(() => store);

  const leftPanelTabs = contributions.leftPanelTabs;
  const workspaceTabs = contributions.workspaceTabs;

  const [leftPanelActiveTab, setLeftPanelActiveTab] = useState<string | null>(null);
  const [workspaceActiveTab, setWorkspaceActiveTab] = useState<string | null>(null);
  const [maximized, setMaximized] = useState<MaximizedPane>(null);

  const toggleMax = useCallback(
    (pane: Exclude<MaximizedPane, null>) => setMaximized((prev) => (prev === pane ? null : pane)),
    [],
  );

  const handleCrash = useCallback((pluginId: string, _error: Error) => {
    host.reportCrash(pluginId);
  }, []);

  useEffect(() => {
    if (leftPanelActiveTab === null && leftPanelTabs.length > 0) {
      setLeftPanelActiveTab(leftPanelTabs[0].id);
    }
  }, [leftPanelActiveTab, leftPanelTabs]);

  useEffect(() => {
    if (workspaceActiveTab === null && workspaceTabs.length > 0) {
      setWorkspaceActiveTab(workspaceTabs[0].id);
    }
  }, [workspaceActiveTab, workspaceTabs]);

  useEffect(() => {
    document.documentElement.setAttribute('data-app-ready', 'true');
    const skeleton = document.getElementById('skeleton');
    if (skeleton) {
      skeleton.classList.add('fade-out');
      skeleton.addEventListener('transitionend', () => skeleton.remove(), { once: true });
    }
  }, []);

  useEffect(() => {
    if (pluginsInitialized) return;
    pluginsInitialized = true;

    const initPlugins = async () => {
      await registerDiscoveredPlugins(host, 'project');
      void host.activateByEvent('onStartupFinished');
    };

    // Run discovery immediately (may find plugins if boot already completed)
    void initPlugins();

    // Re-discover after boot-complete — system plugins are installed during boot,
    // which may finish after the frontend's initial discovery runs.
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen('boot-complete', () => {
          registerDiscoveredPlugins(host, 'project').then(() => {
            void host.activateByEvent('onStartupFinished');
          });
        });
      } catch {
        // Not in Tauri (tests, web preview) — no boot event
      }
    })();

    return () => { unlisten?.(); };
  }, []);

  const leftItems = useMemo(
    () => contributions.statusItems.filter((item) => item.position === 'left'),
    [contributions.statusItems],
  );

  return (
    <PluginHostProvider host={host}>
      <WindowShell
        title="Snapfzz"
        statusBarContent={
          <>
            {leftItems.map((item) => (
              <StatusItemWrapper key={item.id} item={item} onCrash={handleCrash} />
            ))}
            <span className="text-[var(--text-muted)]">
              {contributions.leftPanelTabs.length + contributions.workspaceTabs.length} plugin{contributions.leftPanelTabs.length + contributions.workspaceTabs.length !== 1 ? 's' : ''}
            </span>
          </>
        }
      >
        <div className="flex flex-col h-full" style={{ contain: 'strict' }}>
          {/* Horizontal PanelGroup for left+right splits; hidden when bottom is maximised.
              When left OR right is maximised, we swap the whole PanelGroup for a single
              full-height wrapper so react-resizable-panels doesn't trip on a 0-size Panel. */}
          {maximized === 'bottom' ? null : maximized === 'left' ? (
            <div className="flex-1 min-h-0">
              <LeftPanel
                tabs={leftPanelTabs}
                activeTabId={leftPanelActiveTab || ''}
                onTabChange={setLeftPanelActiveTab}
                onCrash={handleCrash}
                maxControls={
                  <MaximizeButton
                    isMaximized
                    onToggle={() => toggleMax('left')}
                    label="left panel"
                  />
                }
              />
            </div>
          ) : maximized === 'right' ? (
            <div className="flex-1 min-h-0">
              <RightPanel
                tabs={workspaceTabs}
                activeTabId={workspaceActiveTab || ''}
                onTabChange={setWorkspaceActiveTab}
                onCrash={handleCrash}
                maxControls={
                  <MaximizeButton
                    isMaximized
                    onToggle={() => toggleMax('right')}
                    label="workspace"
                  />
                }
              />
            </div>
          ) : (
            <PanelGroup direction="horizontal" className="flex-1" style={{ contain: 'strict' }}>
              <Panel defaultSize={40} minSize={20}>
                <LeftPanel
                  tabs={leftPanelTabs}
                  activeTabId={leftPanelActiveTab || ''}
                  onTabChange={setLeftPanelActiveTab}
                  onCrash={handleCrash}
                  maxControls={
                    <MaximizeButton
                      isMaximized={false}
                      onToggle={() => toggleMax('left')}
                      label="left panel"
                    />
                  }
                />
              </Panel>
              <PanelResizeHandle className="w-1 bg-[var(--border-default)] hover:bg-[var(--border-strong)] transition-colors cursor-col-resize" style={{ transform: 'translateZ(0)' }} />
              <Panel defaultSize={60} minSize={30}>
                <RightPanel
                  tabs={workspaceTabs}
                  activeTabId={workspaceActiveTab || ''}
                  onTabChange={setWorkspaceActiveTab}
                  onCrash={handleCrash}
                  maxControls={
                    <MaximizeButton
                      isMaximized={false}
                      onToggle={() => toggleMax('right')}
                      label="workspace"
                    />
                  }
                />
              </Panel>
            </PanelGroup>
          )}

          {/* Bottom panel: 192px when cohabiting, full-flex when maximised,
              hidden when left or right is maximised. */}
          {maximized !== 'left' && maximized !== 'right' && (
            <div
              className={maximized === 'bottom' ? 'flex-1 min-h-0' : 'h-48'}
              style={{ contain: 'layout paint' }}
            >
              <BottomPanel
                panels={contributions.bottomPanels}
                onCrash={handleCrash}
                maxControls={
                  <MaximizeButton
                    isMaximized={maximized === 'bottom'}
                    onToggle={() => toggleMax('bottom')}
                    label="bottom panel"
                  />
                }
              />
            </div>
          )}
        </div>
      </WindowShell>
    </PluginHostProvider>
  );
}
