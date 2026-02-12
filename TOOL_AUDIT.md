# TARX MCP Server & Codebase Audit

**Date:** 2026-02-11
**Audit Version:** 2.0 (Full Verification)
**Previous Audit:** 2026-02-08 (v1.0, pre-consolidation, 131 tools / 5 servers)

---

## Executive Summary

| Metric | Count |
|--------|-------|
| **Active MCP Servers** | 4 |
| **Active MCP Tools** | 277 |
| **Active Extensions** | 10 |
| **Retired Extensions** | 5 |
| **Workbench Modified Files** | ~30 |
| **Platform Services** | 6 |
| **Build Scripts (TARX-specific)** | 2 |

### Active Server Breakdown

| Server | Directory | Tools | Build | Version |
|--------|-----------|-------|-------|---------|
| tarx-core | `extensions/tarx-core/` | 51 | tsc | 1.0.0 |
| tarx-ops | `extensions/tarx-ops/` | 50 | esbuild (ESM) | 1.0.0 |
| tarx-ui-mcp-server | `extensions/tarx-ui-mcp-server/` | 168 | esbuild (ESM) | 2.0.0 |
| tarx-observer | `extensions/tarx-observer-mcp-server/` | 8 | tsc | 1.0.0 |

**Total: 277 tools across 4 active servers**

---

## Server 1: tarx-core — 51 tools

Merged from: tarx-mcp-server (50) + tarx-claude-memory (10). Dropped voice (9), UI bridge (7), embed, mesh_status, db_stats. Added smart endpoints (3), file organization (5), training (3).

### Core (7)
| # | Tool Name | Description |
|---|-----------|-------------|
| 1 | `tarx_health` | Check health of all TARX services |
| 2 | `tarx_chat` | Send prompt (routes Local/Network) |
| 3 | `tarx_stress_test` | Stress test inference |
| 4 | `tarx_reason_stream` | Stream reasoning response |
| 5 | `tarx_prewarm` | Prewarm inference model |
| 6 | `tarx_cancel` | Cancel active inference |
| 7 | `tarx_list_active` | List active inferences |

### Spaces (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 8 | `tarx_list_spaces` | List all spaces |
| 9 | `tarx_create_space` | Create a space |
| 10 | `tarx_get_space` | Get space details |

### Sessions/Chat (4)
| # | Tool Name | Description |
|---|-----------|-------------|
| 11 | `tarx_list_sessions` | List sessions in a space |
| 12 | `tarx_create_session` | Create a session |
| 13 | `tarx_get_chat_history` | Get chat history |
| 14 | `tarx_send_message` | Send message (with inference) |

### Memory (8)
| # | Tool Name | Description |
|---|-----------|-------------|
| 15 | `memory_store` | Store a memory |
| 16 | `memory_store_observation` | Store structured observation (title, type, narrative, facts, concepts, files) |
| 17 | `memory_search` | Search memories semantically (full results) |
| 18 | `memory_search_index` | Progressive disclosure search (~50 tokens/result) |
| 19 | `memory_recall` | Recall context for topic |
| 20 | `memory_list` | List all memories |
| 21 | `memory_forget` | Delete a memory |
| 22 | `memory_stats` | Memory usage statistics |

### Memory Sessions (4)
| # | Tool Name | Description |
|---|-----------|-------------|
| 23 | `memory_create_session` | Create session for Claude.ai sync |
| 24 | `memory_thread_to_session` | Thread message to specific session |
| 25 | `memory_get_session` | Get session conversation history |
| 26 | `memory_list_sessions` | List Claude.ai sessions |

### Thread (1)
| # | Tool Name | Description |
|---|-----------|-------------|
| 27 | `thread_message` | Thread message into chat history |

### Files/RAG (5)
| # | Tool Name | Description |
|---|-----------|-------------|
| 28 | `tarx_list_files` | List uploaded files |
| 29 | `tarx_upload_file` | Upload a file |
| 30 | `tarx_get_file` | Get file content |
| 31 | `tarx_search_knowledge` | Semantic knowledge search |
| 32 | `tarx_knowledge_stats` | Knowledge base stats |

### File Organization (5)
| # | Tool Name | Description |
|---|-----------|-------------|
| 33 | `tarx_delete_file` | Delete a file from storage |
| 34 | `tarx_scan_directory` | Scan directory for reference records + RAG embed |
| 35 | `tarx_add_watch` | Add directory watch |
| 36 | `tarx_remove_watch` | Remove directory watch |
| 37 | `tarx_rescan` | Rescan all watched directories |

