#!/bin/bash
# TARX Session Start Hook
# Injects project context at the start of every Claude Code session.
# Reads from local files (fast, no MCP spawn required).
# The tarx_session_context MCP tool is available for deeper context.

INPUT=$(cat)
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"')

# Build context sections
CONTEXT=""

# 1. Recent git activity (last 5 commits)
GIT_LOG=$(cd "$CLAUDE_PROJECT_DIR" && git log --oneline -5 2>/dev/null || echo "No git history")
if [ -n "$GIT_LOG" ]; then
  CONTEXT="$CONTEXT
## Recent Git Activity
$GIT_LOG
"
fi

# 2. Current branch and status
BRANCH=$(cd "$CLAUDE_PROJECT_DIR" && git branch --show-current 2>/dev/null || echo "unknown")
DIRTY=$(cd "$CLAUDE_PROJECT_DIR" && git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
CONTEXT="$CONTEXT
## Current State
Branch: $BRANCH | Uncommitted changes: $DIRTY files
"

# 3. TARX system hint
CONTEXT="$CONTEXT
## TARX MCP Tools Available
- tarx_session_context: Get full system health + memory context (call this for deep context)
- memory_search_index: Lightweight memory scan (~50 tokens/result, use FIRST before memory_search)
- memory_store_observation: Store structured observations (bugfix/feature/decision/discovery/change/pattern/context)
"

# 4. Build pipeline reminder
CONTEXT="$CONTEXT
## Build Pipeline (if editing TARX code)
1. Webview: cd extensions/tarx && node esbuild.webview.js --production
2. Inline: node build/lib/tarx-webview-inline.js
3. Compile: yarn compile
MCP servers: cd extensions/tarx-core && npx tsc (or esbuild for tarx-ops)
"

# Output JSON for Claude Code
echo "{
  \"hookSpecificOutput\": {
    \"hookEventName\": \"SessionStart\",
    \"additionalContext\": $(echo "$CONTEXT" | jq -Rs .)
  }
}"

exit 0
