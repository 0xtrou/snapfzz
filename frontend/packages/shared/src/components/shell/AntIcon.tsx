import { createElement, type ComponentType } from 'react';
import * as AntIcons from '@ant-design/icons';

const iconMap = AntIcons as Record<string, ComponentType>;

export function AntIcon({ name, ...props }: { name: string } & Record<string, unknown>) {
  const Icon = iconMap[name];
  if (Icon) return createElement(Icon, props);
  return null;
}
