import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';
import { App } from './app/App';
import '@snapfzz/shared/src/theme/tokens.css';
import './globals.css';

// Expose React for dynamically loaded plugins (asset:// protocol).
// Plugins must use the host's React instance — bundling a separate copy
// breaks hooks (duplicate reconciler). See plugins/orchestrator/vite.config.ts.
(window as any).__snapfzz_shared = { React, ReactDOM, jsxRuntime };

if (import.meta.env.PROD) {
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
