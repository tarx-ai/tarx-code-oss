#!/bin/sh
# Launch tarx-tray using the project's Electron binary (no npm install needed)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON="${SCRIPT_DIR}/../../.build/electron/TARX Workbench.app/Contents/MacOS/Electron"

if [ ! -x "$ELECTRON" ]; then
  echo "Error: Electron binary not found at: $ELECTRON" >&2
  echo "Run 'yarn compile' in the tarx-code-oss root first." >&2
  exit 1
fi

exec "$ELECTRON" "$SCRIPT_DIR"
