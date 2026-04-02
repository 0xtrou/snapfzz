import { ConfigProvider } from 'antd';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useTheme, darkTheme, lightTheme } from '@snapfzz/shared';

export function App() {
  const { theme } = useTheme();
  const antdTheme = theme === 'dark' ? darkTheme : lightTheme;

  return (
    <ConfigProvider theme={antdTheme}>
      <div className="flex flex-col min-h-screen">
        <header className="h-10 flex items-center px-4 border-b border-[var(--border-default)]">
          <span className="text-sm font-semibold">Project Window</span>
          <span className="ml-auto text-xs text-[var(--text-muted)]">Core shell — plugins will populate</span>
        </header>

        <PanelGroup direction="horizontal" className="flex-1">
          <Panel defaultSize={40} minSize={20}>
            <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
              Left panel — Chat + Team plugins load here
            </div>
          </Panel>
          <PanelResizeHandle className="w-1 bg-[var(--border-default)] hover:bg-[var(--border-strong)] transition-colors cursor-col-resize" />
          <Panel defaultSize={60} minSize={30}>
            <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
              Right panel — Workspace tab plugins load here
            </div>
          </Panel>
        </PanelGroup>

        <footer className="h-8 flex items-center px-4 text-xs text-[var(--text-muted)] border-t border-[var(--border-default)]">
          <span>● Ready</span>
          <span className="ml-auto">Core shell — no plugins loaded</span>
        </footer>
      </div>
    </ConfigProvider>
  );
}
