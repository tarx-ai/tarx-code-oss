# TARX System Knowledge Base

> Generated: Feb 12, 2026 | Version: 1.1.0 | Commit: 0a85116

This document is the canonical source of truth for TARX architecture, capabilities, and state. It is auto-indexed into RAG (space: 4690883b-33b5-491b-af7c-91bee7c97723) for self-knowledge queries.

---

## 1. ARCHITECTURE OVERVIEW

TARX is a VS Code (code-oss) fork that transforms the IDE into an AI-native development environment. The product IS the IDE.

### Core Principle
Local-first, privacy-preserving AI. Your code never leaves your machine unless you explicitly route to Claude API.

### Technology Stack
- **Base**: VS Code 1.109 (code-oss fork)
- **Language**: TypeScript (extensions), Rust (tarx-local binary)
- **Database**: SQLite (local persistence)
- **LLM**: llama-server with Qwen 8B fine-tuned model
- **Embeddings**: nomic-embed-text via embedding server
- **Networking**: libp2p mesh (P2P federation)
- **Telemetry**: Sentry at tarx-fo.sentry.io

---

## 2. EXTENSION INVENTORY

**7 Active Extension Directories:**

| Extension | Purpose | Status |
|-----------|---------|--------|
| `tarx/` | Main extension: sidebar, chat, commands, status bar | Active |
| `tarx-core/` | MCP server: memory, spaces, sessions, files, RAG | Active |
| `tarx-ops/` | MCP server: Sentry, orchestration, file locks, daemon | Active |
| `tarx-ui-mcp-server/` | MCP server: UI control, screenshots, testing | Active |
| `tarx-local/` | Rust binary management: llama-server, embedding server | Active |
| `tarx-theme/` | TARX purple theme | Active |
| `tarx-shared/` | Shared utilities across extensions | Active |

**Retired (deleted in 0a85116):**
- tarx-admin-mcp, tarx-chat-mcp, tarx-claude-memory, tarx-files-mcp, tarx-harness, tarx-mcp-server, tarx-observer

---

## 3. MCP TOOL INVENTORY

### Total: 260 tools across 3 servers

### tarx-core (46 tools)
Core TARX functionality: inference, memory, spaces, sessions, files, RAG.

| Category | Count | Tools |
|----------|-------|-------|
| Core | 7 | tarx_health, tarx_chat, tarx_stress_test, tarx_reason_stream, tarx_prewarm, tarx_cancel, tarx_list_active |
| Spaces | 3 | tarx_list_spaces, tarx_create_space, tarx_get_space |
| Sessions | 4 | tarx_list_sessions, tarx_create_session, tarx_get_chat_history, tarx_send_message |
| Memory | 8 | memory_store, memory_store_observation, memory_search, memory_search_index, memory_recall, memory_list, memory_forget, memory_stats |
| Memory Sessions | 4 | memory_create_session, memory_thread_to_session, memory_get_session, memory_list_sessions |
| Thread | 1 | thread_message |
| Files/RAG | 10 | tarx_list_files, tarx_upload_file, tarx_get_file, tarx_search_knowledge, tarx_knowledge_stats, tarx_delete_file, tarx_scan_directory, tarx_add_watch, tarx_remove_watch, tarx_rescan |
| Training | 3 | tarx_export_training_data, tarx_rate_response, tarx_training_stats |
| Sidebar | 3 | tarx_sidebar_refresh, tarx_sidebar_navigate, tarx_sidebar_get_state |
| Smart | 3 | tarx_system_brief, tarx_project_context, tarx_session_context |

### tarx-ops (47 tools)
Admin, Sentry, orchestration, Claude Code session management.

| Category | Count | Tools |
|----------|-------|-------|
| Sentry | 7 | tarx_admin_sentry_projects, events, issues, search, event_details, issue_events, trace |
| Admin | 2 | tarx_admin_status, tarx_admin_performance_metrics |
| File Locks | 3 | tarx_admin_file_lock, file_unlock, file_conflicts |
| Claude Code | 6 | tarx_admin_start/list/get/send/stop/clear_code_session |
| Tether | 3 | tarx_dispatch_work, tarx_check_work, tarx_work_history |
| Console | 2 | tarx_admin_read_console, tarx_admin_tail_console |
| Orchestration | 19 | register_session, state, report_activity, activity, list_sessions, pause, read_file, update_file, create_doc, list_docs, doc_history, assign_task, task_update, task_list, milestone_create/update/list, push_context, broadcast, get_updates, mark_delivered, request_feedback, list_feedback_requests, status_report |
| Daemon | 3 | tarx_daemon_start, stop, status |

### tarx-ui-mcp-server (167 tools)
Full UI automation, editor control, screenshots, testing.

| Module | Count | Purpose |
|--------|-------|---------|
| legacy | 9 | Original TARX chat/status tools |
| editor | 18 | File open/close, text manipulation, decorations |
| terminal | 12 | Terminal create/send/list/close |
| panels | 14 | Panel show/hide/toggle, sidebar control |
| notifications | 10 | Info/warning/error notifications, dialogs |
| tarx-sidebar | 16 | TARX sidebar state, actions, navigation |
| chat | 12 | VS Code chat panel automation |
| commands | 8 | Command palette, command execution |
| explorer | 12 | File tree, create/delete/rename files |
| scm | 8 | Git staging, commits, branch info |
| debug | 8 | Debug session control |
| extensions | 6 | Extension install/uninstall/enable |
| settings | 8 | Settings read/write |
| screenshot | 8 | Screenshot capture, OCR, visual verification |
| window | 8 | Window control, zoom, workspace |
| statusbar | 4 | Status bar items |
| theme | 6 | Color/icon themes, fonts |
| test-runner | 10 | Automated UI test execution |