### Training Data (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 38 | `tarx_export_training_data` | Export training data as JSONL/JSON |
| 39 | `tarx_rate_response` | Rate an inference response |
| 40 | `tarx_training_stats` | Training data statistics |

### Sidebar Control (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 41 | `tarx_sidebar_refresh` | Refresh sidebar |
| 42 | `tarx_sidebar_navigate` | Navigate sidebar view |
| 43 | `tarx_sidebar_get_state` | Get sidebar state |

### Smart Endpoints (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 44 | `tarx_system_brief` | System health + status in one call |
| 45 | `tarx_project_context` | Project context for inference |
| 46 | `tarx_session_context` | Auto-context for Claude Code hooks |

**Note:** Source header comment says 46 tools but actual count is 51. The 5 File Organization tools (added in RAG pipeline work) were not reflected in the header.

---

## Server 2: tarx-ops — 50 tools

Merged from: tarx-admin-mcp-server (31) + tarx-orchestration-mcp (26). All tools gated by `TARX_CREATOR_KEY` env var. Audit log at `~/Library/Application Support/tarx/audit.jsonl`.

### Sentry (7)
| # | Tool Name | Description |
|---|-----------|-------------|
| 1 | `tarx_admin_sentry_projects` | List Sentry projects |
| 2 | `tarx_admin_sentry_events` | Get recent events |
| 3 | `tarx_admin_sentry_issues` | Get issues |
| 4 | `tarx_admin_sentry_search` | Search events |
| 5 | `tarx_admin_sentry_event_details` | Get event details + breadcrumbs |
| 6 | `tarx_admin_sentry_issue_events` | Get events for an issue |
| 7 | `tarx_admin_sentry_trace` | Reconstruct session trace |

### Admin Status (2)
| # | Tool Name | Description |
|---|-----------|-------------|
| 8 | `tarx_admin_status` | Server status |
| 9 | `tarx_admin_performance_metrics` | Performance metrics |

### File Coordination (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 10 | `tarx_admin_file_lock` | Acquire file lock |
| 11 | `tarx_admin_file_unlock` | Release file lock |
| 12 | `tarx_admin_file_conflicts` | Get file conflicts |

### Claude Code Sessions (6)
| # | Tool Name | Description |
|---|-----------|-------------|
| 13 | `tarx_admin_start_code_session` | Start Claude Code session |
| 14 | `tarx_admin_list_code_sessions` | List Claude Code sessions |
| 15 | `tarx_admin_get_session_output` | Get session output |
| 16 | `tarx_admin_send_to_session` | Send message to session |
| 17 | `tarx_admin_stop_code_session` | Stop session |
| 18 | `tarx_admin_clear_code_sessions` | Clear completed sessions |

### Tether / Work Dispatch (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 19 | `tarx_dispatch_work` | Dispatch work to session |
| 20 | `tarx_check_work` | Check work status |
| 21 | `tarx_work_history` | Work dispatch history |

### Console (2)
| # | Tool Name | Description |
|---|-----------|-------------|
| 22 | `tarx_admin_read_console` | Read console logs |
| 23 | `tarx_admin_tail_console` | Tail recent logs |

### Orchestration — Sessions (6)
| # | Tool Name | Description |
|---|-----------|-------------|
| 24 | `tarx_orchestrate_register_session` | Register session |
| 25 | `tarx_orchestrate_session_state` | Get session state |
| 26 | `tarx_orchestrate_report_activity` | Report activity |
| 27 | `tarx_orchestrate_session_activity` | Get activity log |
| 28 | `tarx_orchestrate_list_sessions` | List sessions |
| 29 | `tarx_orchestrate_session_pause` | Pause/resume session |

### Orchestration — Files (2)
| # | Tool Name | Description |
|---|-----------|-------------|
| 30 | `tarx_orchestrate_read_file` | Read file from workspace |
| 31 | `tarx_orchestrate_update_file` | Update file |

### Orchestration — Docs (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 32 | `tarx_orchestrate_create_doc` | Create documentation file |
| 33 | `tarx_orchestrate_list_docs` | List managed docs |
| 34 | `tarx_orchestrate_doc_history` | Get doc update history |

### Orchestration — Tasks (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 35 | `tarx_orchestrate_assign_task` | Assign task |
| 36 | `tarx_orchestrate_task_update` | Update task status |
| 37 | `tarx_orchestrate_task_list` | List tasks |

