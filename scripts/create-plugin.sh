#!/usr/bin/env bash
set -euo pipefail

# ── Snapfzz plugin scaffolding ──────────────────────────────────────
# Usage:
#   ./scripts/create-plugin.sh --system my-feature
#   ./scripts/create-plugin.sh --user community.supabase
#   ./scripts/create-plugin.sh              # interactive

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
USER_PLUGINS_DIR="$HOME/.snapfzz/plugins"

# ── Helpers ──────────────────────────────────────────────────────────

die() { printf '\033[31mError:\033[0m %s\n' "$1" >&2; exit 1; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; }

# kebab-case -> Title Case  ("my-awesome-feature" -> "My Awesome Feature")
to_title_case() {
  echo "$1" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1'
}

# dot-separated id -> display name  ("community.supabase" -> "Community Supabase")
dot_to_title() {
  echo "$1" | sed 's/\./ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1'
}

validate_system_name() {
  if ! echo "$1" | grep -qE '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'; then
    die "System plugin name must be lowercase alphanumeric + hyphens (got: $1)"
  fi
}

validate_user_id() {
  if ! echo "$1" | grep -qE '^[a-z0-9-]+\.[a-z0-9-]+$'; then
    die "User plugin id must contain a dot, e.g. 'community.supabase' (got: $1)"
  fi
}

# ── Parse arguments ─────────────────────────────────────────────────

PLUGIN_TYPE=""
PLUGIN_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --system) PLUGIN_TYPE="system"; shift; PLUGIN_NAME="${1:-}"; shift || true ;;
    --user)   PLUGIN_TYPE="user";   shift; PLUGIN_NAME="${1:-}"; shift || true ;;
    -h|--help)
      echo "Usage: $0 [--system <name> | --user <plugin_id>]"
      echo ""
      echo "  --system <name>       Create an in-process TypeScript plugin"
      echo "  --user <plugin_id>    Create a process-isolated user plugin"
      echo ""
      echo "Examples:"
      echo "  $0 --system my-feature"
      echo "  $0 --user community.supabase"
      exit 0
      ;;
    *) die "Unknown argument: $1" ;;
  esac
done

# Interactive mode if type not specified
if [[ -z "$PLUGIN_TYPE" ]]; then
  printf "Plugin type:\n  1) system  (in-process TypeScript, lives in source tree)\n  2) user    (process-isolated, lives in ~/.snapfzz/plugins/)\n"
  printf "Choose [1/2]: "
  read -r choice
  case "$choice" in
    1) PLUGIN_TYPE="system" ;;
    2) PLUGIN_TYPE="user" ;;
    *) die "Invalid choice: $choice" ;;
  esac
fi

if [[ -z "$PLUGIN_NAME" ]]; then
  if [[ "$PLUGIN_TYPE" == "system" ]]; then
    printf "Plugin name (lowercase, hyphens ok): "
  else
    printf "Plugin id (must contain a dot, e.g. community.supabase): "
  fi
  read -r PLUGIN_NAME
fi

[[ -z "$PLUGIN_NAME" ]] && die "Plugin name/id cannot be empty"

# ── Create system plugin ─────────────────────────────────────────────

create_system_plugin() {
  local name="$1"
  validate_system_name "$name"

  local plugin_dir="$PROJECT_ROOT/plugins/$name"
  [[ -d "$plugin_dir" ]] && die "Directory already exists: plugins/$name/"

  local display_name
  display_name="$(to_title_case "$name")"

  echo "Creating system plugin: plugins/$name/ ..."
  mkdir -p "$plugin_dir/src/__tests__" "$plugin_dir/src/contributions"

  # ── package.json
  cat > "$plugin_dir/package.json" <<PKGJSON
{
  "name": "@snapfzz/${name}-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "vite build",
    "build:watch": "vite build --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@snapfzz/plugin-sdk": "workspace:*",
    "@snapfzz/shared": "workspace:*",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^29.0.1",
    "react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^4.1.2",
    "@vitest/coverage-v8": "^4.1.2"
  }
}
PKGJSON

  # ── tsconfig.json (matches orchestrator)
  cat > "$plugin_dir/tsconfig.json" <<'TSCONFIG'
{
  "extends": "../../frontend/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "skipLibCheck": true
  },
  "include": ["src"]
}
TSCONFIG

  # ── vitest.config.ts (matches orchestrator)
  cat > "$plugin_dir/vitest.config.ts" <<'VITEST'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
VITEST

  # ── vite.config.ts (matches orchestrator)
  cat > "$plugin_dir/vite.config.ts" <<'VITECONF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        /^@snapfzz\//,
      ],
    },
  },
});
VITECONF

  # ── src/index.ts
  cat > "$plugin_dir/src/index.ts" <<INDEXTS
