import { theme } from 'antd';
import type { ThemeConfig } from 'antd';

const sharedTokens = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyCode: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 13,
  borderRadius: 6,
  borderRadiusLG: 8,
  borderRadiusSM: 4,
  controlHeight: 36,
  controlHeightLG: 40,
  controlHeightSM: 32,
  colorSuccess: '#22c55e',
  colorWarning: '#eab308',
  colorError: '#ef4444',
  colorInfo: '#3b82f6',
};

export const darkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...sharedTokens,
    colorBgContainer: '#18181b',
    colorBgElevated: '#27272a',
    colorBgLayout: '#09090b',
    colorBorder: '#27272a',
    colorBorderSecondary: '#3f3f46',
    colorText: '#fafafa',
    colorTextSecondary: '#a1a1aa',
    colorTextTertiary: '#71717a',
    colorPrimary: '#fafafa',
  },
};

export const lightTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...sharedTokens,
    colorBgContainer: '#ffffff',
    colorBgElevated: '#fafafa',
    colorBgLayout: '#ffffff',
    colorBorder: '#e4e4e7',
    colorBorderSecondary: '#d4d4d8',
    colorText: '#09090b',
    colorTextSecondary: '#71717a',
    colorTextTertiary: '#a1a1aa',
    colorPrimary: '#18181b',
  },
};
