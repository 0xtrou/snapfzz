# Build: T14 — Preset Persistence + Badge UI

## What Was Built
- Settings struct: `preset` field (default "auto"), persisted to settings.json
- get_settings_sync(): reads settings at boot before registry creation
- Boot sequence: reads saved preset → creates BudgetRegistry with user's choice
- set_preset command: atomically updates frame_target + batch_rate at runtime
- PresetOption component: Ant Design Tag badges for CPU/RAM/fps
- Performance preset shows actual computed values from live metrics
- Save calls set_preset + save_settings

## Verification
- cargo check: clean
- 58 budget + 18 main = 76 Rust tests passing
