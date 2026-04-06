# Build: T16 — All 8 Budgets as Table

## What Was Built
- Replaced 5 Card components with 1 Ant Design Table
- 8 budget rows: Frame, Batch Rate, CPU, Memory, Network, Storage, Startup, Reliability
- Each row: icon + name, current value, limit, usage progress bar
- Progress bars for CPU/Memory/Network/Storage (measurable)
- Dash for Frame/Batch/Startup/Reliability (config values, not usage)
- AntIcon for each budget type
- CSS variables only, no hardcoded colors
- Removed healthColor function (unused)

## Tests: 72 passing, 100% lines, 90% branches
