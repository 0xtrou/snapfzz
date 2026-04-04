---
title: "Sandbox First, Not Isolation Later"
type: learning
date: 2026-04-04
tags: [box-manager, sandbox, security, ai-execution, p1]
---

# Sandbox First, Not Isolation Later

## Context

The original architecture had `snapfzz-box-manager` described as "BoxLite VM CRUD, health, ports, resources." During review, the instinct was to simplify: start with `child_process` wrapper, evolve to VMs later.

This violates P1: right from the beginning.

## Why Sandbox Is Non-Negotiable for AI Execution

AI agents write and execute arbitrary code on the user's machine. Without sandboxing:

1. Agent writes `rm -rf /` — destroys host filesystem
2. Agent installs malicious npm package — compromises host
3. Agent runs crypto miner — burns CPU/battery without limits
4. Agent exfiltrates data — reads ~/.ssh, browser cookies, credentials
5. User opens untrusted third-party project — no isolation from other projects

"We'll add isolation later" means shipping a product where the AI has root-equivalent access to the user's machine. That's not an MVP trade-off — it's a liability.

## The Architecture

`snapfzz-box-manager` uses a trait-based sandbox abstraction. BoxLite (microVM) is the first and default implementation. More types scale horizontally:

```rust
trait SandboxProvider: Send + Sync {
    async fn create(&self, config: SandboxConfig) -> Result<SandboxId>;
    async fn start(&self, id: SandboxId) -> Result<()>;
    async fn stop(&self, id: SandboxId) -> Result<()>;
    async fn destroy(&self, id: SandboxId) -> Result<()>;
    async fn health(&self, id: SandboxId) -> Result<HealthStatus>;
    async fn exec(&self, id: SandboxId, cmd: &str, timeout: Duration) -> Result<ExecResult>;
    async fn port_forward(&self, id: SandboxId, guest: u16) -> Result<u16>;
    async fn snapshot(&self, id: SandboxId) -> Result<SnapshotId>;
    async fn restore(&self, snapshot: SnapshotId) -> Result<SandboxId>;
    async fn fs_mount(&self, id: SandboxId, host: &Path, guest: &Path, readonly: bool) -> Result<()>;
}
```

| Provider | When | Why |
|---|---|---|
| BoxLiteProvider | Alpha (day 1) | MicroVM — default for all AI code execution |
| ContainerProvider | Beta | OCI — environments that can't run microVMs |
| CloudProvider | V1 | Remote — heavy workloads, GPU |
| WasmProvider | V1 | WASI — ultra-fast lightweight isolation |

## What Runs Where

**Inside sandbox:**
- Node.js dev server (preview)
- Agent code execution (build, test, deploy commands)
- Any shell command the agent wants to run
- Third-party plugin code needing filesystem/network

**On host (NOT sandboxed):**
- Tauri app (Rust)
- AgentScope (Python, supervised by Rust)
- Frontend (WebView)

## Snapshot/Restore

BoxLite supports snapshot/restore for < 50ms boot after first creation. This makes sandbox creation feel instant — the VM is pre-built, snapshotted, and restored per-project.

## Rule

If your product lets AI execute code on user machines, sandbox is not a feature — it's a prerequisite. Build the isolation interface on day 1. The implementation can evolve (microVM → container → cloud), but the contract must be right from the start (P1).
