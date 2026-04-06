import type { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import { useTheme } from '../../hooks/use-theme';
import { useAppSettings } from '../../hooks/use-app-settings';
import { darkTheme, lightTheme } from '../../theme';
import { useWindowDrag } from './use-window-drag';
import { WindowHeader } from './WindowHeader';
import { StatusBar } from './StatusBar';

interface WindowShellProps {
  title?: string;
  children: ReactNode;
  statusBarContent?: ReactNode;
}

export function WindowShell({ title, children, statusBarContent }: WindowShellProps) {
  const { theme, toggleTheme } = useTheme();
  // Per A007/MultiLayout: apply font settings from settings.json across all windows.
  useAppSettings();
  const antdTheme = theme === 'dark' ? darkTheme : lightTheme;
  const titleBarRef = useWindowDrag();

  return (
    <ConfigProvider theme={antdTheme}>
      <div className="flex flex-col h-screen overflow-hidden">
        <WindowHeader titleBarRef={titleBarRef} theme={theme} toggleTheme={toggleTheme} title={title} />
        <div className="flex-1 overflow-hidden" style={{ contain: 'strict' }}>
          {children}
        </div>
        <StatusBar>{statusBarContent}</StatusBar>
      </div>
    </ConfigProvider>
  );
}
