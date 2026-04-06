# Build: T13c — Preset Descriptions + Scaling Rules

## What Was Built
- build_preset takes HardwareInfo for dynamic scaling
- Battery: 2 CPU, 512MB agent, 30fps
- Balanced: 4 CPU, 1024MB agent, 60fps (2x battery)
- Performance: max(cores-2,4) CPU, min(ram*50%,8192) app, 75% agent, 60fps
- Preset labels show specs in UI
- budget.default.yaml updated
- All preset/controlled/registry tests updated

## Verification
- cargo test -p snapfzz-budget: 58 passed
