import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { PluginHost } from './plugin-host';

const PluginHostContext = createContext<PluginHost | null>(null);

export function usePluginHost(): PluginHost {
  const host = useContext(PluginHostContext);
  if (!host) {
    throw new Error('usePluginHost must be used within a PluginHostProvider');
  }

  return host;
}

interface PluginHostProviderProps {
  host: PluginHost;
  children: ReactNode;
}

export function PluginHostProvider({ host, children }: PluginHostProviderProps) {
  return createElement(PluginHostContext.Provider, { value: host }, children);
}
