#!/bin/bash
# Setup TARX CLI - creates 'tarx' command in terminal
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "/usr/local/bin" ]; then
  ln -sf "$SCRIPT_DIR/tarx-cli.sh" /usr/local/bin/tarx
  echo "✅ TARX CLI installed. Run 'tarx help' to get started."
else
  echo "Add this to your .bashrc or .zshrc:"
  echo "  alias tarx='$SCRIPT_DIR/tarx-cli.sh'"
fi
