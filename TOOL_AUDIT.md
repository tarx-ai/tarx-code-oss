# TARX MCP Server Tool Audit

**Date:** 2026-02-08
**Session:** cc-mcp-consolidate

## Summary

| Server | Directory | Tools | Status |
|--------|-----------|-------|--------|
| tarx-local (tarx-mcp-server) | `extensions/tarx-mcp-server/` | 50 | Active |
| tarx-memory (tarx-claude-memory) | `extensions/tarx-claude-memory/` | 10 | Active |
| tarx-admin | `extensions/tarx-admin-mcp-server/` | 28 | Active |
| tarx-orchestration | `extensions/tarx-orchestration-mcp/` | 34 | Active |
| tarx-ui | `extensions/tarx-ui-mcp-server/` | 9 | Active |

**Total: 131 tools across 5 servers**

---

## Server 1: tarx-local (tarx-mcp-server) — 50 tools

### Core (6)
| # | Tool Name | Description |
|---|-----------|-------------|
| 1 | `tarx_health` | Check health of all TARX services |
| 2 | `tarx_chat` | Send prompt (routes Local/Network) |
| 3 | `tarx_stress_test` | Stress test inference |
| 4 | `tarx_embed` | Generate embeddings |
| 5 | `tarx_mesh_status` | Mesh network status |
| 6 | `tarx_db_stats` | Database statistics |

### Spaces (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 7 | `tarx_list_spaces` | List all spaces |
| 8 | `tarx_create_space` | Create a space |
| 9 | `tarx_get_space` | Get space details |

### Sessions/Chat (4)
| # | Tool Name | Description |
|---|-----------|-------------|
| 10 | `tarx_list_sessions` | List sessions in a space |
| 11 | `tarx_create_session` | Create a session |
| 12 | `tarx_get_chat_history` | Get chat history |
| 13 | `tarx_send_message` | Send message (with inference) |

### Memory Sessions (4) — Claude.ai integration
| # | Tool Name | Description |
|---|-----------|-------------|
| 14 | `memory_create_session` | Create session for Claude.ai sync |
| 15 | `memory_thread_to_session` | Thread message to specific session |
| 16 | `memory_get_session` | Get session conversation history |
| 17 | `memory_list_sessions` | List Claude.ai sessions |

### Files/RAG (5)
| # | Tool Name | Description |
|---|-----------|-------------|
| 18 | `tarx_list_files` | List uploaded files |
| 19 | `tarx_upload_file` | Upload a file |
| 20 | `tarx_get_file` | Get file content |
| 21 | `tarx_search_knowledge` | Semantic knowledge search |
| 22 | `tarx_knowledge_stats` | Knowledge base stats |

### Voice (9)
| # | Tool Name | Description |
|---|-----------|-------------|
| 23 | `tarx_voice_health` | Voice pipeline health |
| 24 | `tarx_voice_synthesize` | Text-to-speech |
| 25 | `tarx_voice_transcribe` | Speech-to-text |
| 26 | `tarx_voice_conversation_turn` | Full voice conversation turn |
| 27 | `tarx_voice_stress` | Voice stress test |
| 28 | `tarx_voice_reset` | Reset voice pipeline |
| 29 | `tarx_voice_config` | Get/set voice config |
| 30 | `tarx_voice_live_session` | Start live voice session |
| 31 | `tarx_voice_monitor_ui` | Monitor voice UI state |

### UI Bridge (7) — duplicates tarx-ui-mcp-server
| # | Tool Name | Description |
|---|-----------|-------------|
| 32 | `tarx_ui_status` | Get UI status |
| 33 | `tarx_ui_chat_send` | Send chat via UI |
| 34 | `tarx_ui_chat_read` | Read chat from UI |
| 35 | `tarx_ui_error` | Capture UI errors |
| 36 | `tarx_ui_voice_start` | Start voice input |
| 37 | `tarx_ui_voice_stop` | Stop voice input |
| 38 | `tarx_ui_reconnect` | Reconnect UI |

### Inference Control (4)
| # | Tool Name | Description |
|---|-----------|-------------|
| 39 | `tarx_reason_stream` | Stream reasoning response |
| 40 | `tarx_prewarm` | Prewarm inference model |
| 41 | `tarx_cancel` | Cancel active inference |
| 42 | `tarx_list_active` | List active inferences |

