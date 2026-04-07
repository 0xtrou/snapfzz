# User Journey — Complete Flow

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.

Two windows. Tabs are agents. Agent Network shows coordination. Specs are the contracts.

---

## Complete Flow

```
App Icon
    │
    ▼ (< 100ms)
Splash → Launcher Window
    │
    ├── First run? → Setup screen (one-time: pull images, create snapshots)
    │
    ├── Empty workspace → Hero + input + templates
    │
    └── Has projects → Project cards (Live / In Progress / Paused)
            │
            ├── [Open] or [Resume] → Project Window (last active tab)
            │
            └── [⚡ New] + type idea → Creates folder → Project Window
                                                            │
                                                            ▼
                                         ┌──────────────────────────────┐
                                         │ Project Window               │
                                         │                              │
                                         │ Tabs (each = agent + convo): │
                                         │ 💬 Clarify  ← starts here   │
                                         │ 📑 Specs                     │
                                         │ 🔍 Discovery                 │
                                         │ ⚖ Rate                       │
                                         │ 🔨 Build                     │
                                         │ 🚀 Ship                      │
                                         │ + Custom agents               │
                                         │                              │
                                         │ ▲ Agent Network (bottom)     │
                                         │                              │
                                         │ Jump to any tab anytime.     │
                                         │ Agents talk to each other.   │
                                         │ Human intervenes anywhere.   │
                                         └──────────┬───────────────────┘
                                                    │
                                                    │ close [✕]
                                                    ▼
                                              Back to Launcher
                                              (state saved to .snapfzz/)
```

---

## Step by Step

### 1. Launch → Splash (< 100ms)

Just the logo. Disappears when Launcher is ready.

### 2. Launcher Window (< 200ms)

Projects load from disk instantly. User browses, picks, or creates.

### 3. New Project

User types idea in Launcher → folder created → Project Window opens at Clarify tab.

### 4. Clarify Tab (💬 ClarifyAgent)

Agent interviews user. Requirements doc builds in real-time in the workspace panel. When done, ClarifyAgent sends requirements to SpecsAgent and DiscoverAgent via MsgHub — visible in Agent Network panel.

### 5. Specs Tab (📑 SpecsAgent)

SpecsAgent creates Business Spec v1 from requirements. User reviews and approves. As the project evolves, agents propose spec updates. SpecsAgent validates consistency. Human always approves.

### 6. Discovery Tab (🔍 DiscoverAgent)

DiscoverAgent reads requirements from specs, searches GitHub, presents candidates. User can deep-dive by chatting with the agent. Sends selected candidates to RateAgent.

### 7. Rate Tab (⚖ RateAgent)

Scores candidates against P1-P4. Shows comparison. User picks winner. Sends to BuildAgent.

### 8. Build Tab (🔨 BuildAgent)

The core experience. Split-pane with live preview. User talks to agent, steers the build, tests in preview. BuildAgent proposes spec changes through SpecsAgent when needed.

### 9. Ship Tab (🚀 ShipAgent)

Three lanes: Deploy, Legal, Payments. ShipAgent reads specs. User picks providers, agent executes. Result: live URL + business entity + payment link.

### 10. Back to Launcher

Project card updates with live status. Reopen anytime, any tab, any conversation.

---

## Agent Coordination Timeline

```
10:30  💬 ClarifyAgent → 📑 SpecsAgent: "Requirements v1 ready."
10:30  📑 SpecsAgent: "Creating Business Spec v1 draft."
10:31  📑 SpecsAgent → 👤 User: "Approve?" → ✓ Approved
10:32  💬 ClarifyAgent → 🔍 DiscoverAgent: "Requirements finalized."
10:35  🔍 DiscoverAgent → ⚖ RateAgent: "5 candidates ready."
10:39  ⚖ RateAgent → 📑 SpecsAgent: "Winner: startupsg/incorp (32/40)."
10:41  ⚖ RateAgent → 🔨 BuildAgent: "Build from startupsg/incorp."
10:45  🔨 BuildAgent → 📑 SpecsAgent: "Need Data Model change."
10:45  📑 SpecsAgent → 👤 User: "Review needed." → ✓ Approved
10:46  📑 SpecsAgent → 🔨 BuildAgent: "Data Model v3 approved."
10:50  🔨 BuildAgent → 🚀 ShipAgent: "Build complete. 13/13."
10:55  🚀 ShipAgent: "Deployed to sea-atlas.vercel.app ✓"
```

---

## State Preservation

| When user... | Saved to | Resume behavior |
|---|---|---|
| Closes mid-conversation | `.snapfzz/session/<agent>.json` | Exact conversation restored |
| Closes mid-build | `.snapfzz/` + BoxLite VM | Code, preview, changes preserved |
| Revisits shipped project | All state on disk | Any tab, full history |
| Opens on new machine | `.snapfzz/` (if committed) | History + specs restored, VMs rebuilt |

## Transitions

All GPU-composited (`transform` + `opacity` only):

| Transition | Animation |
|---|---|
| Splash → Launcher | Fade (200ms) |
| Launcher → Project | New window (OS native) |
| Tab → Tab | Fade crossover (150ms) |
| Build tab enter | Workspace 50%, Preview appears (300ms) |
| Build tab exit | Preview collapses, workspace 100% (300ms) |
| Network panel expand | Slide up (200ms) |