### Orchestration — Milestones (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 38 | `tarx_orchestrate_milestone_create` | Create milestone |
| 39 | `tarx_orchestrate_milestone_update` | Update milestone |
| 40 | `tarx_orchestrate_milestone_list` | List milestones |

### Orchestration — Context Sync (4)
| # | Tool Name | Description |
|---|-----------|-------------|
| 41 | `tarx_orchestrate_push_context` | Push context update |
| 42 | `tarx_orchestrate_broadcast` | Broadcast to all sessions |
| 43 | `tarx_orchestrate_get_updates` | Get pending updates |
| 44 | `tarx_orchestrate_mark_delivered` | Mark update delivered |

### Orchestration — Feedback (2)
| # | Tool Name | Description |
|---|-----------|-------------|
| 45 | `tarx_orchestrate_request_feedback` | Request user feedback |
| 46 | `tarx_orchestrate_list_feedback_requests` | List feedback requests |

### Orchestration — Status (1)
| # | Tool Name | Description |
|---|-----------|-------------|
| 47 | `tarx_orchestrate_status_report` | Full status report |

### Daemon (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 48 | `tarx_daemon_start` | Start autonomous task daemon |
| 49 | `tarx_daemon_stop` | Stop daemon |
| 50 | `tarx_daemon_status` | Daemon status |

**Note:** Source header comment says 47 tools but actual count is 50. The 3 Tether/Work Dispatch tools were added after the header was written.

---

## Server 3: tarx-ui-mcp-server — 168 tools

End-to-end UI automation and testing server. Modular tool registry across 18 categories. v2.0.0 represents massive expansion from original 9 legacy tools.

### Legacy (9)
| # | Tools |
|---|-------|
| 1-9 | `tarx_ui_get_status`, `tarx_ui_send_chat`, `tarx_ui_read_chat`, `tarx_ui_capture_error`, `tarx_ui_start_voice`, `tarx_ui_create_conversation`, `tarx_ui_select_project`, `tarx_ui_screenshot`, `tarx_ui_server_status` |

### Editor (18)
| # | Tools |
|---|-------|
| 10-27 | `tarx_ui_editor_open_file`, `close_file`, `close_all`, `get_active`, `get_tabs`, `select_tab`, `type_text`, `insert_text`, `replace_text`, `select_range`, `get_selection`, `go_to_line`, `fold`, `unfold`, `add_decoration`, `clear_decorations`, `get_diagnostics`, `trigger_suggest` |

### Terminal (12)
| # | Tools |
|---|-------|
| 28-39 | `tarx_ui_terminal_create`, `send_command`, `list`, `select`, `close`, `close_all`, `get_state`, `split`, `rename`, `show`, `hide`, `set_profile` |

### Panels (14)
| # | Tools |
|---|-------|
| 40-53 | `tarx_ui_panel_show`, `hide`, `toggle`, `get_state`, `tarx_ui_sidebar_show`, `hide`, `toggle`, `get_state`, `tarx_ui_view_open`, `close`, `focus`, `tarx_ui_secondary_sidebar_toggle`, `tarx_ui_layout_get`, `set` |

### Notifications (10)
| # | Tools |
|---|-------|
| 54-63 | `tarx_ui_notification_show_info`, `show_warning`, `show_error`, `show_progress`, `dismiss_all`, `get_visible`, `tarx_ui_dialog_input`, `quickpick`, `message`, `tarx_ui_status_message` |

### TARX Sidebar (16)
| # | Tools |
|---|-------|
| 64-79 | `tarx_ui_sidebar_get_full_state`, `do_action`, `toggle_section`, `get_projects`, `get_history`, `get_files`, `search_history`, `delete_history`, `navigate_to`, `open_settings`, `get_settings`, `update_settings`, `connection_status`, `collapse`, `expand`, `refresh` |

### Chat (12)
| # | Tools |
|---|-------|
| 80-91 | `tarx_ui_chat_open`, `close`, `new`, `send_enhanced`, `read_enhanced`, `clear`, `get_state`, `select_participant`, `get_participants`, `attach_file`, `attach_selection`, `inline_start` |

### Commands (8)
| # | Tools |
|---|-------|
| 92-99 | `tarx_ui_command_execute`, `list`, `search`, `palette_open`, `palette_type`, `tarx_ui_quickopen_open`, `type`, `select` |

