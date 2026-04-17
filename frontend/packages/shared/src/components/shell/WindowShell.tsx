import type { ReactNode } from 'react';
import { App } from 'antd';
// Per project/SparkDesignFirst: use Spark's ConfigProvider so @agentscope-ai/chat and
// @agentscope-ai/design components pick up the iconfont + prefix wiring. It is a superset
// of antd's ConfigProvider, so our existing antd theme tokens flow through unchanged.
import { ConfigProvider as SparkConfigProvider } from '@agentscope-ai/design';
import { useAppSettings } from '../../hooks/use-app-settings';
import { darkTheme, lightTheme } from '../../theme';
import { setToastAPI } from '../../lib/toast';
import { useWindowDrag } from './use-window-drag';
import { WindowHeader } from './WindowHeader';
import { StatusBar } from './StatusBar';
import { createContext, useContext, useEffect } from 'react';

export const CustomFontsContext = createContext<string[]>([]);

interface WindowShellProps {
  title?: string;
  children: ReactNode;
  statusBarContent?: ReactNode;
}

// Per A007/MultiLayout: single useAppSettings drives theme + font + ConfigProvider for all windows.
export function WindowShell({ title, children, statusBarContent }: WindowShellProps) {
  const { theme, toggleTheme, customFonts } = useAppSettings();
  const antdTheme = theme === 'dark' ? darkTheme : lightTheme;
  const titleBarRef = useWindowDrag();

  return (
    <CustomFontsContext.Provider value={customFonts}>
      <SparkConfigProvider theme={antdTheme}>
        <App>
          <ToastBridge />
          <div className="flex flex-col h-screen overflow-hidden">
            <WindowHeader titleBarRef={titleBarRef} theme={theme} toggleTheme={toggleTheme} title={title} />
            <div className="flex-1 overflow-hidden" style={{ contain: 'strict' }}>
              {children}
            </div>
            <StatusBar>{statusBarContent}</StatusBar>
          </div>
        </App>
      </SparkConfigProvider>
    </CustomFontsContext.Provider>
  );
}

// Wires antd's context-aware message API into the shared ToastAPI singleton.
// Must be rendered inside <App> so App.useApp() has context.
function ToastBridge() {
  const { message } = App.useApp();

  useEffect(() => {
    setToastAPI({
      success: (msg) => { void message.success(msg); },
      error: (msg) => { void message.error(msg); },
    });
    return () => setToastAPI(null);
  }, [message]);

  return null;
}

export function useCustomFonts(): string[] {
  return useContext(CustomFontsContext);
}
