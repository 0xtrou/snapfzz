# Review: T9 — Settings Persistence + Path Config

## Verdict: PASS WITH NOTES

## Findings

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium | TRACEABILITY.md missing A004 section | Defer to T8 completion |
| 2 | Low | Missing corrupt-pointer test | Add test |
| 3 | Low | Tests 4+5 not fully injectable | Accept — loose assertion OK for Alpha |
| 4 | Low | Platform-path comment missing on snapfzz_home() | Add comment |
| 5 | Info | serde_json unwrap() inconsistency | Accept — can't fail |

## What's Good
- Core logic correct: all 4 fallback cases handled
- set_data_dir: no migration, pointer only
- Zero stale snapfzz-global references
- No TODO/FIXME/HACK
- Inline spec comments on all decisions
- Budget crate path consistent
- 43 tests passing (38 budget + 5 persistence)
