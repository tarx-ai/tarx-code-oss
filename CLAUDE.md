# CLAUDE.md — CC ↔ TARX Protocol

**This file is law.** Every Claude Code session reads this at startup.
No exceptions. No drift. No improvisation on process.

---

## Session Lifecycle

### On Session Start (MANDATORY — do these before ANY work)

```
1. Run tarx_health → confirm services are up
2. Run tarx_db_stats → get current state counts
3. Read .tarx/SESSION_LOG.md → know what the last session did
4. Read .tarx/MEMORY.md → know what TARX remembers
5. Read V1_SHIP_PLAN.md → know current priorities
6. Report findings to user in 3 lines. No novels.
```

If any service is down, fix it before starting work. Don't build on a broken foundation.

### During Session (MANDATORY — do these as you work)

```
- Every significant decision → append to .tarx/SESSION_LOG.md
- Every file created/modified → log path + purpose in SESSION_LOG.md
- Every 30 minutes of work → checkpoint: what's done, what's next
- Before any destructive action → confirm with user
- After any build → run compile check, report errors
```

### On Session End (MANDATORY — do these before closing)

```
1. Write session summary to .tarx/SESSION_LOG.md:
   - Session ID (date-time-topic)
   - What was attempted
   - What shipped (files committed, features working)
   - What's broken or incomplete
   - Exact next steps for the next session
2. Update .tarx/MEMORY.md if any system facts changed
3. Run git status → report uncommitted changes
4. If work is done: git add + commit with descriptive message
5. If work is incomplete: document EXACTLY where you stopped
```

---

## Memory Architecture

### Where State Lives

| What | Where | Why |
|------|-------|-----|
| System facts (ports, services, tool counts) | `.tarx/MEMORY.md` | Survives across sessions |
| Session history (what happened, decisions made) | `.tarx/SESSION_LOG.md` | Audit trail |
| Current priorities | `V1_SHIP_PLAN.md` | Single source of truth |
| User preferences | VS Code `settings.json` (workspace) | Upstream pattern |
| Project context | `.tarx/context.md` per workspace | Workspace-scoped |
| Runtime state | `context.globalState` keys | VS Code API |
| Conversation memory | SQLite via tarx-core MCP | Persistent, queryable |

### .tarx/MEMORY.md Format

```markdown
# TARX System Memory
Last updated: [ISO timestamp by last CC session]

## Services
- Inference: port 11435, model [name], status [up/down]
- Mesh: port 11436, peers [n], status [up/down]
- Embeddings: port 11437, model nomic-embed-v1.5, status [up/down]

## MCP Servers
- tarx-core: [n] tools, status [ok/error]
- tarx-ops: [n] tools, status [ok/error]
- tarx-ui: [n] tools, status [ok/error]
- tarx-admin: [n] tools, status [ok/error]
- tarx-mesh: [n] tools, status [ok/error]
- tarx-verify: [n] tools, status [ok/error]
Total: [n] tools

## Known Issues
- [issue]: [status] [date]

## Architecture Decisions
- [decision]: [rationale] [date]
```

### .tarx/SESSION_LOG.md Format

```markdown
# Session Log

## [YYYY-MM-DD-HHMM] [topic]
**Attempted:** What was the goal
**Shipped:** What actually landed (file paths)
**Broken:** What's not working
**Next:** Exact next steps
**Commits:** [hash] [message]
---
```

Newest session on top. Never delete old entries. This is the audit trail.

---

## Division of Labor

### CC Owns (Do in Claude Code)

- Writing code
- Running builds
- Git operations
- File system changes
- Running tests
- Debugging with Sentry MCP tools
- Applying fixes

### TARX Owns (Query via MCP, don't replicate)

- Database state → `tarx_list_spaces`, `tarx_list_sessions`, `tarx_db_stats`
- Health monitoring → `tarx_health`
- Embeddings/RAG → `tarx_embed`, search via tarx-core
- Mesh status → `tarx_mesh_status`
- Voice pipeline → `tarx_voice_health`

### Claude.ai Owns (Browser sessions)

- High-level architecture decisions
- UX/design direction
- GTM strategy
- Work queue generation for CC
- Reviewing CC output
- Prompt engineering for CC sessions

### The Rule

**CC never stores system state in its own context.** Ask TARX, get answer, act on it, move on. If you need the data again, ask again. Don't hoard.

**Claude.ai never does implementation.** Design, decide, direct. Then hand to CC with a specific prompt.

**TARX is the database of record.** Not Claude.ai's memory. Not CC's context window. TARX's SQLite + MCP tools.

---

## Development Principles

### 1. Upstream First

If VS Code has it, use it. Do not build custom UI for anything the editor already provides.

Before writing ANY new component, answer: "Does VS Code already have this?"
- Breadcrumbs → yes, use them
- Tree views → yes, use TreeViewProvider
- Settings → yes, use workspace settings
- Auth inputs → yes, use showInputBox
- Notifications → yes, use showInformationMessage
- Progress → yes, use withProgress
- File watching → yes, use FileSystemWatcher
- Webviews → LAST RESORT, not first instinct

### 2. Conversational First

The @tarx chat participant is the primary UX surface. All user flows route through conversation unless they require persistent spatial UI.

**Spatial UI (keep as visual):**
- File tree, editor, terminal, activity bar, status bar