### Explorer (12)
| # | Tools |
|---|-------|
| 100-111 | `tarx_ui_explorer_open`, `get_tree`, `expand_folder`, `collapse_folder`, `select_file`, `reveal_file`, `create_file`, `create_folder`, `delete`, `rename`, `copy`, `get_workspace` |

### SCM (8)
| # | Tools |
|---|-------|
| 112-119 | `tarx_ui_scm_open`, `get_changes`, `stage_file`, `unstage_file`, `stage_all`, `commit`, `discard`, `get_branch` |

### Debug (8)
| # | Tools |
|---|-------|
| 120-127 | `tarx_ui_debug_open`, `start`, `stop`, `pause`, `continue`, `step_over`, `step_into`, `get_state` |

### Extensions (6)
| # | Tools |
|---|-------|
| 128-133 | `tarx_ui_extensions_open`, `list_installed`, `search`, `install`, `uninstall`, `enable_disable` |

### Settings (8)
| # | Tools |
|---|-------|
| 134-141 | `tarx_ui_settings_open_ui`, `open_json`, `get`, `set`, `search`, `reset`, `tarx_ui_keybindings_open`, `get` |

### Screenshot (8)
| # | Tools |
|---|-------|
| 142-149 | `tarx_ui_screenshot_full`, `region`, `compare`, `ocr`, `ocr_region`, `find_text`, `verify_element`, `list` |

### Window (8)
| # | Tools |
|---|-------|
| 150-157 | `tarx_ui_window_reload`, `toggle_fullscreen`, `toggle_zen`, `zoom_in`, `zoom_out`, `zoom_reset`, `workspace_open`, `workspace_add_folder` |

### Status Bar (4)
| # | Tools |
|---|-------|
| 158-161 | `tarx_ui_statusbar_get_items`, `click`, `get_tarx`, `set_tarx` |

### Theme (6)
| # | Tools |
|---|-------|
| 162-167 | `tarx_ui_theme_set`, `get`, `list`, `icon_set`, `font_size_set`, `font_family_set` |

### Test Runner (10)
| # | Tools |
|---|-------|
| 168-177 | `tarx_ui_test_run_suite`, `run_single`, `run_category`, `run_all`, `get_results`, `get_report`, `list_suites`, `list_cases`, `reset`, `get_coverage` |

**Note:** Package.json description says 168; the 9 legacy tools + 159 new tools across 17 modules = 168 verified.

---

## Server 4: tarx-observer-mcp-server — 8 tools

Passive intelligence layer for user preference learning and cognitive growth tracking.

| # | Tool Name | Description |
|---|-----------|-------------|
| 1 | `observer_status` | Observer status: interactions, preferences, domains, gaps, queue |
| 2 | `observer_insights` | User insights by category: preferences, domain, gaps, growth |
| 3 | `observer_preferences` | View/update/delete learned preferences |
| 4 | `observer_correct` | Correct a model belief, creates training pair |
| 5 | `observer_forget` | Remove preference/domain/gap/interaction from memory |
| 6 | `observer_growth` | Cognitive growth dashboard: self-sufficiency, domain depth, trends |
| 7 | `observer_train` | Trigger training run (dry run or real) |
| 8 | `observer_export` | Export curated training data as JSONL/JSON |

---

## Extension Inventory

### Active Extensions (10)

| Extension | Type | Directory | Version | Purpose |
|-----------|------|-----------|---------|---------|
| tarx | VS Code Extension | `extensions/tarx/` | 1.0.0 | Main UI: sidebar, chat participant, 48+ commands, React webview |
| tarx-core | MCP Server | `extensions/tarx-core/` | 1.0.0 | Inference, memory, sessions, files/RAG, sidebar (51 tools) |
| tarx-ops | MCP Server | `extensions/tarx-ops/` | 1.0.0 | Admin, Sentry, orchestration, daemon (50 tools) |
| tarx-ui-mcp-server | MCP Server | `extensions/tarx-ui-mcp-server/` | 2.0.0 | UI automation, testing, screenshot/OCR (168 tools) |
| tarx-observer | MCP Server | `extensions/tarx-observer-mcp-server/` | 1.0.0 | Passive intelligence, training curation (8 tools) |
| tarx-local | VS Code Extension | `extensions/tarx-local/` | 1.0.0 | Local llama-server + embedding server management |
| tarx-shared | Shared Library | `extensions/tarx-shared/` | 1.0.0 | @tarx/shared-db — centralized SQLite module |
| tarx-skills-provider | VS Code Extension | `extensions/tarx-skills-provider/` | 1.0.0 | Skills registry, intent classification |
| tarx-supercomputer | VS Code Extension | `extensions/tarx-supercomputer/` | 1.0.0 | Mesh networking, distributed compute (libp2p) |
| tarx-theme | Theme Extension | `extensions/tarx-theme/` | 1.0.0 | TARX Dark theme |

