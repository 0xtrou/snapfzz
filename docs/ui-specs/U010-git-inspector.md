# Git Inspector — Version Control in the Workspace

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

Git is infrastructure. The orchestrator uses it. The human inspects it. Both need a rich view of what happened, when, and why — without leaving the workspace.

Git operations run in a **dedicated Web Worker** (`git-worker.ts`) to keep the UI at 60fps while parsing large repos.

---

## Where It Lives

Git Inspector is a **sub-feature of the Code tab** in the right panel. It's not a separate tab — it's a view mode within Code.

```
┌────┬──────┬──────┬──────┬────┬────┐
│📚KB│📁Code◀│👁Prev│🚀Dep │🔑ID│☑Com│
└────┴──────┴──────┴──────┴────┴────┘

Code tab sub-views:
┌────────┬────────┬────────┬────────┬─────────┐
│📁 Files│± Diff  │📜 Log  │🔀 Branch│🔍 Blame │
└────────┴────────┴────────┴────────┴─────────┘
```

---

## Code Tab Sub-Views

| Sub-view | Icon | What It Shows |
|---|---|---|
| **Files** | 📁 | File explorer + Monaco editor (default) |
| **Diff** | ± | Changed files since last commit / between any two refs |
| **Log** | 📜 | Commit history timeline, searchable, filterable |
| **Branches** | 🔀 | Branch list, create, switch, merge status |
| **Blame** | 🔍 | Line-by-line annotation: who, when, why (on current file) |

---

## 📁 Files (Default — Already Specified)

File explorer + Monaco editor. Git decorations in gutter (added, modified, deleted lines).

```
│ ┌────────┬────────┬────────┬────────┬─────────┐ │
│ │📁Files◀│± Diff  │📜 Log  │🔀 Branch│🔍 Blame │ │
│ └────────┴────────┴────────┴────────┴─────────┘ │
│                                                   │
│ ┌─ FILES ───────┐ ┌─ EDITOR ──────────────────┐ │
│ │ sea-atlas/    │ │ app/page.tsx               │ │
│ │ ├── app/      │ │                            │ │
│ │ │  ├ page.tsx◀│ │  1  import { Hero } from   │ │
│ │ │  ├ layout   │ │  2    '../components/Hero'  │ │
│ │ │  └ global   │ │  3                          │ │
│ │ ├── component│ │  4│ export default function │ │ ← green gutter = added
│ │ │  ├ Hero (M) │ │  5│   Home() {             │ │
│ │ │  ├ Country A│ │  6│   return (              │ │
│ │ │  └ Feature A│ │  7│     <main>              │ │
│ │ └── config/   │ │  8│       <Hero             │ │
│ │                │ │  9│         title="SEA"     │ │
│ │ (M) modified  │ │ 10│       />                │ │
│ │ (A) added     │ │ 11│     </main>             │ │
│ │ (D) deleted   │ │ 12│   )                     │ │
│ └───────────────┘ │ 13│ }                       │ │
│                    └────────────────────────────┘ │
│                                                   │
│ 8 changed │ +312 -47 │ Last commit: 30m ago      │
```

---

## ± Diff — Changed Files View

Shows all changes: working tree vs HEAD, or between any two refs.

```
│ ┌────────┬────────┬────────┬────────┬─────────┐ │
│ │📁 Files│± Diff◀ │📜 Log  │🔀 Branch│🔍 Blame │ │
│ └────────┴────────┴────────┴────────┴─────────┘ │
│                                                   │
│ Comparing: [Working Tree ▾] vs [HEAD ▾]           │
│                                                   │
│ ┌─ CHANGED FILES ──────────────────────────────┐ │
│ │                                              │ │
│ │  M  app/page.tsx                    +12  -3  │ │
│ │  M  components/Hero.tsx             +45 -12  │ │
│ │  A  components/CountryPicker.tsx     +89     │ │
│ │  A  config/jurisdictions/vn.ts       +72     │ │
│ │  A  config/jurisdictions/th.ts       +68     │ │
│ │  M  package.json                     +2  -1  │ │
│ │  D  old-component.tsx               -45      │ │
│ │                                              │ │
│ │  7 files │ +288 -61                          │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ Click any file → inline diff:                     │
│                                                   │
│ ┌─ components/Hero.tsx ────────────────────────┐ │
│ │                                              │ │
│ │  12   <div className="hero">                 │ │
│ │- 13     <h1>Incorp</h1>                      │ │ ← red = removed
│ │+ 13     <h1>SEA Atlas</h1>                   │ │ ← green = added
│ │+ 14     <p>Incorporate your company</p>      │ │
│ │+ 15     <p>in Southeast Asia</p>             │ │
│ │  16     <CountryPicker                       │ │
│ │+ 17       countries={['SG','VN','TH','ID']}  │ │
│ │  18     />                                   │ │
│ │                                              │ │
│ │  [Side-by-Side ◧] [Inline ☰]               │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ [Stage All] [Discard All] [Commit...]             │
```

