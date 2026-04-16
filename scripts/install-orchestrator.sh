#!/usr/bin/env bash
# Install the orchestrator binary into ~/.snapfzz/runtime/orchestrator/bin/
# Called by Tauri beforeDevCommand and beforeBuildCommand hooks.
set -euo pipefail

SNAPFZZ_HOME="${HOME}/.snapfzz"
RUNTIME_DIR="${SNAPFZZ_HOME}/runtime"
ORCHESTRATOR_DIR="${RUNTIME_DIR}/orchestrator"
ORCHESTRATOR_BIN="${ORCHESTRATOR_DIR}/bin"
VENV_PYTHON="${RUNTIME_DIR}/python/venv/bin/python3"
UV_BIN="${RUNTIME_DIR}/python/bin/uv"
PACKAGE_DIR="$(cd "$(dirname "$0")/../plugins/chat/intelligence" && pwd)"

# Skip if venv doesn't exist yet (first boot — pip install hasn't run)
if [ ! -f "$VENV_PYTHON" ]; then
    echo "[orchestrator] venv not ready — skipping (will install on next boot)"
    exit 0
fi

# Skip if uv doesn't exist
if [ ! -f "$UV_BIN" ]; then
    echo "[orchestrator] uv not found — skipping"
    exit 0
fi

# Ensure target directory exists
mkdir -p "$ORCHESTRATOR_BIN"

# Install the package in editable mode (produces the entry point script + live source link)
echo "[orchestrator] installing from ${PACKAGE_DIR}..."
"$UV_BIN" pip install \
    --python "$VENV_PYTHON" \
    --quiet \
    --editable "$PACKAGE_DIR"

# Copy the entry point binary to the orchestrator runtime dir
VENV_BIN="${RUNTIME_DIR}/python/venv/bin/orchestrator"
if [ -f "$VENV_BIN" ]; then
    cp "$VENV_BIN" "$ORCHESTRATOR_BIN/orchestrator"
    chmod +x "$ORCHESTRATOR_BIN/orchestrator"
    echo "[orchestrator] installed to ${ORCHESTRATOR_BIN}/orchestrator"
else
    echo "[orchestrator] ERROR: entry point not found at ${VENV_BIN}"
    exit 1
fi