### Retired Extensions (5) — Still in repo, not active

| Extension | Directory | Merged Into | Original Tools |
|-----------|-----------|-------------|----------------|
| tarx-mcp-server | `extensions/tarx-mcp-server/` | tarx-core | 53 |
| tarx-claude-memory | `extensions/tarx-claude-memory/` | tarx-core | 9 |
| tarx-admin-mcp-server | `extensions/tarx-admin-mcp-server/` | tarx-ops | 31 |
| tarx-orchestration-mcp | `extensions/tarx-orchestration-mcp/` | tarx-ops | 26 |

---

## Workbench Modifications

### TarxSidebarPart (Custom Sidebar)
| File | Purpose |
|------|---------|
| `src/vs/workbench/browser/parts/tarxsidebar/tarxSidebarPart.ts` | Main sidebar — React webview, 240px expanded/48px collapsed |
| `src/vs/workbench/browser/parts/tarxsidebar/webviewContent.ts` | Auto-generated: inlined sidebar.js + sidebar.css |
| `src/vs/workbench/browser/parts/tarxsidebar/tarxCommands.ts` | Command palette integration |
| `src/vs/workbench/browser/parts/tarxsidebar/tarxProjectModal.ts` | Project creation modal (emoji picker) |
| `src/vs/workbench/browser/parts/tarxsidebar/projectCreateModal.ts` | Project creation workflow |
| `src/vs/workbench/browser/parts/tarxsidebar/extensionsView.ts` | Extensions panel view |
| `src/vs/workbench/browser/parts/tarxsidebar/media/tarxSidebarPart.css` | Sidebar CSS (hides activity bar) |
| `src/vs/workbench/browser/parts/tarxsidebar/media/tarx-logo.png` | Logo asset |
| `src/vs/workbench/browser/parts/tarxsidebar/media/tarx-eyes.png` | Animated eyes asset |

### Layout & UI Modifications
| File | Changes |
|------|---------|
| `src/vs/workbench/browser/workbench.ts` | Sentry stub import, optional chaining error capture |
| `src/vs/workbench/browser/layout.ts` | ACTIVITYBAR_HIDDEN=true, AUXILIARYBAR_HIDDEN=false |
| `src/vs/workbench/browser/actions/layoutActions.ts` | Sidebar collapse → `tarx.toggleSidebarCollapse` |
| `src/vs/workbench/browser/parts/paneCompositePartService.ts` | Imports + instantiates TarxSidebarPart (line 14, 36) |
| `src/vs/workbench/browser/parts/activitybar/activitybarPart.ts` | minimumWidth/Height = 0 (disabled) |
| `src/vs/workbench/browser/parts/editor/editorGroupWatermark.ts` | "Chat with TARX" watermark |

### Platform Services
| File | Purpose |
|------|---------|
| `src/vs/platform/tarx/electron-main/tarxSidecarService.ts` | IPC to llama-server (:11435) |
| `src/vs/platform/tarx/electron-main/tarxEmbeddingSidecarService.ts` | IPC to nomic-embed (:11437) |
| `src/vs/platform/tarx/common/tarx.ts` | Service interfaces |
| `src/vs/platform/tarx/common/tarxIpc.ts` | IPC protocol definitions |
| `src/vs/platform/sentry/common/sentry.ts` | ISentryService interface + DSN |
| `src/vs/platform/sentry/electron-main/sentryMainService.ts` | @sentry/node for main process |
| `src/vs/platform/sentry/browser/sentryBrowserService.ts` | No-op stub for renderer (ESM limitation) |
| `src/vs/platform/sentry/common/aiMonitoring.ts` | AI tracing via globalThis.Sentry |

### Chat Integration
| File | Purpose |
|------|---------|
| `src/vs/workbench/contrib/chat/browser/tarxSuggestionService.ts` | Follow-up suggestions via llama-server |
| `src/vs/workbench/contrib/chat/browser/widget/tarxFollowupChips.ts` | Follow-up chip UI |

