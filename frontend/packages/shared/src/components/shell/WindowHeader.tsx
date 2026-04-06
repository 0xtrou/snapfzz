import type { ReactNode, RefObject } from 'react';
import { Button } from 'antd';
import { SunOutlined, MoonOutlined } from '@ant-design/icons';

interface WindowHeaderProps {
  titleBarRef: RefObject<HTMLElement | null>;
  theme: string;
  toggleTheme: () => void;
  children?: ReactNode;
}

export function WindowHeader({ titleBarRef, theme, toggleTheme, children }: WindowHeaderProps) {
  return (
    <header
      ref={titleBarRef}
      data-tauri-drag-region
      className="flex items-center gap-2 px-4 pr-3 border-b border-[var(--border-default)] bg-[var(--bg-default)] select-none cursor-default"
      style={{ paddingLeft: 78, height: 38 }}
    >
      {children}
      <div className="ml-auto flex items-center gap-1 pointer-events-auto">
        <Button
          type="text"
          size="small"
          icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
          onClick={toggleTheme}
        />
        <img src="/logo.svg" alt="Snapfzz" className="w-5 h-5" />
      </div>
    </header>
  );
}
