// Shared formatting utilities and constants for the LLM Analytics dashboard.

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatCost(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

export const SHARE_COLORS: string[] = [
  'var(--color-info)',
  'var(--color-success)',
  'var(--color-cyan)',
  'var(--color-gold)',
  'var(--color-warning)',
  'var(--color-error)',
];
