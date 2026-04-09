# Build: Refactor snapfzz-packs — Move Python lifecycle from commands to crate

## 5 Questions
1. Which spec? → A014 (Kernel Architecture), ARCHITECTURE.md ("commands are thin, domain logic in crates")
2. Which zone? → Zone 1 (Rust backend)
3. Core or plugin? → Core (snapfzz-packs crate + commands/pip.rs)
4. Existing pattern? → Follow uv.rs/cef.rs pattern: domain logic in crate, commands delegate
5. Test name? → t32_python_runtime_* prefix (existing packs convention)

## What Was Built
(Agent fills this in after implementation)

## Spec References
- ARCHITECTURE.md: "main.rs is the orchestrator. Crates do the work." "If a command is >10 lines, the logic should move to a crate"
- A014: Kernel Architecture — crate separation, main.rs orchestrator

## Verification
- cargo check passes
- cargo test -p snapfzz-packs passes
- cargo test -p snapfzz (commands tests) passes
- All new tests use t32_ prefix
