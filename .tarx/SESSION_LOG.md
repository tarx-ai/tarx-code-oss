# Session Log

## [2026-02-27-1430] v1.0.0-release
**Attempted:** Final V1.0.0 release build — delete old release, rebuild, sign, notarize, publish
**Shipped:**
  - Deleted existing v1.0.0 GitHub release + tag
  - `scripts/release.sh 1.0.0` — full pipeline: compile (79s) → gulp arm64 (155s) → sign (dylibs/nodes/exes/frameworks/helpers/main) → DMG (253M) → notarize (Accepted, e1e2f5de) → staple → publish
  - Gatekeeper: `accepted — source=Notarized Developer ID`
  - DMG: `TARX-Workbench-1.0.0-arm64.dmg` (253M)
  - SHA256: `2fd536a8f0fd423cc8c4d23961e029f55c21ad458d4fe22fb601f8efb3b96de8`
  - Release: https://github.com/tarx-ai/tarx-code-oss/releases/tag/v1.0.0
  - Committed: entitlements.plist, CLI tests, workspace context, tarx-local gitignore
**Broken:** `scripts/release.sh` and `scripts/rag-populate.mjs` fail pre-commit hygiene (whitespace/unicode) — left untracked
**Next:** Fix release.sh/rag-populate.mjs hygiene, push to remote, verify DMG download from GitHub
**Commits:** 40745af
---

## [2026-02-26-2359] document-e2e-probe
**Attempted:** Document the `--e2e-probe` flag and E2E test loop
**Shipped:**
  - `extensions/tarx-cli/src/index.ts` — Added `--e2e-probe` runtime guard to CC use-case commands (build/refactor/fix/test/document/plan) with inline doc reference
  - `extensions/tarx-cli/src/heartbeat.ts` — Added block-level documentation for E2E test loop (4 phases: CC routing, conversational intents, RAG, MCP audit) + JSDoc on `runCCUseCaseTests`
**Broken:** Nothing — tsc clean
**Next:** Commit pending CLI changes (this + previous session's audit work)
**Commits:** pending
---

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

## [2026-02-26-0430] cli-audit-update-v1
**Attempted:** Audit TARX CLI, fix 3 bugs, add ASCII art, add Claude Code use cases
**Shipped:**
  - `feedback.ts` — ASCII banner, box drawing, new recovery/suggest maps
  - `greeting.ts` — Rich greeting with printBanner + box (services, priorities, memory)
  - `mesh.ts` — BUG FIX: getStatus() endpoint /mesh/status → /health
  - `index.ts` — BUG FIX: `update` command rejects HTML, fetches JSON. BUG FIX: `search` uses better-sqlite3 + cosine similarity on knowledge_embeddings. `mesh` command shows formatted status. `build/refactor/fix/test/document/plan` dispatch to Claude Code. Reorganized help into sections.
  - `bin/tarx` — Bare invocation routes to greeting, added new dispatch commands
  - `package.json` — Added better-sqlite3 dep
**Broken:** Nothing — all 3 bugs fixed, tsc clean, all commands tested
**Next:** Install CLI globally (npm link or copy dist/), verify `tarx.com/api/cli/latest` domain routing
**Commits:** pending
---

## [2026-02-26-1800] e2e-test-loop-v1
**Attempted:** Add E2E test loop to daemonTick() — CC use cases, conversational intents, RAG, MCP audit
**Shipped:**
  - `heartbeat.ts` — Step 14: processE2ETestLoop() — 4 test phases (cc_use_cases, conversational_intents, rag_search, mcp_audit)
  - CC use case dry-run: validates build/refactor/fix/test/document/plan route via --e2e-probe flag
  - Conversational intent parity: 13 intent patterns pulled from conversationalFlows.ts, tested in-process
  - RAG search pipeline: embedding server health + DB exists + search command exec
  - MCP audit: port health for all 3 services + thinking log writability
  - Structured JSON thinking output for RAG/MCP consumption
  - Seeded recurring `e2e-test: all` priority (p-049)
  - `index.ts` — Added --e2e-probe handler for CC use case commands
**Broken:** Nothing — 23/24 passed (embedding sidecar idle is expected)
**Next:** Add auto-reseed of e2e-test priority on wake, expand RAG test to wait for sidecar
**Commits:** pending
---

## [2026-02-26-1830] cli-memory-hardened-v1
**Attempted:** Harden CLI memory reload, persistent prompt, proactive greeting, perpetual testing
**Shipped:**
  - `greeting.ts` — Deep memory reload: getRecentThoughts(5), getRecentOrchActions(3), getDaemonStatus(), adaptive suggest (doctor/priorities/wake/brief based on state). Memory box shows daemon ●/○, orch actions with timestamps, last thinking entries.
  - `~/.claude/settings.json` — SessionStart hook: tails thinking.log (20), orch-log (10), lists active priorities, prints TARX Driver context prompt. Runs on every session start + resume.
  - Seeded `p-052: e2e-test: UI hammering` — perpetual UI testing priority for daemon
**Broken:** Nothing — tsc clean, greeting renders, hook validates
**Next:** Auto-reseed e2e-test priorities on daemon tick, expand RAG search in greeting
**Commits:** pending
---