---

## 4. SERVICE PORTS

| Port | Service | Health Endpoint | Description |
|------|---------|-----------------|-------------|
| 11435 | llama-server | /health | Local LLM inference (Qwen 8B fine-tuned) |
| 11436 | Mesh HTTP API | /health | P2P networking via libp2p |
| 11437 | Embedding server | /health | RAG embeddings (nomic-embed-text) |
| 11439 | UI Harness | /sidebar/state | Test harness for UI automation |

All services on localhost. All currently healthy (verified Feb 12, 2026).

---

## 5. MODEL INFORMATION

**Active Model**: `tarx-qwen2.5-7b-deep-Q4_K_M.gguf`
- Size: 4.68 GB
- Location: `~/Library/Application Support/tarx/models/`
- Fine-tuned for: TARX-aware reasoning, system knowledge, code assistance
- Features: Separate reasoning tokens, chain-of-thought, no fake action execution

**Model Router**: Classifies intent and routes to:
- **Local (Qwen)**: Reasoning, analysis, general questions
- **Network (Claude)**: Complex coding, multi-file changes, when API key present

---

## 6. DATABASE STATE

### Memory System
- Total Memories: 180
- Total Messages: 813
- Total Sessions: 289

### Spaces
16 active spaces including:
- TARX System Knowledge (RAG index)
- Claude ↔ TARX Training
- MCP Testing
- V1 Ship Bugs
- Claude Code Sessions

### RAG Knowledge Base
- Primary space: 4690883b-33b5-491b-af7c-91bee7c97723
- Chunks embedded: 558 (restored Feb 10)
- Embedding model: nomic-embed-text

---

## 7. SENTRY ERROR LANDSCAPE

### High-Volume Issues (Feb 12, 2026)

| Issue | Count | Status | Notes |
|-------|-------|--------|-------|
| HostProvider not setup | 2792 | Unresolved | #8 in ship plan |
| mkdir '/mock' denied | 766 | Unresolved | #9 in ship plan |
| Canceled errors | ~800 | Unresolved | VS Code lifecycle, expected |
| Channel closed | ~320 | Unresolved | Extension host restart, expected |

### Projects
- **node**: Extension host errors
- **mesh**: Rust binary (tarx-local) panics
- **workbench**: Core IDE errors

---

## 8. BUILD PIPELINE

```bash
# Webview changes (sidebar, chat panel)
cd extensions/tarx && node esbuild.webview.js --production
node build/lib/tarx-webview-inline.js

# Extension TypeScript changes
yarn compile

# MCP server changes
cd extensions/tarx-core && npx tsc
cd extensions/tarx-ops && npx esbuild src/server.ts --bundle --platform=node --outdir=dist
```

**Validation**: `yarn compile` must show 0 errors before any change is considered complete.

---

## 9. CODEBASE STATISTICS

- TypeScript files in TARX extensions: 51
- Total lines of TypeScript: 25,039
- Git commits (recent): 0a85116 cleanup, e0c7c44 embedding health monitor
- Branch: main
- Uncommitted changes: 0

---

## 10. DECISIONS LOG (Recent)

| Date | Decision | Commit |
|------|----------|--------|
| Feb 11 PM | V1.1 shipped (7 min). Embedding auto-restart added. 7 retired dirs deleted. | e0c7c44, 0a85116 |
| Feb 10 | Brand: TARX Code → Workbench | — |
| Feb 10 | RAG restored: 0 → 558 chunk_embeddings | — |
| Feb 10 | CLAUDE.md god prompt installed | d19f595 |
| Feb 8 | MCP consolidation: 5 servers → 3 servers | — |
| Feb 8 | Security model: 3-tier access | — |

---

## 11. KEY FILE PATHS

| Purpose | Path |
|---------|------|
| God prompt | CLAUDE.md |
| System knowledge | TARX_SYSTEM_KNOWLEDGE.md |
| Main extension | extensions/tarx/src/ |
| Extension services | extensions/tarx/src/services/ |
| Workbench integration | src/vs/workbench/contrib/tarx/ |
| MCP core server | extensions/tarx-core/src/server.ts |
| MCP ops server | extensions/tarx-ops/src/server.ts |
| MCP UI server | extensions/tarx-ui-mcp-server/src/ |
| SQLite database | ~/Library/Application Support/tarx/tarx.db |
| Models | ~/Library/Application Support/tarx/models/ |

---

## 12. SELF-AWARENESS PROTOCOL

When TARX needs to answer questions about itself:

1. **First**: Check this document (indexed in RAG)
2. **Then**: Query `memory_search_index` for recent observations
3. **If needed**: Use `tarx_system_brief` for live status
4. **For errors**: Use `tarx_admin_sentry_issues` with project="all"

### Example Query Flow
```
User: "How many MCP tools does TARX have?"
→ RAG search finds this document
→ Answer: "260 tools across 3 servers: tarx-core (46), tarx-ops (47), tarx-ui (167)"
```

---

*This document is automatically re-indexed into TARX RAG whenever updated. Last verification: Feb 12, 2026 06:07 UTC.*
