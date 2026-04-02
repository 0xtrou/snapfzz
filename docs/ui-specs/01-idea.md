# Screen: Idea Input

The first screen a user sees when starting a new project. Simple, focused, inviting.

## Default State (Empty)

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │                                                          │
│ SIDEBAR  │                                                          │
│          │           ⚡ What do you want to build?                   │
│          │                                                          │
│          │   ┌──────────────────────────────────────────────┐       │
│          │   │                                              │       │
│          │   │  Describe your idea in plain language...     │       │
│          │   │                                              │       │
│          │   │  Examples:                                   │       │
│          │   │  • "A Stripe Atlas alternative for SEA"      │       │
│          │   │  • "An AI code review tool for small teams"  │       │
│          │   │  • "A landing page builder with payments"    │       │
│          │   │                                              │       │
│          │   │                                              │       │
│          │   └──────────────────────────────────────────────┘       │
│          │                                          [→ Start] btn   │
│          │                                                          │
│          │   ─── or pick a template ───                             │
│          │                                                          │
│          │   ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│          │   │ 🌐 SaaS  │ │ 📄 Landing│ │ 🔌 API   │               │
│          │   │ Starter  │ │ Page     │ │ Service  │               │
│          │   └──────────┘ └──────────┘ └──────────┘               │
│          │   ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│          │   │ 🤖 CLI   │ │ 📱 Mobile│ │ 🛒 Store  │               │
│          │   │ Tool     │ │ App     │ │ Front   │               │
│          │   └──────────┘ └──────────┘ └──────────┘               │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│  AgentScope ● Connected    LLM: claude-sonnet    Tokens: 0         │
└─────────────────────────────────────────────────────────────────────┘
```

## Typing State

```
│          │                                                          │
│          │           ⚡ What do you want to build?                   │
│          │                                                          │
│          │   ┌──────────────────────────────────────────────┐       │
│          │   │                                              │       │
│          │   │  I want to build a Stripe Atlas alternative  │       │
│          │   │  for Southeast Asian founders. Should handle │       │
│          │   │  company registration, bank accounts, and    │       │
│          │   │  tax compliance for SG, VN, TH, ID.         │       │
│          │   │                                              │       │
│          │   │  █                                           │       │
│          │   │                                              │       │
│          │   └──────────────────────────────────────────────┘       │
│          │                                    [→ Start Clarify] btn │
│          │                                                          │
```

## After Submit (Transition)

```
│          │                                                          │
│          │   ┌──────────────────────────────────────────────┐       │
│          │   │ YOUR IDEA                                    │       │
│          │   │ ────────                                     │       │
│          │   │ Stripe Atlas alternative for SEA founders.   │       │
│          │   │ Company registration, bank accounts, tax     │       │
│          │   │ compliance for SG, VN, TH, ID.              │       │
│          │   └──────────────────────────────────────────────┘       │
│          │                                                          │
│          │   ● ClarifyAgent is preparing questions...               │
│          │   ◌ ◌ ◌                                                  │
│          │                                                          │
```
