// Ported from qwenpaw/console/src/api/config.ts — adapted for Snapfzz plugin context.
// SURGICAL EDIT (Phase 2a): getApiUrl is now async and delegates base URL resolution
// to adapter.ts (Rust bridge). buildAuthHeaders returns plugin-scope headers only.

// Path: qwenpaw/api/config.ts → up api/ → up qwenpaw/ → ChatPanel/adapter.ts (2 levels)
import { getRuntimeBaseUrl } from '../../adapter';

/**
 * Get the full API URL with /api prefix.
 * Async because the base URL is resolved via Rust IPC on first call.
 */
export async function getApiUrl(path: string): Promise<string> {
  const base = await getRuntimeBaseUrl();
  if (!base) throw new Error('[qwenpaw-port] Runtime base URL not available — plugin not activated?');
  const apiPrefix = '/api';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${apiPrefix}${normalizedPath}`;
}

/**
 * No-op token for plugin context — auth is handled at the Rust/backend layer.
 */
export function getApiToken(): string {
  return '';
}

export function setAuthToken(_token: string): void {
  // No-op in plugin context
}

export function clearAuthToken(): void {
  // No-op in plugin context
}
