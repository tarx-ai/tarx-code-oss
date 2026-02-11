#!/bin/bash
# TARX Session Stop Hook
# Logs session summary for later analysis and memory ingestion.
# Lightweight: just appends to a log file.

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

# Prevent infinite loops
if [ "$STOP_ACTIVE" = "true" ]; then
  exit 0
fi

# Append session marker to log
LOG_DIR="$HOME/Library/Application Support/tarx"
LOG_FILE="$LOG_DIR/claude-sessions.log"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
BRANCH=$(cd "$CLAUDE_PROJECT_DIR" 2>/dev/null && git branch --show-current 2>/dev/null || echo "unknown")
DIFF_STAT=$(cd "$CLAUDE_PROJECT_DIR" 2>/dev/null && git diff --stat HEAD 2>/dev/null | tail -1 || echo "no changes")

{
  echo "=== Session $SESSION_ID [$TIMESTAMP] ==="
  echo "Branch: $BRANCH"
  echo "Changes: $DIFF_STAT"
  echo ""
} >> "$LOG_FILE"

exit 0
