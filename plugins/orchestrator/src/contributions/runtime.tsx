// Per A005/PluginArchitecture + feedback/five-layer: runtime context threads PluginContext
// into the ChatPanel component tree so observation/events layers can reach plugin storage
// without importing across plugin boundaries.
//
// Per A013/ModelPicker: module-level ctx is set by the plugin's `activate()` so callers
// outside the Provider (status-bar items, adapters) can still reach storage synchronously.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { PluginContext } from '@snapfzz/plugin-sdk';

// ─── Module-scoped ctx holder ────────────────────────────────────────────────

let _pluginCtx: PluginContext | null = null;

/** Called from plugin.activate() — stores the live PluginContext for later getters. */
export function configurePluginContext(ctx: PluginContext): void {
  _pluginCtx = ctx;
}

/** Called from plugin.deactivate() — clears the ctx so stale closures no-op. */
export function disposePluginContext(): void {
  _pluginCtx = null;
}

/** Returns the currently-stored PluginContext, or null before activate()/after deactivate(). */
export function getPluginContext(): PluginContext | null {
  return _pluginCtx;
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface PluginRuntimeContextValue {
  readonly ctx: PluginContext;
}

const PluginRuntimeContext = createContext<PluginRuntimeContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

interface PluginRuntimeProviderProps {
  readonly children: ReactNode;
}

/** Reads the module-level PluginContext (set by activate()) and provides it to children. */
export function PluginRuntimeProvider({ children }: PluginRuntimeProviderProps) {
  const ctx = getPluginContext();
  const value = useMemo(() => (ctx ? { ctx } : null), [ctx]);

  return (
    <PluginRuntimeContext.Provider value={value}>
      {children}
    </PluginRuntimeContext.Provider>
  );
}

// ─── Consumer hooks ───────────────────────────────────────────────────────────

/** Returns the plugin runtime context. Throws if used outside a PluginRuntimeProvider with a live ctx. */
export function usePluginRuntime(): PluginRuntimeContextValue {
  const value = useContext(PluginRuntimeContext);
  if (!value) {
    throw new Error('usePluginRuntime: PluginContext is not available — was activate() called?');
  }
  return value;
}

/** Returns the plugin runtime context or null when ctx is unavailable (e.g. in tests). */
export function usePluginRuntimeOptional(): PluginRuntimeContextValue | null {
  return useContext(PluginRuntimeContext);
}
