# TARX Skills Index

## Core Skills (Ship with Workbench)

| Skill | File | Tools | Tier | Route |
|-------|------|-------|------|-------|
| Code Generation | [code-gen.md](code-gen.md) | tarx_chat, tarx_search_knowledge | free | local |
| Memory & Context | [memory.md](memory.md) | memory_store, memory_search, memory_recall, memory_list | free | local |
| Debug & Diagnostics | [debug.md](debug.md) | tarx_health, Datadog MCP | pro | local |
| Knowledge Base | [knowledge.md](knowledge.md) | tarx_search_knowledge, tarx_upload_file, tarx_list_files | free | local |
| Project Management | [projects.md](projects.md) | tarx_list_spaces, tarx_create_space, tarx_project_context | free | local |
| Code Review | [code-review.md](code-review.md) | tarx_chat, tarx_search_knowledge | free | local |
| Commit Message | [commit-message.md](commit-message.md) | tarx_chat | free | local |
| Explain Code | [explain-code.md](explain-code.md) | tarx_chat, tarx_search_knowledge | free | local |

## Agents

| Agent | File | Skills | Mode |
|-------|------|--------|------|
| Local Dev | [local-dev.agent.md](../agents/local-dev.agent.md) | code-gen, memory, debug, knowledge | local |
| Orchestrator | [orchestrator.agent.md](../agents/orchestrator.agent.md) | projects, memory | background |
| Mesh Query | [mesh-query.agent.md](../agents/mesh-query.agent.md) | code-gen, memory | cloud |

## Creating Custom Skills

Place `.md` files in `.tarx/skills/` with YAML frontmatter:

```yaml
---
name: my-skill
description: "What this skill does"
route: local | mesh | cloud | auto
tools:
  - tool_name_1
  - tool_name_2
tier: free | pro | enterprise
---
```

See existing skills for examples.