### Sidebar Control (8)
| # | Tool Name | Description |
|---|-----------|-------------|
| 43 | `tarx_sidebar_refresh` | Refresh sidebar |
| 44 | `tarx_sidebar_navigate` | Navigate sidebar view |
| 45 | `tarx_sidebar_get_state` | Get sidebar state |
| 46 | `tarx_sidebar_select_project` | Select project in sidebar |
| 47 | `tarx_sidebar_show_error` | Show error in sidebar |
| 48 | `tarx_sidebar_clear_error` | Clear sidebar error |
| 49 | `tarx_sidebar_set_loading` | Set loading state |
| 50 | `tarx_sidebar_set_connection` | Set connection status |

---

## Server 2: tarx-memory (tarx-claude-memory) — 10 tools

### Memory (6)
| # | Tool Name | Description |
|---|-----------|-------------|
| 1 | `memory_store` | Store a memory |
| 2 | `memory_search` | Search memories semantically |
| 3 | `memory_recall` | Recall context for topic |
| 4 | `memory_list` | List all memories |
| 5 | `memory_forget` | Delete a memory |
| 6 | `memory_stats` | Memory usage statistics |

### Threading (1)
| # | Tool Name | Description |
|---|-----------|-------------|
| 7 | `thread_message` | Thread message into chat history |

### Session Sync (3) — DUPLICATED in tarx-mcp-server
| # | Tool Name | Description |
|---|-----------|-------------|
| 8 | `memory_create_session` | Create session for Claude.ai |
| 9 | `memory_thread_to_session` | Thread to specific session |
| 10 | `memory_get_session` | Get session history |

---

## Server 3: tarx-admin (tarx-admin-mcp-server) — 28 tools

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

### Session Orchestration (5) — overlaps with tarx-orchestration
| # | Tool Name | Description |
|---|-----------|-------------|
| 8 | `tarx_admin_session_create` | Create orchestration session |
| 9 | `tarx_admin_session_assign_task` | Assign task to session |
| 10 | `tarx_admin_session_get_progress` | Get session progress |
| 11 | `tarx_admin_session_mark_complete` | Mark task complete |
| 12 | `tarx_admin_session_list_all` | List all sessions |

### File Coordination (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 13 | `tarx_admin_file_lock` | Acquire file lock |
| 14 | `tarx_admin_file_unlock` | Release file lock |
| 15 | `tarx_admin_file_conflicts` | Get file conflicts |

### Handoffs (4)
| # | Tool Name | Description |
|---|-----------|-------------|
| 16 | `tarx_admin_dependency_set` | Set session dependency |
| 17 | `tarx_admin_handoff_create` | Create handoff |
| 18 | `tarx_admin_handoff_accept` | Accept handoff |
| 19 | `tarx_admin_milestone_track` | Track milestone (create/update/list) |

### Monitoring (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 20 | `tarx_admin_dashboard` | Orchestration dashboard |
| 21 | `tarx_admin_session_log` | Session activity log |
| 22 | `tarx_admin_performance_metrics` | Performance metrics |

### Claude Code Sessions (6)
| # | Tool Name | Description |
|---|-----------|-------------|
| 23 | `tarx_admin_start_code_session` | Start Claude Code session |
| 24 | `tarx_admin_list_code_sessions` | List Claude Code sessions |
| 25 | `tarx_admin_get_session_output` | Get session output |
| 26 | `tarx_admin_send_to_session` | Send message to session |
| 27 | `tarx_admin_stop_code_session` | Stop session |
| 28 | `tarx_admin_clear_code_sessions` | Clear completed sessions |

### Console (3)
| # | Tool Name | Description |
|---|-----------|-------------|
| 29 | `tarx_admin_read_console` | Read console logs |
| 30 | `tarx_admin_tail_console` | Tail recent logs |
| 31 | `tarx_admin_clear_console` | Clear console logs |

### Admin Status (1)
| # | Tool Name | Description |
|---|-----------|-------------|
| 32 | `tarx_admin_status` | Server status |

*Note: actual count is 32, but console tools are inlined (duplicated from console-tools.ts exports) and admin_status lists 31 tools.*

---

## Server 4: tarx-orchestration (tarx-orchestration-mcp) — 34 tools

