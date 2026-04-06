import type { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import { useTheme } from '../../hooks/use-theme';
import { darkTheme, lightTheme } from '../../theme';
import { useWindowDrag } from './use-window-drag';
import { WindowHeader } from './WindowHeader';
import { StatusBar } from './StatusBar';

interface WindowShellProps {
  children: ReactNode;
  statusBarContent?: ReactNode;
}

export function WindowShell({ children, statusBarContent }: WindowShellProps) {
  const { theme, toggleTheme } = useTheme();
  const antdTheme = theme === 'dark' ? darkTheme : lightTheme;
  const titleBarRef = useWindowDrag();

  return (
    <ConfigProvider theme={antdTheme}>
      <div className="flex flex-col h-screen overflow-hidden">
        <WindowHeader titleBarRef={titleBarRef} theme={theme} toggleTheme={toggleTheme} />
        <div className="flex-1 overflow-hidden" style={{ contain: 'strict' }}>
          {children}
        </div>
        <StatusBar>{statusBarContent}</StatusBar>
      </div>
    </ConfigProvider>
  );
}
