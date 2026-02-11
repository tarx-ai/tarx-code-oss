---
name: tarx-memory
description: "Persistent memory across sessions — recall decisions, preferences, project context"
route: local
tools:
  - memory_store
  - memory_search
  - memory_recall
  - memory_list
tier: free
---

# Memory & Context

## When to Use
- User says "remember this", "don't forget", "note that"
- User references something from a previous conversation
- Starting a new session (auto-recall relevant context)
- User asks "what do you know about X"

## Instructions
1. On session start: `memory_recall` with current project/topic
2. On explicit store: `memory_store` with importance 0.5-1.0
3. On reference to past: `memory_search` with extracted keywords
4. Never store: passwords, tokens, PII, API keys
5. Structured format: WHO/WHAT/WHEN/WHY for decisions

## Auto-Recall Triggers
- New chat session opened: recall last 5 relevant memories
- File opened that matches stored memory context
- User mentions project name matching a space
