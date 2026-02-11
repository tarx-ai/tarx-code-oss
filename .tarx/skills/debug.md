---
name: tarx-debug
description: "Debug errors using Sentry integration, logs, and stack traces"
route: local
tools:
  - tarx_health
  - tarx_admin_sentry_events
  - tarx_admin_sentry_issues
  - tarx_admin_sentry_event_details
  - tarx_admin_read_console
  - tarx_admin_tail_console
tier: pro
---

# Debug & Diagnostics

## When to Use
- User reports a bug or error
- User says "something broke", "it crashed", "not working"
- Sentry alert triggers
- User asks about system health or recent errors

## Instructions
1. Check system health: `tarx_health`
2. Pull recent Sentry events: `tarx_admin_sentry_events` (last 30 min)
3. If specific error: `tarx_admin_sentry_event_details` for breadcrumbs
4. Cross-reference with console logs: `tarx_admin_tail_console`
5. Synthesize: root cause + fix suggestion + severity rating
6. Store resolution in memory for future reference

## Escalation Path
- Local diagnosis first (logs + Sentry)
- If unclear: suggest user reproduce with TARX console open
- If system-level: route to tarx-ops tools