import { definePlugin } from '@snapfzz/plugin-sdk';
import type { PluginContext, PluginHandle } from '@snapfzz/plugin-sdk';

export default definePlugin({
  id: 'snapfzz.${name}',
  name: '${display_name}',
  version: '0.1.0',
  description: '${display_name} plugin for Snapfzz',
  surface: ['project'],
  activationEvents: ['onStartupFinished'],

  budget: {
    zone: 'zone3',
    reliability: { strikes: 3, windowSecs: 300 },
    network: { maxConcurrentInvokes: 2 },
    capabilities: ['rust.invoke', 'bus.emit', 'commands.register', 'logger'],
  },

  contributes: {
    commands: [],
    shortcuts: [],
  },

  async activate(ctx: PluginContext): Promise<PluginHandle> {
    return {
      async deactivate() {
        // cleanup
      },
    };
  },
});
INDEXTS

  # ── src/types.ts
  cat > "$plugin_dir/src/types.ts" <<'TYPES'
// Plugin-specific types
TYPES

  # ── src/__tests__/index.test.ts
  cat > "$plugin_dir/src/__tests__/index.test.ts" <<TESTTS
import { describe, it, expect } from 'vitest';
import plugin from '../index';

describe('${name} plugin manifest', () => {
  it('has correct id', () => {
    expect(plugin.id).toBe('snapfzz.${name}');
  });

  it('has correct name', () => {
    expect(plugin.name).toBe('${display_name}');
  });

  it('has a version', () => {
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has an activate function', () => {
    expect(typeof plugin.activate).toBe('function');
  });

  it('declares budget zone', () => {
    expect(plugin.budget.zone).toBeDefined();
  });
});
TESTTS

  # ── manifest.json
  cat > "$plugin_dir/manifest.json" <<MANIFEST
{
  "id": "snapfzz.${name}",
  "name": "${display_name}",
  "version": "0.1.0",
  "description": "${display_name} plugin for Snapfzz",
  "type": "system",
  "main": "./src/index.ts",
  "surface": ["project"],
  "activationEvents": ["onStartupFinished"]
}
MANIFEST

  echo ""
  ok "Created system plugin: plugins/${name}/"
  echo ""
  echo "  Next steps:"
  echo "    cd plugins/${name}"
  echo "    pnpm install"
  echo "    pnpm test"
  echo "    pnpm build"
  echo ""
}

# ── Create user plugin ───────────────────────────────────────────────

create_user_plugin() {
  local plugin_id="$1"
  validate_user_id "$plugin_id"

  local plugin_dir="$USER_PLUGINS_DIR/$plugin_id"
  [[ -d "$plugin_dir" ]] && die "Directory already exists: ~/.snapfzz/plugins/$plugin_id/"

  local display_name
  display_name="$(dot_to_title "$plugin_id")"

  echo "Creating user plugin: ~/.snapfzz/plugins/$plugin_id/ ..."
  mkdir -p "$plugin_dir/dist" "$plugin_dir/data" "$plugin_dir/cache"

  # ── manifest.json
  cat > "$plugin_dir/manifest.json" <<MANIFEST
{
  "id": "${plugin_id}",
  "name": "${display_name}",
  "version": "0.1.0",
  "description": "${display_name} plugin",
  "runtime": {
    "command": "python server.py",
    "port": 0,
    "healthCheck": "/health",
    "language": "python",
    "requirements": []
  },
  "capabilities": [],
  "contributes": {}
}
MANIFEST

  # ── dist/server.py
  cat > "$plugin_dir/dist/server.py" <<'SERVERPY'
"""Minimal plugin server."""
from fastapi import FastAPI
import uvicorn
import os

app = FastAPI()

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    port = int(os.environ.get("SNAPFZZ_PORT", "8080"))
    host = os.environ.get("SNAPFZZ_HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=port)
SERVERPY

  # ── permissions.json
  cat > "$plugin_dir/permissions.json" <<'PERMS'
{ "granted": [] }
PERMS

  echo ""
  ok "Created user plugin: ~/.snapfzz/plugins/${plugin_id}/"
  echo ""
  echo "  Next steps:"
  echo "    cd ~/.snapfzz/plugins/${plugin_id}"
  echo "    pip install fastapi uvicorn"
  echo "    python dist/server.py"
  echo ""
  echo "  The plugin will be discovered on next app restart."
  echo ""
}

# ── Dispatch ─────────────────────────────────────────────────────────

case "$PLUGIN_TYPE" in
  system) create_system_plugin "$PLUGIN_NAME" ;;
  user)   create_user_plugin "$PLUGIN_NAME" ;;
  *)      die "Unknown plugin type: $PLUGIN_TYPE" ;;
esac
