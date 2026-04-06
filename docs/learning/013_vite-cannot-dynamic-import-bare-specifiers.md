---
title: "Vite Cannot Dynamic Import Bare Specifiers"
type: learning
date: 2026-04-06
tags: [vite, plugins, import, build, architecture]
---

# Vite Cannot Dynamic Import Bare Specifiers

## Context

We tried to dynamically import plugins by package name at runtime:
```typescript
const pkg = '@snapfzz/settings-general';
const mod = await import(/* @vite-ignore */ pkg);
```

This failed with `TypeError: Module name does not resolve to a valid URL`.

## Why

Vite uses Rollup for production builds. Dynamic `import()` with variable paths (bare specifiers like `@snapfzz/settings-general`) can't be resolved at build time. Vite needs to know the import path statically to:
1. Bundle the module
2. Code-split it
3. Generate the correct URL

`/* @vite-ignore */` suppresses the Vite warning but doesn't fix the resolution — the browser still can't resolve a bare specifier at runtime.

## What Works

Static import expressions that Vite can analyze:
```typescript
const loaders = [
  () => import('@snapfzz/settings-general'),    // Vite sees this statically
  () => import('@snapfzz/settings-runtime'),     // Vite sees this statically
];
```

Each `import()` becomes a separate chunk in the build. Vite resolves the path at build time, not runtime.

## The Scaling Problem

This approach requires every plugin to be listed in `plugin-discovery.ts` as a static import AND aliased in every window's `vite.config.ts`. Adding a user-installed plugin means:
1. Adding a static import line to plugin-discovery.ts
2. Adding an alias to every vite.config.ts
3. Rebuilding the app

This doesn't work for runtime plugin installation.

## The Solution (future)

User-installed plugins should be loaded differently from system plugins:

**System plugins** (ship with app): static imports in plugin-discovery.ts. Known at build time.

**User plugins** (installed at runtime): loaded from the filesystem via a different mechanism:
1. Plugin stored as compiled JS bundle at `~/.snapfzz/plugins/{id}/index.js`
2. Rust reads the plugin manifest from disk, sends to frontend via IPC
3. Frontend creates a `<script type="module">` tag or uses `new Function()` to load the compiled bundle
4. No Vite alias needed — the bundle is already compiled

This separation is correct per A005: "system plugins = third-party plugins, same API" — the API is the same, but the loading mechanism differs.

## Rule

Never use dynamic `import()` with variable paths in Vite. Every import must be statically analyzable. For runtime-loaded code, use a separate loading mechanism (script tags, Function constructor, or Rust-side bundling).
