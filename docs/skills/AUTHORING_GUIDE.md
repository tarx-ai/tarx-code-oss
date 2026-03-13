# Creating TARX Skills

Build custom skills that teach TARX new capabilities.

## Quick Start
1. Command palette: Ctrl+Shift+P → "TARX: New Skill File"
2. Name your skill
3. Edit the .tarx/skills/your-skill.md
4. TARX picks it up immediately

## Skill Format
Markdown with YAML frontmatter:
- name (required): unique identifier
- description (required): what this skill does
- route: local/mesh/cloud/auto (default: local)
- tools: list of MCP tool names this skill needs
- tier: free/pro/enterprise (default: free)

Body sections:
- "When to Use" (required): trigger conditions
- "Instructions" (required): step-by-step for TARX
- "Examples" (recommended): input/output pairs
- "Constraints" (optional): limits and rules

## Available Tools (54 total)
Inference: tarx_chat, tarx_reason_stream
Memory: memory_store, memory_search, memory_recall, memory_list
Knowledge: tarx_search_knowledge, tarx_upload_file
Projects: tarx_list_spaces, tarx_create_space, tarx_project_context
System: tarx_health, tarx_system_brief
Debug: Datadog MCP, tarx_admin_read_console (Pro tier)
