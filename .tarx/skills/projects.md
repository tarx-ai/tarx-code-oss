---
name: tarx-projects
description: "Manage spaces, sessions, tasks, and project organization"
route: local
tools:
  - tarx_list_spaces
  - tarx_create_space
  - tarx_get_space
  - tarx_list_sessions
  - tarx_create_session
  - tarx_project_context
tier: free
---

# Project Management

## When to Use
- User asks about their projects, spaces, or sessions
- User wants to create/organize work
- User says "new project", "show my spaces", "what am I working on"
- User needs project status overview

## Instructions
1. For status: `tarx_project_context` (single call, full view)
2. For listing: `tarx_list_spaces` then show with emoji + description
3. For creation: `tarx_create_space` with meaningful name/emoji
4. For deep dive: `tarx_list_sessions` on specific space
5. Thread significant work to sessions: `memory_thread_to_session`