### Diff Ref Selector

```
Comparing: [Working Tree ▾] vs [HEAD ▾]

Working Tree ▾          HEAD ▾
├── Working Tree         ├── HEAD
├── Staged               ├── HEAD~1
└── Last Stash           ├── HEAD~5
                         ├── main
                         ├── feat/jurisdictions
                         ├── v1.0.0
                         └── Pick commit...
```

---

## 📜 Log — Commit History

Scrollable timeline. Search. Filter by author, file, message.

```
│ ┌────────┬────────┬────────┬────────┬─────────┐ │
│ │📁 Files│± Diff  │📜 Log◀ │🔀 Branch│🔍 Blame │ │
│ └────────┴────────┴────────┴────────┴─────────┘ │
│                                                   │
│ 🔍 [Search commits...        ]  [Author▾] [File▾]│
│                                                   │
│ ┌─ COMMIT LOG ─────────────────────────────────┐ │
│ │                                              │ │
│ │  ● abc1234 — 30 min ago                      │ │
│ │  │ feat: add VN and TH jurisdictions         │ │
│ │  │ 🤖 BuildAgent │ 5 files │ +180 -12        │ │
│ │  │ [View Diff] [Checkout] [Cherry-pick]      │ │
│ │  │                                           │ │
│ │  ● def5678 — 1 hour ago                      │ │
│ │  │ feat: rename to SEA Atlas, restyle hero   │ │
│ │  │ 🤖 BuildAgent │ 3 files │ +45 -30         │ │
│ │  │ [View Diff] [Checkout]                    │ │
│ │  │                                           │ │
│ │  ● 789abcd — 1 hour ago                      │ │
│ │  │ chore: scaffold from startupsg/incorp     │ │
│ │  │ 🤖 BuildAgent │ 47 files │ +2,340         │ │
│ │  │ [View Diff] [Checkout]                    │ │
│ │  │                                           │ │
│ │  ● initial — 2 hours ago                     │ │
│ │  │ feat: initial project setup               │ │
│ │  │ 🎯 Orchestrator │ 2 files │ +15           │ │
│ │  │ [View Diff]                               │ │
│ │                                              │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ 4 commits │ 2 authors (BuildAgent, Orchestrator)  │
```

### Commit Detail (Click a commit)

```
│ [← Log]  ● abc1234                                │
│                                                   │
│ feat: add VN and TH jurisdictions                 │
│                                                   │
│ Author: 🤖 BuildAgent                             │
│ Date:   Apr 2, 2026 10:35 AM                     │
│ SHA:    abc1234def5678...                          │
│                                                   │
│ Message:                                          │
│ Added Vietnam and Thailand as jurisdiction         │
│ options. Each has registration authority,           │
│ required documents, estimated timeline,            │
│ and fee structure.                                 │
│                                                   │
│ Files changed (5):                                │
│  A  config/jurisdictions/vn.ts          +89       │
│  A  config/jurisdictions/th.ts          +72       │
│  M  config/jurisdictions/index.ts        +4  -1   │
│  M  components/CountryPicker.tsx        +12  -3   │
│  M  app/page.tsx                         +3  -1   │
│                                                   │
│ [View Full Diff] [Revert This Commit]             │
```

---

## 🔀 Branches — Branch Management