### Contributions
| File | Purpose |
|------|---------|
| `src/vs/workbench/contrib/tarx/browser/tarx.contribution.ts` | Startup: hide aux bar, register voice commands |
| `src/vs/workbench/contrib/tarxDashboard/browser/tarxDashboard.contribution.ts` | Dashboard editor registration |
| `src/vs/workbench/contrib/tarxDashboard/browser/tarxDashboardEditor.ts` | Thinking/reasoning visualization |
| `src/vs/workbench/contrib/tarxDashboard/browser/tarxDashboardEditorInput.ts` | Editor input wrapper |

### Electron Main
| File | Changes |
|------|---------|
| `src/vs/code/electron-main/main.ts` | Sentry init, sidecar service imports, error handlers |

### Build Pipeline
| File | Purpose |
|------|---------|
| `build/lib/tarx-webview-inline.js` | Inlines React webview bundle into webviewContent.ts |
| `build/lib/tarx-webview-inline.cjs` | CommonJS variant |

---

## Service Infrastructure

| Service | Port | Purpose |
|---------|------|---------|
| llama-server | 11435 | Local LLM inference (Qwen 8.2B) |
| Mesh HTTP API | 11436 | libp2p P2P networking |
| Embedding server | 11437 | nomic-embed-text-v1.5 (RAG) |

### Database Systems
| Database | Location | Engine |
|----------|----------|--------|
| memory.db | `~/Library/Application Support/tarx/memory.db` | SQLite (sqlite3 CLI) |
| tarx.db | `~/Library/Application Support/tarx/tarx.db` | better-sqlite3 |
| audit.jsonl | `~/Library/Application Support/tarx/audit.jsonl` | JSON Lines (append) |

### Embedding Pipeline
- **Model:** nomic-embed-text-v1.5 on localhost:11437
- **Dimensions:** 768
- **Chunking:** 512 chars, 128 overlap
- **Tables:** `chunk_embeddings` (legacy) + `knowledge_embeddings` (search-active)
- **Dedup:** SHA256 hash check on upload and scan paths

---

## Consolidation History

### Pre-Consolidation (Feb 2026)
5 servers, 131 tools (some duplicated):
- tarx-mcp-server: 53 tools
- tarx-claude-memory: 9 tools
- tarx-admin-mcp-server: 31 tools
- tarx-orchestration-mcp: 26 tools
- tarx-ui-mcp-server: 9 tools

### Post-Consolidation (Feb 2026)
4 servers, 277 tools:
- tarx-core: 51 (merged mcp-server + claude-memory, added smart endpoints + file org + training)
- tarx-ops: 50 (merged admin + orchestration, added daemon + work dispatch)
- tarx-ui-mcp-server: 168 (expanded from 9 legacy to full UI automation suite)
- tarx-observer: 8 (standalone, unchanged)

### Key Changes
- Voice tools (9) dropped from core — deferred to future tarx-voice server
- UI bridge tools (7) dropped from core — tarx-ui-mcp-server covers this
- embed, mesh_status, db_stats folded into tarx_system_brief
- Duplicate session tools resolved (admin vs orchestration unified in tarx-ops)
- tarx-ui-mcp-server massively expanded: 18 modular tool categories for E2E testing

---

## Build Pipeline

```bash
# Step 1: Webview bundle (if React sidebar changed)
cd extensions/tarx && node esbuild.webview.js --production
# Produces: out/webview/sidebar.js + sidebar.css

# Step 2: Inline webview content (after step 1)
node build/lib/tarx-webview-inline.js
# Generates: src/vs/workbench/browser/parts/tarxsidebar/webviewContent.ts

# Step 3: Main compile
yarn compile
# Must show 0 errors

# MCP server builds (independent)
cd extensions/tarx-core && npx tsc
cd extensions/tarx-ops && npx esbuild src/server.ts --outfile=dist/server.js --format=esm --platform=node --target=node18 --bundle --packages=external
cd extensions/tarx-ui-mcp-server && npx esbuild src/server.ts --outfile=dist/server.js --format=esm --platform=node --target=node18 --bundle --packages=external
```

---

## Source Discrepancies Found

| Location | Documented | Actual | Note |
|----------|-----------|--------|------|
| tarx-core header comment | 46 tools | 51 tools | File Org tools (5) not counted in header |
| tarx-ops header comment | 47 tools | 50 tools | Work Dispatch tools (3) not counted in header |
| MEMORY.md | "97 tools" | 277 tools | tarx-ui expansion (9→168) + observer (8) not reflected |
| CLAUDE.md | "100 tools" | 277 tools | Same issue |