### Session Monitoring (6) — overlaps with tarx-admin
| # | Tool Name | Description |
|---|-----------|-------------|
| 1 | `tarx_orchestrate_register_session` | Register session |
| 2 | `tarx_orchestrate_session_state` | Get session state |
| 3 | `tarx_orchestrate_report_activity` | Report activity |
| 4 | `tarx_orchestrate_session_activity` | Get activity log |
| 5 | `tarx_orchestrate_list_sessions` | List sessions |
| 6 | `tarx_orchestrate_session_pause` | Pause/resume session |

### Documentation Management (5)
| # | Tool Name | Description |
|---|-----------|-------------|
| 7 | `tarx_orchestrate_read_file` | Read file from workspace |
| 8 | `tarx_orchestrate_update_file` | Update file |
| 9 | `tarx_orchestrate_create_doc` | Create documentation file |
| 10 | `tarx_orchestrate_list_docs` | List managed docs |
| 11 | `tarx_orchestrate_doc_history` | Get doc update history |

### Task & Milestone Management (6) — overlaps with tarx-admin
| # | Tool Name | Description |
|---|-----------|-------------|
| 12 | `tarx_orchestrate_assign_task` | Assign task |
| 13 | `tarx_orchestrate_task_update` | Update task status |
| 14 | `tarx_orchestrate_task_list` | List tasks |
| 15 | `tarx_orchestrate_milestone_create` | Create milestone |
| 16 | `tarx_orchestrate_milestone_update` | Update milestone |
| 17 | `tarx_orchestrate_milestone_list` | List milestones |

### Context Synchronization (4)
| # | Tool Name | Description |
|---|-----------|-------------|
| 18 | `tarx_orchestrate_push_context` | Push context update |
| 19 | `tarx_orchestrate_broadcast` | Broadcast to all sessions |
| 20 | `tarx_orchestrate_get_updates` | Get pending updates |
| 21 | `tarx_orchestrate_mark_delivered` | Mark update delivered |

### Feedback & Input (4)
| # | Tool Name | Description |
|---|-----------|-------------|
| 22 | `tarx_orchestrate_request_feedback` | Request user feedback |
| 23 | `tarx_orchestrate_provide_feedback` | Provide feedback |
| 24 | `tarx_orchestrate_check_feedback` | Check feedback status |
| 25 | `tarx_orchestrate_list_feedback_requests` | List feedback requests |

### Model Management (8)
| # | Tool Name | Description |
|---|-----------|-------------|
| 26 | `tarx_admin_model_add` | Add external model |
| 27 | `tarx_admin_model_list` | List models |
| 28 | `tarx_admin_model_update` | Update model config |
| 29 | `tarx_admin_model_delete` | Delete model |
| 30 | `tarx_admin_routing_add` | Add routing rule |
| 31 | `tarx_admin_routing_list` | List routing rules |
| 32 | `tarx_admin_model_usage` | Model usage stats |
| 33 | `tarx_admin_model_test` | Test model API |

### Status Report (1)
| # | Tool Name | Description |
|---|-----------|-------------|
| 34 | `tarx_orchestrate_status_report` | Full status report |

---

## Server 5: tarx-ui (tarx-ui-mcp-server) — 9 tools

| # | Tool Name | Description |
|---|-----------|-------------|
| 1 | `tarx_ui_get_status` | Get app status |
| 2 | `tarx_ui_send_chat` | Send chat message |
| 3 | `tarx_ui_read_chat` | Read chat messages |
| 4 | `tarx_ui_capture_error` | Capture UI errors |
| 5 | `tarx_ui_start_voice` | Start voice input |
| 6 | `tarx_ui_create_conversation` | Create conversation |
| 7 | `tarx_ui_select_project` | Select project |
| 8 | `tarx_ui_screenshot` | Take screenshot |
| 9 | `tarx_ui_server_status` | Server status |

---

## Duplicates & Overlaps

### 1. Memory Session Tools (EXACT DUPLICATES)
Tools duplicated between `tarx-mcp-server` and `tarx-claude-memory`:
- `memory_create_session` — exists in BOTH
- `memory_thread_to_session` — exists in BOTH
- `memory_get_session` — exists in BOTH
- `memory_list_sessions` — only in tarx-mcp-server