```
│ ┌────────┬────────┬────────┬────────┬─────────┐ │
│ │📁 Files│± Diff  │📜 Log  │🔀 Brnch◀│🔍 Blame │ │
│ └────────┴────────┴────────┴────────┴─────────┘ │
│                                                   │
│ BRANCHES                          [+ New Branch]  │
│                                                   │
│ ┌──────────────────────────────────────────────┐ │
│ │ ● main                          ← current    │ │
│ │   Last: abc1234 "add VN and TH" — 30m ago   │ │
│ │   Ahead: 0 │ Behind: 0 (up to date)         │ │
│ │   [Push] [Pull]                              │ │
│ ├──────────────────────────────────────────────┤ │
│ │ ○ feat/payments                               │ │
│ │   Last: 999aaa "add Stripe" — 2h ago         │ │
│ │   Behind main: 3 commits                     │ │
│ │   [Switch] [Merge into main] [Delete]        │ │
│ ├──────────────────────────────────────────────┤ │
│ │ ○ feat/dark-mode                              │ │
│ │   Last: 888bbb "dark theme" — 1d ago         │ │
│ │   Behind main: 7 commits                     │ │
│ │   [Switch] [Merge into main] [Delete]        │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ REMOTES                                           │
│ ┌──────────────────────────────────────────────┐ │
│ │ origin: github.com/0xtrou/sea-atlas          │ │
│ │ [Fetch] [Push All]                           │ │
│ └──────────────────────────────────────────────┘ │
```

---

## 🔍 Blame — Line-by-Line Annotation

Shows on the current file in Monaco. Who wrote each line, when, and the commit message.

```
│ ┌────────┬────────┬────────┬────────┬─────────┐ │
│ │📁 Files│± Diff  │📜 Log  │🔀 Branch│🔍Blame◀ │ │
│ └────────┴────────┴────────┴────────┴─────────┘ │
│                                                   │
│ File: app/page.tsx                                │
│                                                   │
│ ┌─ BLAME ──────────────────────────────────────┐ │
│ │                                              │ │
│ │ abc1234 BuildAgent 30m  1  import { Hero }   │ │
│ │ abc1234 BuildAgent 30m  2    from '../Hero'  │ │
│ │ abc1234 BuildAgent 30m  3                    │ │
│ │ def5678 BuildAgent 1h   4  export default    │ │
│ │ def5678 BuildAgent 1h   5  function Home() { │ │
│ │ def5678 BuildAgent 1h   6    return (        │ │
│ │ def5678 BuildAgent 1h   7      <main>        │ │
│ │ abc1234 BuildAgent 30m  8        <Hero       │ │
│ │ abc1234 BuildAgent 30m  9          title=    │ │
│ │ abc1234 BuildAgent 30m 10          "SEA"     │ │
│ │ abc1234 BuildAgent 30m 11          countries │ │
│ │ def5678 BuildAgent 1h  12        />          │ │
│ │ def5678 BuildAgent 1h  13      </main>       │ │
│ │ initial Orchestrator 2h 14    )              │ │
│ │ initial Orchestrator 2h 15  }                │ │
│ │                                              │ │
│ │ Hover any line → tooltip with full commit msg│ │
│ │ Click SHA → jumps to commit detail in Log    │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ 3 commits │ 2 authors │ Oldest: 2h ago            │
```

---

## Agent Integration

The orchestrator and BuildAgent use git as a tool:

```
WHAT AGENTS DO WITH GIT:

• BuildAgent auto-commits after each worker phase
  "feat: scaffold from startupsg/incorp"
  "feat: add VN and TH jurisdictions"
  "fix: resolve mobile overflow in pricing grid"

• Orchestrator creates branches for experiments
  "feat/payments" — try adding Stripe
  "feat/dark-mode" — try dark theme

• Human can ask in Chat:
  "What changed in the last 3 commits?"
  "Revert the last commit"
  "Create a branch for the new feature"
  "Show me who wrote the auth middleware"

• Agent Network shows git operations:
  10:35 🔨 BuildAgent: "Committed abc1234: add VN and TH jurisdictions (5 files)"
  10:40 🎯 Orchestrator: "Created branch feat/payments"
```

---

## Implementation — Don't Reinvent, Use Existing Libraries

Git in a Tauri app is solved. GitButler (20K stars, Tauri + Rust) proves the path.

### Backend: git2-rs + gitoxide (Rust crates)

**No custom git parsing. No git-worker.ts. Rust does it natively.**

| Crate | What | License | Why |
|---|---|---|---|
| **git2** (libgit2) | Stable git operations: log, diff, blame, branch, commit, push/pull | MIT | Battle-tested. Used by GitButler, Lapce, Cargo. |
| **gix** (gitoxide) | Pure Rust git. Faster, no C deps. | MIT + Apache 2.0 | GitButler is migrating to this. Future-proof. |

Start with `git2` (stable). Migrate to `gix` as it matures. Same pattern GitButler follows.

```rust
// Cargo.toml
[dependencies]
git2 = { version = "0.20", features = ["vendored-libgit2"] }
```

