---
name: tarx-code-gen
description: "Generate code using local LLM with project context"
route: local
tools:
  - tarx_chat
  - tarx_search_knowledge
tier: free
---

# Code Generation

## When to Use
- User asks to write, generate, or create code
- User describes functionality they need implemented
- User references files in their project needing new code

## Instructions
1. Scan open files and workspace context for language, framework, style
2. Route to local Qwen 8.2B (port 11435) for generation
3. If project has RAG knowledge base, search for relevant patterns first
4. Generate code following project conventions
5. Present with inline diff if modifying existing file

## Routing
Always LOCAL first. Only escalate to MESH/CLOUD if:
- Response quality score < 0.6 (self-eval)
- Token count exceeds local context (4096)
- User explicitly requests cloud-grade output
