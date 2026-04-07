import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hooksMock = vi.hoisted(() => ({
  useAppSettings: vi.fn(),
}));

const shellMock = vi.hoisted(() => ({
  useWindowDrag: vi.fn(),
}));

vi.mock('../../hooks/use-app-settings', () => hooksMock);
vi.mock('../../theme', () => ({
  darkTheme: { token: { colorPrimary: '#3b82f6' } },
  lightTheme: { token: { colorPrimary: '#2563eb' } },
}));
vi.mock('./use-window-drag', () => shellMock);
vi.mock('./WindowHeader', () => ({
  WindowHeader: ({ title, theme }: { title?: string; theme: string }) => <div>{`header:${title ?? 'none'}:${theme}`}</div>,
}));
vi.mock('./StatusBar', () => ({
  StatusBar: ({ children }: { children?: React.ReactNode }) => <footer>{children}</footer>,
}));

describe('WindowShell', () => {
  it('provides selected antd theme, status bar content, and custom fonts context', async () => {
    hooksMock.useAppSettings.mockReturnValue({
      theme: 'dark',
      toggleTheme: vi.fn(),
      customFonts: ['Inter', 'JetBrains Mono'],
    });
    shellMock.useWindowDrag.mockReturnValue({ current: null });

    const { WindowShell, useCustomFonts } = await import('./WindowShell');

    const Probe = () => {
      const fonts = useCustomFonts();
      return <span>{fonts.join(', ')}</span>;
    };

    render(
      <WindowShell title="Project" statusBarContent={<span>status-item</span>}>
        <Probe />
      </WindowShell>,
    );

    expect(screen.getByText('header:Project:dark')).toBeTruthy();
    expect(screen.getByText('Inter, JetBrains Mono')).toBeTruthy();
    expect(screen.getByText('status-item')).toBeTruthy();
  });

  it('switches to light theme when hook returns light', async () => {
    hooksMock.useAppSettings.mockReturnValue({
      theme: 'light',
      toggleTheme: vi.fn(),
      customFonts: [],
    });
    shellMock.useWindowDrag.mockReturnValue({ current: null });

    const { WindowShell } = await import('./WindowShell');

    render(
      <WindowShell title="Prefs">
        <span>content</span>
      </WindowShell>,
    );

    expect(screen.getByText('header:Prefs:light')).toBeTruthy();
    expect(screen.getByText('content')).toBeTruthy();
  });
});
