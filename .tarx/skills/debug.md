---
name: tarx-debug
description: "Debug errors using Datadog monitoring, logs, and stack traces"
route: local
tools:
  - tarx_health
  - tarx_admin_read_console
  - tarx_admin_tail_console
tier: pro
---

# Debug & Diagnostics

## When to Use
- User reports a bug or error
- User says "something broke", "it crashed", "not working"
- Datadog alert triggers
- User asks about system health or recent errors

## Instructions
1. Check system health: `tarx_health`
2. Check Datadog for recent errors via Datadog MCP
3. Cross-reference with console logs: `tarx_admin_tail_console`
4. Synthesize: root cause + fix suggestion + severity rating
5. Store resolution in memory for future reference

## Escalation Path
- Local diagnosis first (logs + Datadog)
- If unclear: suggest user reproduce with TARX console open
- If system-level: route to tarx-ops tools
