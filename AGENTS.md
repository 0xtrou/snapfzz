# Agent Instructions — Snapfzz

## Required Skills

Every agent working on this project MUST load:
- `task-assignment` (project skill at `agents/skills/task-assignment/SKILL.md`)

## Engineering Standards

Follow `ENGINEERING_GUIDE.md` at the project root. Key rules:

1. **TDD**: Write failing test first, then implement. No exceptions.
2. **Spec traceability**: Test names start with `{spec-number}/{section}:`. Inline comments cite `// Per {spec-number}/{section}:`.
3. **Traceability matrix**: Update `docs/TRACEABILITY.md` after implementation.
4. **Read specs before coding**: Every task references spec files. Read them.

## Project Structure

```
frontend/                      # pnpm monorepo
├── packages/
│   ├── @snapfzz/shared        # Entities, lib, hooks, theme
│   ├── @snapfzz/plugin-sdk    # Plugin contract (DO NOT MODIFY)
│   ├── @snapfzz/plugin-host   # Plugin loader + ContributionStore
│   ├── @snapfzz/launcher      # Launcher window shell
│   └── @snapfzz/project       # Project window shell
└── plugins/                   # System plugins (each is a package)

src-tauri/                     # Rust workspace
├── crates/                    # Core Rust crates
└── tauri.conf.json

docs/plans/                    # Architecture specs (source of truth)
docs/ui-specs/                 # UI/UX specs
docs/TRACEABILITY.md           # Spec → Code → Test matrix
```

## Commands

```bash
cd frontend && pnpm install              # Install deps
cd frontend && npx vitest run            # Run all tests
cd frontend && pnpm dev:launcher         # Dev server for launcher
cd frontend && pnpm dev:project          # Dev server for project
cd src-tauri && cargo build              # Build Rust
cargo tauri dev                          # Full Tauri app (from project root)
```

## Do Not

- Do NOT modify `@snapfzz/plugin-sdk` — it is the stable API contract
- Do NOT write code without reading relevant specs first
- Do NOT skip tests
- Do NOT add npm dependencies without justification
- Do NOT put feature code in core packages (features are plugins)
