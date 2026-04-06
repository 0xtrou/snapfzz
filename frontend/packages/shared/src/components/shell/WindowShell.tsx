import type { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import { useTheme } from '../../hooks/use-theme';
import { useAppSettings } from '../../hooks/use-app-settings';
import { darkTheme, lightTheme } from '../../theme';
import { useWindowDrag } from './use-window-drag';
import { WindowHeader } from './WindowHeader';
import { StatusBar } from './StatusBar';
import { createContext, useContext } from 'react';

// Context for sharing loaded custom fonts across all windows
export const CustomFontsContext = createContext<string[]>([]);

interface WindowShellProps {
  title?: string;
  children: ReactNode;
  statusBarContent?: ReactNode;
}

export function WindowShell({ title, children, statusBarContent }: WindowShellProps) {
  const { theme, toggleTheme } = useTheme();
  // Per A007/MultiLayout: load and apply font settings from settings.json at top level.
  // Custom fonts are loaded once here and shared via context to all settings plugins.
  const customFonts = useAppSettings();
  const antdTheme = theme === 'dark' ? darkTheme : lightTheme;
  const titleBarRef = useWindowDrag();

  return (
    <CustomFontsContext.Provider value={customFonts}>
      <ConfigProvider theme={antdTheme}>
        <div className="flex flex-col h-screen overflow-hidden">
          <WindowHeader titleBarRef={titleBarRef} theme={theme} toggleTheme={toggleTheme} title={title} />
          <div className="flex-1 overflow-hidden" style={{ contain: 'strict' }}>
            {children}
          </div>
          <StatusBar>{statusBarContent}</StatusBar>
        </div>
      </ConfigProvider>
    </CustomFontsContext.Provider>
  );
}

// Hook for plugins to access loaded custom fonts
export function useCustomFonts(): string[] {
  return useContext(CustomFontsContext);
}
