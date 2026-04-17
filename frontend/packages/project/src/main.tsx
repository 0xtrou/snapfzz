import * as React from 'react';
// Per A020/PluginArtifact: expose the FULL `react-dom` namespace to plugin UMD bundles so
// callers of `createPortal` / `flushSync` (Spark Popover, Modal, Drawer) resolve correctly.
// `react-dom/client` only re-exports createRoot/hydrateRoot — binding it to the shared slot
// leaves createPortal undefined and crashes any plugin using Spark's portal-backed widgets.
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import { App } from './app/App';
import '@snapfzz/shared/src/theme/tokens.css';
import './globals.css';

// Plugins must use the host's React instance — bundling a separate copy breaks hooks
// (duplicate reconciler). See plugins/orchestrator/vite.config.ts rollup externals.
(window as any).__snapfzz_shared = { React, ReactDOM, jsxRuntime };

if (import.meta.env.PROD) {
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
