---
name: A020 Phase 1 documentation update
description: What was updated in docs when A020 Phase 1 landed (plugin rename, PluginProcessFactory, install flow)
type: project
---

A020 Phase 1 implemented on 2026-04-15. All plugin architecture docs updated on 2026-04-16.

**Why:** System plugins now follow the same install flow as user plugins. Hardcoded `AgentScopeFactory` replaced by generic `PluginProcessFactory`. Plugin renamed chat→orchestrator.

**Key changes made:**
- `plugins/chat/` → `plugins/orchestrator/`, ID `snapfzz.orchestrator`, package `@snapfzz/orchestrator-plugin`
- `AgentScopeFactory` / `AgentScopeService` removed; replaced by `PluginProcessFactory` at `src-tauri/src/factories/plugin_runtime.rs`
- 6 new Tauri commands at `src-tauri/src/commands/plugin_runtime.rs`: install_system_plugin, install_plugin_runtime, register_plugin_runtime, spawn_plugin_runtime, unregister_plugin_runtime, list_installed_plugins, get_plugin_info
- Plugin dir now: `~/.snapfzz/plugins/{id}/` with manifest.json, dist/index.js, intelligence/, pack/, runtime/bin/
- Two-tier discovery: Tier 1 (hardcoded settings plugins), Tier 2 (dynamic via list_installed_plugins)
- Orphan cleanup: boot scans `~/.snapfzz/runtime/*/` — no hardcoded list
- host/port injected via manifest `hostFlag`/`portFlag` fields

**Docs updated:**
- ARCHITECTURE.md — commands listing, Plugin Sandbox dir layout, new Plugin Discovery section, A020 in Spec Index
- AGENT_GET_STARTED.md — factories/ listing (agentscope.rs removed), commands/ (plugin_runtime.rs added), packs description
- REVIEW_GUIDE.md — Boundary Check: plugins/chat/ → plugins/orchestrator/
- README.md — badge: @snapfzz/chat → @snapfzz/orchestrator (was already updated)
- docs/plans/A005-plugin-architecture.md — plugin dir structure, settings UI mock, Core Rust crates listing, system plugins listing
- docs/plans/A016-runtime-architecture.md — status note, agentscope.rs marked REMOVED, migration table updated
- docs/plans/A018-packs-refactoring.md — AgentScopeRuntime removed, agentscope.rs marked ALREADY DELETED
- docs/plans/A014-kernel-architecture.md — spawn_agentscope() replaced in example
- docs/learning/003 — update note about snapfzz-agent-supervisor removal
- docs/learning/007 — update note + body text: plugins/chat/ → plugins/orchestrator/
- docs/learning/009 — update note: AgentScope Runtime not adopted, QwenPaw path taken instead

**How to apply:** When working on plugin-related features, the new canonical dir is plugins/orchestrator/ with manifest.json at root (not definePlugin() for runtime declarations).
