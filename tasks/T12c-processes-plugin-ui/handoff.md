# Handoff: T12c — Processes Settings Plugin

## What Changed
- plugins/settings-processes/ — new plugin (manifest, component, tests)
- plugin-discovery.ts — wired for preferences surface
- preferences/vite.config.ts — alias added
- project/vite.config.ts — alias added (Vite static analysis)

## Key Decisions
- Ant Design Table with expandable rows for detail view
- Live refresh every 2s via list_processes command
- Restart/Kill gated by Popconfirm
- Log panel with monospace font, 50-line tail
- Cloud sandbox as placeholder row
- Nullable pid/rssMb/cpuPct to match Rust Option types

## How to Verify
- pnpm --filter @snapfzz/settings-processes exec npx vitest run → 66 pass
- cargo tauri dev → Settings → Processes tab

## Ready for Review: YES
