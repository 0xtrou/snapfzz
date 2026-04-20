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
  // No shell-level header — plugins render their own panel headers (44px tall,
  // see OrchestrationPanel). The maximise control overlays the top-right corner
  // so it aligns with those headers instead of claiming its own row.
  return (
    <div className="h-full relative" style={{ contain: 'layout paint' }}>
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
      {maxControls && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          {maxControls}
        </div>
      )}
    </div>
  );
}

function StatusItemWrapper({ item, onCrash }: { item: StatusItemContribution; onCrash: (pluginId: string, error: Error) => void }) {
  return <LazyComponent loader={item.component} pluginId={item.id} onCrash={onCrash} />;
}

// ─── Resize handles ──────────────────────────────────────────────────────────
//
// Visible line is 1px; drag hitbox is 4px (react-resizable-panels uses the
// element's full area as the pointer target). Wrap pattern: outer PanelResize-
// Handle holds the hitbox + cursor; inner div paints the 1px line and expands
// to 2px on hover. `group` classes let the inner span react to hover.

function HorizontalHandle() {
  return (
    <PanelResizeHandle
      className="group relative w-1 flex-shrink-0 cursor-col-resize"
      style={{ transform: 'translateZ(0)' }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[var(--border-default)] group-hover:w-0.5 group-hover:bg-[var(--border-strong)] transition-all"
      />
    </PanelResizeHandle>
  );
}

function VerticalHandle() {
  return (
    <PanelResizeHandle
      className="group relative h-1 flex-shrink-0 cursor-row-resize"
      style={{ transform: 'translateZ(0)' }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-[var(--border-default)] group-hover:h-0.5 group-hover:bg-[var(--border-strong)] transition-all"
      />
    </PanelResizeHandle>
  );
}

// ─── Shell body — nested PanelGroup with autoSaveId persistence ──────────────

interface ShellBodyProps {
  maximized: MaximizedPane;
  toggleMax: (pane: Exclude<MaximizedPane, null>) => void;
  leftPanelTabs: readonly TabContribution[];
  leftPanelActiveTab: string;
  setLeftPanelActiveTab: (id: string) => void;
  workspaceTabs: readonly TabContribution[];
  workspaceActiveTab: string;
  setWorkspaceActiveTab: (id: string) => void;
  bottomPanels: readonly PanelContribution[];
  handleCrash: (pluginId: string, error: Error) => void;
}

function ShellBody(props: ShellBodyProps) {
  const {
    maximized, toggleMax,
    leftPanelTabs, leftPanelActiveTab, setLeftPanelActiveTab,
    workspaceTabs, workspaceActiveTab, setWorkspaceActiveTab,
    bottomPanels, handleCrash,
  } = props;

  // Maximised shortcuts: render just the one panel full-viewport so react-
  // resizable-panels doesn't have to juggle 0-size siblings.
  if (maximized === 'left') {
    return (
      <div className="flex-1 min-h-0">
        <LeftPanel
          tabs={leftPanelTabs} activeTabId={leftPanelActiveTab}
          onTabChange={setLeftPanelActiveTab} onCrash={handleCrash}
          maxControls={<MaximizeButton isMaximized onToggle={() => toggleMax('left')} label="left panel" />}
        />
      </div>
    );
  }
  if (maximized === 'right') {
    return (
      <div className="flex-1 min-h-0">
        <RightPanel
          tabs={workspaceTabs} activeTabId={workspaceActiveTab}
          onTabChange={setWorkspaceActiveTab} onCrash={handleCrash}
          maxControls={<MaximizeButton isMaximized onToggle={() => toggleMax('right')} label="workspace" />}
        />
      </div>
    );
  }
  if (maximized === 'bottom') {
    return (
      <div className="flex-1 min-h-0">
        <BottomPanel
          panels={bottomPanels} onCrash={handleCrash}
          maxControls={<MaximizeButton isMaximized onToggle={() => toggleMax('bottom')} label="bottom panel" />}
        />
      </div>
    );
  }

  // Default three-pane layout: outer vertical PanelGroup, inner horizontal
  // PanelGroup for left+right. Each PanelGroup's sizes persist to
  // localStorage via `autoSaveId` — next boot restores the last widths.
  return (
    <PanelGroup
      direction="vertical"
      autoSaveId="snapfzz.shell.vertical"
      className="flex-1"
      style={{ contain: 'strict' }}
    >
      <Panel defaultSize={72} minSize={30}>
        <PanelGroup
          direction="horizontal"
          autoSaveId="snapfzz.shell.horizontal"
          className="h-full"
          style={{ contain: 'strict' }}
        >
          <Panel defaultSize={40} minSize={20}>
            <LeftPanel
              tabs={leftPanelTabs} activeTabId={leftPanelActiveTab}
              onTabChange={setLeftPanelActiveTab} onCrash={handleCrash}
              maxControls={<MaximizeButton isMaximized={false} onToggle={() => toggleMax('left')} label="left panel" />}
            />
          </Panel>
          <HorizontalHandle />
          <Panel defaultSize={60} minSize={30}>
            <RightPanel
              tabs={workspaceTabs} activeTabId={workspaceActiveTab}
              onTabChange={setWorkspaceActiveTab} onCrash={handleCrash}
              maxControls={<MaximizeButton isMaximized={false} onToggle={() => toggleMax('right')} label="workspace" />}
            />
          </Panel>
        </PanelGroup>
      </Panel>
      <VerticalHandle />
      <Panel defaultSize={28} minSize={10}>
        <BottomPanel
          panels={bottomPanels} onCrash={handleCrash}
          maxControls={<MaximizeButton isMaximized={false} onToggle={() => toggleMax('bottom')} label="bottom panel" />}
        />
      </Panel>
    </PanelGroup>
  );
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
          <ShellBody
            maximized={maximized}
            toggleMax={toggleMax}
            leftPanelTabs={leftPanelTabs}
            leftPanelActiveTab={leftPanelActiveTab || ''}
            setLeftPanelActiveTab={setLeftPanelActiveTab}
            workspaceTabs={workspaceTabs}
            workspaceActiveTab={workspaceActiveTab || ''}
            setWorkspaceActiveTab={setWorkspaceActiveTab}
            bottomPanels={contributions.bottomPanels}
            handleCrash={handleCrash}
          />
        </div>
      </WindowShell>
    </PluginHostProvider>
  );
}