```rust
// snapfzz-box/src/git.rs — Tauri commands wrapping git2
use git2::Repository;

#[tauri::command]
async fn git_log(path: String, limit: u32) -> Result<Vec<Commit>, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    // Returns structured Commit objects — no parsing needed on JS side
    Ok(commits)
}

#[tauri::command]
async fn git_diff(path: String, ref1: String, ref2: String) -> Result<Vec<FileDiff>, String> {
    // git2::Diff returns structured hunks — no raw text parsing
    Ok(diffs)
}

#[tauri::command]
async fn git_blame(path: String, file: String) -> Result<Vec<BlameLine>, String> {
    // git2::Blame returns structured annotations per line
    Ok(lines)
}
```

**Key insight:** `git2` returns **structured data**, not raw text. No parsing needed on the JS side. No Worker needed for parsing. The Rust crate does everything.

Git operations run against the project directory **inside the BoxLite VM** via the shared volume mount.

### Frontend: Monaco Diff + react-diff-viewer-continued

| Package | Downloads/mo | What | License |
|---|---|---|---|
| **Monaco `createDiffEditor()`** | Built-in | Side-by-side diff with full syntax highlighting. Already bundled. | MIT |
| **react-diff-viewer-continued** | 2.4M/mo | Unified + split diff rendering for non-Monaco contexts (KB docs, specs). | MIT |

Monaco's built-in diff editor handles code diffs for free — no extra package, no extra bundle size. `react-diff-viewer-continued` handles markdown/text diffs in the Knowledge Base.

### What We DON'T Build

| Custom Code (eliminated) | Replaced By |
|---|---|
| ~~`git-worker.ts`~~ | `git2-rs` in Rust — structured data, no JS parsing |
| ~~`diff-worker.ts`~~ | Monaco `createDiffEditor()` + react-diff-viewer-continued |
| ~~Custom git output parsing~~ | `git2` returns structured objects natively |
| ~~Custom blame rendering~~ | Simple React component consuming `git2::Blame` output |

---

## Frontend Structure

```
packages/project/src/features/code/
├── code-panel.tsx              # Container with sub-view tabs
├── file-explorer.tsx           # File tree
├── monaco-editor.tsx           # Monaco wrapper (includes diff editor)
├── sub-views/
│   ├── files-view.tsx          # 📁 Files (default)
│   ├── diff-view.tsx           # ± Diff (Monaco createDiffEditor)
│   ├── log-view.tsx            # 📜 Log (renders git2 Commit[])
│   ├── branches-view.tsx       # 🔀 Branches (renders git2 Branch[])
│   └── blame-view.tsx          # 🔍 Blame (renders git2 BlameLine[])
├── quality-report.tsx          # 📊 Quality (13 standards)
└── index.ts
```

No `git-worker.ts` in `shared/workers/`. Git runs in Rust.

---

## Keyboard Shortcuts (Code Tab)

```
⌘ + Shift + D    → Switch to Diff sub-view
⌘ + Shift + L    → Switch to Log sub-view
⌘ + Shift + B    → Switch to Branches sub-view
⌘ + Shift + G    → Switch to Blame sub-view (on current file)
⌘ + Shift + F    → Switch back to Files sub-view
⌘ + Enter        → Commit staged changes (opens commit message input)
⌘ + Shift + P    → Push to remote
```

---

## Key Design Decisions

1. **Git is a sub-feature of Code tab, not a separate tab.** Git is about the code — it belongs with the code.
2. **git2-rs (libgit2) in Rust, not custom JS parsing.** Structured data from Rust. No Worker needed for git ops. Follow GitButler's proven path.
3. **Monaco built-in diff editor for code diffs.** Already bundled. Zero extra cost.
4. **react-diff-viewer-continued for text diffs.** 2.4M downloads/mo. MIT. For KB docs and specs.
5. **All operations run against BoxLite VM shared volume.** Git commands hit the project directory inside the isolated VM.
6. **Agents commit automatically.** Every worker phase = a commit. Full audit trail. Human can revert any agent action.
7. **Agent commits are labeled.** `🤖 BuildAgent` in the author field. Human sees exactly what the agent did.
8. **Blame shows agent vs human.** Line-level attribution: which lines did the agent write vs the human.
9. **Branches for experiments.** Orchestrator creates branches for risky changes. Human approves before merging.
10. **Future: migrate to gitoxide (gix).** Pure Rust, faster, no C deps. GitButler is doing the same migration.
