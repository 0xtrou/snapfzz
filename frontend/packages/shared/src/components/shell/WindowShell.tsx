import type { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import { useAppSettings } from '../../hooks/use-app-settings';
import { darkTheme, lightTheme } from '../../theme';
import { useWindowDrag } from './use-window-drag';
import { WindowHeader } from './WindowHeader';
import { StatusBar } from './StatusBar';
import { createContext, useContext } from 'react';

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

export function useCustomFonts(): string[] {
  return useContext(CustomFontsContext);
}