### 2. Session/Task Management (SEMANTIC DUPLICATES)
Both `tarx-admin` and `tarx-orchestration` manage sessions and tasks with different schemas:
- Admin: `tarx_admin_session_create` vs Orchestration: `tarx_orchestrate_register_session`
- Admin: `tarx_admin_session_assign_task` vs Orchestration: `tarx_orchestrate_assign_task`
- Admin: `tarx_admin_session_mark_complete` vs Orchestration: `tarx_orchestrate_task_update`
- Admin: `tarx_admin_session_list_all` vs Orchestration: `tarx_orchestrate_list_sessions`
- Admin: `tarx_admin_milestone_track` vs Orchestration: `tarx_orchestrate_milestone_create/update/list`
- Admin: `tarx_admin_dashboard` vs Orchestration: `tarx_orchestrate_status_report`
- Admin: `tarx_admin_session_log` vs Orchestration: `tarx_orchestrate_session_activity`

### 3. UI Tools (SEMANTIC DUPLICATES)
Sidebar/UI tools exist in BOTH `tarx-mcp-server` and `tarx-ui-mcp-server`:
- `tarx_ui_status` vs `tarx_ui_get_status`
- `tarx_ui_chat_send` vs `tarx_ui_send_chat`
- `tarx_ui_chat_read` vs `tarx_ui_read_chat`
- `tarx_ui_error` vs `tarx_ui_capture_error`
- `tarx_ui_voice_start` vs `tarx_ui_start_voice`

---

## Consolidation Plan

### Target: 3 servers, ~60 tools

**SERVER 1: tarx-core** (merge tarx-mcp-server + tarx-claude-memory)
- All Core tools (health, chat, stress_test, reason_stream, prewarm, cancel, list_active)
- Spaces/Sessions/Chat tools
- Memory tools (from tarx-claude-memory: store, search, recall, list, forget, stats)
- Memory session sync tools (deduplicated: create_session, thread_to_session, get_session, list_sessions)
- Thread message tool
- Files/RAG tools
- Sidebar control tools
- 2 NEW smart endpoints: tarx_system_brief, tarx_project_context
- DROP: voice tools (9), UI bridge tools (7), embed, mesh_status → ~35 tools

**SERVER 2: tarx-ops** (merge tarx-admin + tarx-orchestration)
- Sentry tools (7, from admin)
- Claude Code session tools (6, from admin)
- Console tools (3, from admin)
- Session orchestration (unified, from orchestration): register, state, activity, list, pause
- Task management (unified): assign, update, list
- Milestone management (unified): create, update, list
- File coordination (3, from admin)
- Handoffs (4, from admin)
- Context sync (4, from orchestration)
- Feedback (4, from orchestration)
- Documentation mgmt (5, from orchestration)
- Model management (8, from orchestration)
- Status/Dashboard (unified): dashboard + status_report merged
- Admin status (1)
- DROP: duplicate session/task tools → ~55 tools

**SERVER 3: tarx-ui** — UNCHANGED (9 tools)

### Deferred / Removed
- Voice tools (9): move to dedicated `tarx-voice` server later if needed
- UI bridge in tarx-mcp-server (7): removed, tarx-ui-mcp-server covers this
- `tarx_embed` / `tarx_mesh_status` / `tarx_db_stats`: fold into tarx_system_brief

---

## Completion Status (Session: cc-mcp-consolidate)

### Task 1: Tool Audit — DONE
- Catalogued 131 tools across 5 servers (above)
- Identified exact duplicates, semantic duplicates, and consolidation targets

### Task 2: tarx-core Server — DONE
- Created `extensions/tarx-core/` with 35 tools merged from tarx-mcp-server (50) + tarx-claude-memory (10)
- Modules: `server.ts`, `database.ts`, `memory-database.ts`, `router.ts`, `network-model.ts`
- Added 2 smart endpoints: `tarx_system_brief`, `tarx_project_context`
- Dropped: voice tools (9), UI bridge tools (7), tarx_embed, tarx_mesh_status, tarx_db_stats
- Builds clean with `tsc`, starts and registers all 35 tools

### Task 3: Admin Security — DONE
- Added `creator_only` middleware to `extensions/tarx-admin-mcp-server/src/server.ts`
- All admin tools gated on `TARX_CREATOR_KEY` env var
- Audit logging to `~/Library/Application Support/tarx/audit.jsonl` (every MCP call)
- Uses proxy pattern on `server.tool()` to transparently wrap all handlers
- Builds clean with esbuild, tested both auth modes

### Remaining (Not in scope for this session)
- tarx-ops merge (tarx-admin + tarx-orchestration) — planned but not requested
- Sentry read-only token scoping — external action for John
- Retiring old servers (tarx-mcp-server, tarx-claude-memory) — after tarx-core is validated
