---
name: W9.B Model Picker Slice B
description: ModelPicker component shipped in W9.B on feat/orchestrator — five-layer, shared LlmGatewayClient, Spark design, plugin storage for persistence.
type: project
---

The orchestrator model picker row (Slice B) was completed in wave W9.B.

Key architectural decisions:
- `@snapfzz/shared/src/llm/` promotes `LlmGatewayClient` factory with cached base-url + master-key — avoids repeated Tauri round-trips.
- `settings-llm` re-exports the shared `ModelInfo*` types instead of duplicating them. `ModelInfoDetails` has an index signature to satisfy settings-llm's dynamic field access.
- `PluginRuntimeContext` uses a module-level `getPluginContext()` store (same pattern as `use-chat.ts`) — no prop-threading needed.
- `ChatComposer` gained optional `prefix?: ReactNode` threaded into Spark `Sender`'s `prefix` slot.
- `ConnectionStatus` reads `SELECTED_MODEL_STORAGE_KEY` on mount via `getPluginContext()`.

**Why:** Spec required model picker chip anchored to Spark Sender's prefix slot, grouped model list with capability icons, persistence via plugin storage.

**How to apply:** When adding more orchestrator features that need plugin storage, use `getPluginContext()` from `use-chat.ts` — not a prop. The `PluginRuntimeProvider` + `usePluginRuntimeOptional()` pattern handles the React context side.