**Conversational UI (route through @tarx):**
- Onboarding, auth, settings, project setup, agent management, help

Before building ANY new panel or webview, answer: "Can @tarx handle this in chat?"
If yes → do it in chat. No exceptions.

### 3. Don't Invent, Integrate

No custom implementations of solved problems.
- MCP for tool orchestration (not custom RPC)
- SQLite for persistence (not custom file formats)
- libp2p for mesh (not custom networking)
- llama-server for inference (not Ollama, not custom)
- VS Code APIs for UI (not custom webviews)

### 4. Ship > Perfect

If it works, commit it. Polish later. Every session should end with at least one commit. If a session produces zero commits, something went wrong.

---

## Naming Conventions

### Git Commits
```
feat: [what] — new capability
fix: [what] — bug fix
brand: [what] — branding/theming
ux: [what] — user experience
chore: [what] — maintenance, docs, deps
perf: [what] — performance
security: [what] — security fix
```

### State Keys
```
tarx.[domain].[key]
Examples:
  tarx.auth.pinHash
  tarx.memory.enabled
  tarx.mesh.autoConnect
```

### MCP Tools
```
tarx_[verb]_[noun]  (user tools)
tarx_admin_[verb]_[noun]  (admin tools)
tarx_mesh_[verb]_[noun]  (mesh tools)
```

### File Paths
```
extensions/tarx/src/[domain]/[feature].ts
.tarx/[system-file].md
```

---

## Anti-Patterns (Things That Get Sessions Killed)

1. **Building custom UI that VS Code already has.** Stop. Use upstream.
2. **Storing state in CC's context instead of TARX.** Ask TARX, don't hoard.
3. **Starting work without reading SESSION_LOG.md.** You'll redo what was already done.
4. **Session with zero commits.** If nothing shipped, the session failed.
5. **Creating files without logging them.** Phantom files = vaporware at next QA.
6. **Ignoring build errors.** Fix red before adding green.
7. **Inventing new patterns when upstream exists.** Upstream first. Always.
8. **Building webviews when chat participant works.** Conversational first.
9. **Working on P2/P3 when P0 is incomplete.** Check V1_SHIP_PLAN.md.
10. **Not updating MEMORY.md after system changes.** Next session won't know.

---

## QA Checkpoints

### Before Any Commit
```bash
# Build passes
yarn compile 2>&1 | tail -5

# Services healthy
curl -s localhost:11435/health
curl -s localhost:11436/health
curl -s localhost:11437/health

# No regressions
git diff --stat
```

### Before Session End
```bash
# Working tree status
git status

# Recent commits
git log --oneline -5

# Update session log
# Update memory if system facts changed
```

---

## Emergency Protocols

### Service Won't Start
```bash
lsof -i :11435  # Check for orphan process
kill -9 [PID]   # Kill it
# Restart via TARX app or launch script
```

### Build Broken
```bash
git stash        # Save work
git checkout .   # Reset to clean
yarn compile     # Verify clean builds
git stash pop    # Reapply and fix
```

### State Corruption
```bash
# Reset globalState keys
# In extension: context.globalState.update('tarx.[key]', undefined)
# Or delete the VS Code storage file and restart
```

---

## Build Pipeline

```bash
# If you edited webview code (sidebar, chat panel):
cd extensions/tarx && node esbuild.webview.js --production
node build/lib/tarx-webview-inline.js

# If you edited extension TypeScript:
yarn compile

# Full rebuild:
cd ~/Desktop/tarx-code-oss && yarn compile 2>&1 | tail -30
```

Always verify with `yarn compile` — 0 errors required.

## Ports (all on localhost)

| Port  | Service          | What it does                     |
|-------|------------------|----------------------------------|
| 11435 | llama-server     | Local LLM inference (Qwen 8.2B)  |
| 11436 | Mesh HTTP API    | P2P networking (libp2p)          |
| 11437 | Embedding server | RAG embeddings (nomic-embed)     |

## MCP Tools (313 tools across 6 servers)

Memory: tarx_memory_store, tarx_memory_search, tarx_memory_recall, tarx_memory_list, tarx_memory_delete
Health: tarx_system_brief (everything in one call), tarx_health, tarx_project_context
Sentry: tarx_admin_sentry_issues, tarx_admin_sentry_events, tarx_admin_sentry_search, tarx_admin_sentry_event_details, tarx_admin_sentry_trace
Console: tarx_admin_read_console, tarx_admin_tail_console
Orchestration: tarx_admin_file_lock/unlock, tarx_orchestrate_assign_task/task_update

---

## Key Specs

- **Context Protocol:** [`extensions/tarx/docs/TARX_CONTEXT_PROTOCOL.md`](extensions/tarx/docs/TARX_CONTEXT_PROTOCOL.md) — Three-tier context hierarchy (Identity/Knowledge/Conversation), adaptive budgeting, RAG quality management, privacy levels, degradation chain.

---

## This Document's Lifecycle

- Lives at: `~/Desktop/tarx-code-oss/CLAUDE.md`
- Also referenced in: `~/Desktop/tarx-code-oss/.tarx/MEMORY.md`
- Updated by: Any CC session that discovers a new rule or anti-pattern
- Never deleted. Only appended or refined.
- Version: 3.0 — February 20, 2026
