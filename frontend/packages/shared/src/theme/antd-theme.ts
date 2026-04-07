import { theme } from 'antd';
import type { ThemeConfig } from 'antd';

const sharedTokens = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyCode: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 13,
  fontSizeSM: 12,
  fontSizeLG: 15,
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
    colorBorder: '#3f3f46',
    colorBorderSecondary: '#52525b',
    colorText: '#fafafa',
    colorTextSecondary: '#a1a1aa',
    colorTextTertiary: '#71717a',
    colorPrimary: '#3b82f6',
    colorPrimaryHover: '#60a5fa',
    colorPrimaryActive: '#2563eb',
    colorBgTextHover: '#27272a',
    colorBgTextActive: '#3f3f46',
    colorFillSecondary: '#27272a',
    colorFillTertiary: '#1f1f23',
  },
  components: {
    Input: {
      colorBgContainer: '#27272a',
      activeBorderColor: '#3b82f6',
      hoverBorderColor: '#52525b',
    },
    Select: {
      colorBgContainer: '#27272a',
      colorBgElevated: '#27272a',
      optionActiveBg: '#3f3f46',
      optionSelectedBg: '#3f3f46',
    },
    Checkbox: {
      colorBgContainer: '#27272a',
      colorPrimary: '#3b82f6',
      colorPrimaryHover: '#60a5fa',
    },
    Radio: {
      colorBgContainer: '#27272a',
      colorPrimary: '#3b82f6',
      colorPrimaryHover: '#60a5fa',
    },
    Table: {
      colorBgContainer: '#18181b',
      headerBg: '#1f1f23',
      rowHoverBg: '#27272a',
      borderColor: '#3f3f46',
    },
    Tag: {
      colorBgContainer: '#27272a',
    },
    Popconfirm: {
      colorBgElevated: '#27272a',
    },
    Modal: {
      contentBg: '#27272a',
      headerBg: '#27272a',
    },
    Button: {
      defaultBg: '#27272a',
      defaultBorderColor: '#3f3f46',
      defaultColor: '#fafafa',
    },
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
    colorPrimary: '#2563eb',
    colorPrimaryHover: '#3b82f6',
    colorPrimaryActive: '#1d4ed8',
  },
  components: {
    Button: {
      defaultBg: 'transparent',
      defaultBorderColor: '#e4e4e7',
      defaultColor: '#09090b',
    },
  },
};
