// Per A013/ModelPicker + feedback/contract-driven: stable contract consumed by all five layers.
// No React imports — pure TypeScript. Each layer imports only what it needs.

/** Capability flags surfaced by the picker UI. */
export interface ModelCapabilities {
  readonly vision: boolean;
  readonly tools: boolean;
  readonly reasoning: boolean;
}

/** Flattened view of a model suitable for display — derived once from ModelInfoEntry. */
export interface ModelDescriptor {
  /** Unique routing id matching LiteLLM model_name */
  readonly id: string;
  /** Human-readable label (same as id unless overridden) */
  readonly displayName: string;
  /** LiteLLM provider slug e.g. "openai", "anthropic" (kept for sorting; not rendered). */
  readonly provider: string;
  readonly capabilities: ModelCapabilities;
  /** Input cost per 1M tokens in USD (null when unknown) */
  readonly inputCostPer1M: number | null;
  /** Output cost per 1M tokens in USD (null when unknown) */
  readonly outputCostPer1M: number | null;
  /** Context window in tokens (max_input_tokens, falling back to max_tokens) — null when unknown. */
  readonly contextWindow: number | null;
}

/** Read-only state produced by observation.ts for the layout. */
export interface ModelPickerObservation {
  /** Flat, display-ordered list (pinned first, then alphabetical). */
  readonly models: readonly ModelDescriptor[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly selectedId: string | null;
  readonly isOpen: boolean;
  readonly searchQuery: string;
  readonly pinnedIds: readonly string[];
}

/** Outward event handlers produced by events.ts. */
export interface ModelPickerEventHandlers {
  readonly onSelect: (id: string) => void;
  readonly onRefresh: () => void;
  readonly onPin: (id: string) => void;
  readonly onToggleOpen: (next: boolean) => void;
  readonly onSearch: (query: string) => void;
}
