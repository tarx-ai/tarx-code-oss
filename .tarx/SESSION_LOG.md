# Session Log

## 2026-02-20-1300 conversational-first-ux
**Attempted:** Implement conversational-first UX — all user flows route through @tarx chat participant
**Shipped:**
- DELETED: `extensions/tarx/src/onboarding/ftux-panel.ts` (734 LOC webview)
- DELETED: `extensions/tarx/src/auth/authChatView.ts` (1,249 LOC webview)
- DELETED: `extensions/tarx/src/chatPanel.ts` (917 LOC webview)
- DELETED: `extensions/tarx/src/sessionPanel.ts` (1,347 LOC webview)
- DELETED: `extensions/tarx/src/dashboardPanel.ts` (207 LOC webview)
- DELETED: `extensions/tarx/src/projectContextPanel.ts` (2,361 LOC webview)
- NEW: `extensions/tarx/src/chat/conversationalFlows.ts` — intent detection + handlers for FTUX, auth, settings, project setup
- MODIFIED: `extensions/tarx/src/services/firstRunFlow.ts` — uses conversational onboarding instead of FTUX panel
- MODIFIED: `extensions/tarx/src/auth/index.ts` — removed AuthChatView export
- MODIFIED: `extensions/tarx/src/extension.ts` — removed all dead panel imports, wired conversational intent detection into @tarx chat participant, auth uses showInputBox
- MODIFIED: `CLAUDE.md` — v3 protocol
- NEW: `.tarx/MEMORY.md` — system state
- NEW: `.tarx/SESSION_LOG.md` — this file
**Broken:** Nothing expected — 6,815 LOC of webview panels deleted, replaced by ~350 LOC of conversational handlers
**Next:** yarn compile verification. Test @tarx greeting on first run. Test "set up PIN" / "unlock" / "show settings" / "start project" chat commands. Create V1_SHIP_PLAN.md.
**Commits:** 0e9a860, 0cb8bcb
---

## 2026-02-20-1145 ftux-handoff-agent-hub
**Attempted:** Fix FTUX chat handoff (Session B), kill custom UI (project UX), implement Agent Hub via chat participant
**Shipped:**
- `extensions/tarx/src/extension.ts` — registered `tarx.chat.send` command (FTUX handoff fix), wired agent hub intent detection, updated `loadProjectInstructions` to check `.tarx/context.md`
- `extensions/tarx/src/agents/agentHub.ts` — NEW: conversational agent hub (types, intent detection, list/run/create/status/enable/disable handlers)
- `extensions/tarx/src/projectContextPanel.ts` — killed floating "Chat with TARX" input + instructions textarea, replaced with `.tarx/context.md` file opener
- `extensions/tarx/src/testHarness.ts` — updated save-instructions endpoint for context.md
- `.tarx/agents/health-monitor.json` — NEW: seed agent (schedule, every 30min)
- `.tarx/agents/daily-summary.json` — NEW: seed agent (schedule, daily 6pm)
- `.tarx/agents/local-dev-assistant.json` — NEW: seed agent (watch, file changes)
**Broken:** Nothing — yarn compile 0 errors
**Next:** Test agent commands in TARX chat (@tarx show agents, @tarx run health-monitor). Wire `tarx.mcp.callTool` command for actual MCP execution. Create agent from conversation flow (step 2 of "create agent").
**Commits:** 824fa5d
---

## 2026-02-20-1200 protocol-bootstrap
**Attempted:** Establish CC ↔ TARX session protocol — CLAUDE.md, MEMORY.md, SESSION_LOG.md
**Shipped:** CLAUDE.md v2.0 (replaced v1), .tarx/MEMORY.md (new), .tarx/SESSION_LOG.md (new)
**Broken:** Nothing — infrastructure only
**Next:** Create V1_SHIP_PLAN.md with current priorities. Verify all CC sessions pick up the new protocol.
**Commits:** 409a40e
---
