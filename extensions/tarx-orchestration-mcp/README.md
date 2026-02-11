# TARX Orchestration MCP Server v2.0

Model Context Protocol server for orchestrating multiple Claude Code sessions from Claude.ai.

## Purpose

This MCP server enables Claude.ai to:
- Monitor and coordinate multiple concurrent Claude Code sessions
- Manage documentation across sessions
- Track tasks and milestones
- Synchronize context between sessions
- Handle feedback requests
- Route queries to external AI models

## Installation

```bash
npm install
npm run build
```

## Configuration

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tarx-orchestration": {
      "command": "node",
      "args": ["/path/to/tarx-orchestration-mcp/dist/server.js"]
    }
  }
}
```

## Tools (34 total)

### Session Monitoring (6)
- `tarx_admin_register_session` - Register a new Claude Code session
- `tarx_admin_session_state` - Get detailed session state
- `tarx_admin_report_activity` - Report session activity
- `tarx_admin_session_activity` - Get session activity history
- `tarx_admin_list_sessions` - List all sessions with filtering
- `tarx_admin_session_pause` - Pause or resume a session

### Documentation Management (5)
- `tarx_admin_read_file` - Read file contents
- `tarx_admin_update_file` - Update file (overwrite/append/prepend)
- `tarx_admin_create_doc` - Create managed documentation
- `tarx_admin_list_docs` - List managed documents
- `tarx_admin_doc_history` - Get document update history

### Task & Milestone Management (6)
- `tarx_admin_assign_task` - Assign task to session
- `tarx_admin_task_update` - Update task status
- `tarx_admin_task_list` - List tasks with filtering
- `tarx_admin_milestone_create` - Create a milestone
- `tarx_admin_milestone_update` - Update milestone progress
- `tarx_admin_milestone_list` - List all milestones

### Context Synchronization (4)
- `tarx_admin_push_context` - Push update to specific session
- `tarx_admin_broadcast` - Broadcast to all sessions
- `tarx_admin_get_updates` - Get pending updates for session
- `tarx_admin_mark_delivered` - Mark updates as delivered

### Feedback & Input (4)
- `tarx_admin_request_feedback` - Request user feedback
- `tarx_admin_provide_feedback` - Provide feedback response
- `tarx_admin_check_feedback` - Check specific feedback status
- `tarx_admin_list_feedback_requests` - List pending feedback

### Model Management (8)
- `tarx_admin_model_add` - Add external AI model
- `tarx_admin_model_list` - List configured models
- `tarx_admin_model_update` - Update model configuration
- `tarx_admin_model_delete` - Delete a model
- `tarx_admin_routing_add` - Add routing rule
- `tarx_admin_routing_list` - List routing rules
- `tarx_admin_model_usage` - Get model usage statistics
- `tarx_admin_model_test` - Test model connectivity

### Status Report (1)
- `tarx_admin_status_report` - Generate comprehensive status report

## Data Storage

- **Database**: `~/.tarx/orchestration.db` (SQLite)
- **Encryption Key**: `~/.tarx/master.key` (AES-256-GCM)

### Database Schema

13 tables:
- `sessions` - Active Claude Code sessions
- `session_activity` - Activity log
- `session_files` - Files open in sessions
- `tasks` - Work items
- `milestones` - Progress milestones
- `managed_docs` - Managed documentation
- `doc_history` - Document change history
- `feedback_requests` - User feedback requests
- `context_updates` - Inter-session messages
- `external_models` - AI model configurations
- `model_api_keys` - Encrypted API keys
- `routing_rules` - Query routing rules
- `model_usage` - Usage statistics
- `blockers` - Session blockers

## Environment Variables

- `TARX_MASTER_KEY` - Master encryption key (hex string, 64 chars)

If not set, a key is generated and stored in `~/.tarx/master.key`.

## Security

- API keys are encrypted using AES-256-GCM
- Master key file has 0600 permissions
- Database uses WAL mode for concurrent access
- Foreign keys enforced for data integrity

## License

MIT
