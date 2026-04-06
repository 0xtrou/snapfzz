# Build: T12c — Processes Settings Plugin

## 5 Questions
1. Which spec? → A007 (settings section), A008 (process monitoring)
2. Which zone? → Zone 3 (render only)
3. Core or plugin? → Plugin (system, surface: preferences)
4. Existing pattern? → Copy settings-performance structure
5. Test name? → A008/settings-processes: {behavior}

## What Was Built
- Plugin manifest: id snapfzz.settings.processes, icon MonitorOutlined, order 2
- ProcessesSettings.tsx: table with expandable detail rows
  - Live metrics refresh every 2s via list_processes
  - Aggregate header (N processes, total MB)
  - Status tags with color per ProcessStatus
  - Memory/CPU progress bars
  - Expandable detail: PID, health URL, CWD, owner
  - Editable config (max memory) with update_process_config
  - Restart/Kill buttons with Popconfirm
  - Live logs panel with get_process_logs/clear_process_logs
  - Cloud sandbox placeholder (grayed out, coming soon)
- Plugin discovery wired for preferences surface
- Vite aliases added to both project + preferences configs

## Tests: 66 passing
- index.test.ts: manifest, surface, budget, icon, order
- ProcessesSettings.test.tsx: table render, status colors, expand detail,
  aggregate stats, empty state, cloud placeholder, button actions

## Verification
- pnpm --filter @snapfzz/settings-processes exec npx vitest run: 66 passed
