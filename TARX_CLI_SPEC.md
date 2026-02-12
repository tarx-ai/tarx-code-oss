# TARX CLI Specification

## Overview

TARX CLI is a command-line interface for the TARX local AI system. It provides:
- Interactive REPL mode (default)
- One-shot query mode
- Direct MCP tool access
- Health monitoring
- Project/space management

## Installation

\`\`\`bash
# From npm (future)
npm install -g @tarx/cli

# From source
cd extensions/tarx-cli
npm install && npm link
\`\`\`

## Command Structure

### Basic Usage

\`\`\`bash
tarx                        # Interactive REPL
tarx "your question"        # One-shot query, streams response
tarx -p "query"             # Print mode (non-interactive, for pipes)
tarx --health               # Quick health check
tarx --status               # Full system status
\`\`\`

### Global Options

| Option | Description |
|--------|-------------|
| \`-h, --help\` | Show help |
| \`-v, --version\` | Show version |
| \`-p, --print\` | Print response and exit (pipe-friendly) |
| \`--no-stream\` | Wait for complete response (no streaming) |
| \`--model <model>\` | Override model (local, claude) |
| \`--max-tokens <n>\` | Max response tokens |
| \`--debug\` | Enable debug output |
| \`--json\` | Output as JSON |

### Health & Status

\`\`\`bash
tarx --health               # Quick: inference/embeddings/mesh status
tarx --status               # Full: health + memory stats + errors
tarx doctor                 # Diagnose issues, suggest fixes
\`\`\`

### Chat Commands

\`\`\`bash
tarx chat                   # Start interactive chat session
tarx chat -c                # Continue last conversation
tarx chat -r <session-id>   # Resume specific session
tarx chat --list            # List recent sessions
\`\`\`

### Project/Space Commands

\`\`\`bash
tarx project list           # List all projects/spaces
tarx project create <name>  # Create new space
tarx project use <id>       # Set active project context
tarx project info [id]      # Show project details
tarx project delete <id>    # Delete a project
\`\`\`

### File Commands

\`\`\`bash
tarx file upload <path>     # Upload and index file for RAG
tarx file list              # List indexed files
tarx file search <query>    # Semantic search
tarx file delete <id>       # Remove file from index
\`\`\`

### RAG Commands

\`\`\`bash
tarx rag index <path>       # Index file or directory
tarx rag search <query>     # Search knowledge base
tarx rag stats              # Show embedding stats
tarx rag clear              # Clear RAG index
\`\`\`

### Memory Commands

\`\`\`bash
tarx memory list            # List recent memories
tarx memory add <text>      # Store a memory
tarx memory search <query>  # Search memories
tarx memory clear           # Clear all memories
\`\`\`

### MCP Commands

\`\`\`bash
tarx mcp tools              # List all MCP tools (260)
tarx mcp call <tool> [args] # Call MCP tool directly
tarx mcp servers            # List MCP servers
\`\`\`

### Model Commands

\`\`\`bash
tarx model info             # Current model details
tarx model list             # Available models
tarx model use <name>       # Switch model
\`\`\`

### Mesh Commands

\`\`\`bash
tarx mesh status            # Mesh network status
tarx mesh peers             # List connected peers
tarx mesh join              # Join mesh network
\`\`\`

## Interactive Mode (REPL)

### Default Behavior

When run without arguments, TARX enters interactive mode:

\`\`\`
$ tarx
TARX v1.1.0 — Local AI · Port 11435 · Ready
Type /help for commands, Ctrl+D to exit

> What's the project structure?
[Streaming response...]

> /status
Inference: ✓ 11435 | Embeddings: ✓ 11437 | Mesh: ✓ 11436
Memories: 184 | Sessions: 293 | Messages: 831

> /project use abc123
Active project: My App

>
\`\`\`

### Slash Commands

| Command | Description |
|---------|-------------|
| \`/help\` | Show available commands |
| \`/status\` | Quick system status |
| \`/health\` | Detailed health check |
| \`/project [id]\` | Switch project context |
| \`/clear\` | Clear screen |
| \`/history\` | Show conversation history |
| \`/memory <text>\` | Store a memory |
| \`/recall <topic>\` | Recall relevant memories |
| \`/tools\` | List MCP tools |
| \`/exit\` | Exit TARX |

### File References

Use \`@\` to reference files:

\`\`\`
> Explain @src/main.ts
[Reads file, includes in context, explains]

> Fix the bug in @api/auth.ts
[Reads file, suggests fix]
\`\`\`

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| \`Ctrl+C\` | Cancel current operation |
| \`Ctrl+D\` | Exit TARX |
| \`Up/Down\` | Navigate history |
| \`Tab\` | Autocomplete commands |

## Architecture

\`\`\`
extensions/tarx-cli/
├── bin/
│   └── tarx                    # Entry point (#!/usr/bin/env node)
├── src/
│   ├── cli.ts                  # Main CLI, arg parsing
│   ├── repl.ts                 # Interactive mode
│   ├── commands/
│   │   ├── index.ts            # Command registry
│   │   ├── chat.ts             # Chat commands
│   │   ├── project.ts          # Project/space commands
│   │   ├── file.ts             # File commands
│   │   ├── rag.ts              # RAG commands
│   │   ├── memory.ts           # Memory commands
│   │   ├── mcp.ts              # MCP tool commands
│   │   ├── model.ts            # Model commands
│   │   ├── mesh.ts             # Mesh commands
│   │   └── doctor.ts           # Diagnostics
│   ├── services/
│   │   ├── inference.ts        # llama-server client (11435)
│   │   ├── embeddings.ts       # Embedding client (11437)
│   │   ├── mcp.ts              # MCP tool caller
│   │   └── health.ts           # Health checker
│   ├── utils/
│   │   ├── streaming.ts        # Token streaming renderer
│   │   ├── spinner.ts          # Loading indicators
│   │   ├── colors.ts           # Terminal colors
│   │   └── config.ts           # User config
│   └── types.ts                # TypeScript types
├── package.json
├── tsconfig.json
└── README.md
\`\`\`

## Configuration

Config file: \`~/.tarx/config.json\`

\`\`\`json
{
  "defaultModel": "local",
  "maxTokens": 2000,
  "streamOutput": true,
  "ports": {
    "inference": 11435,
    "embeddings": 11437,
    "mesh": 11436
  },
  "theme": "cyberpunk"
}
\`\`\`

## API Endpoints

### Inference (11435)
- \`POST /v1/chat/completions\` — Chat completion
- \`GET /v1/models\` — List models
- \`GET /health\` — Health check

### Embeddings (11437)
- \`POST /v1/embeddings\` — Generate embeddings
- \`GET /health\` — Health check

### Mesh (11436)
- \`GET /health\` — Mesh status
- \`GET /peers\` — Connected peers

## Examples

### One-shot code generation
\`\`\`bash
tarx "Write a Python function to validate email addresses" | pbcopy
\`\`\`

### Pipe file for review
\`\`\`bash
cat src/auth.ts | tarx -p "Review this code for security issues"
\`\`\`

### Index entire codebase
\`\`\`bash
tarx rag index ./src --depth 5
\`\`\`

### Search and explain
\`\`\`bash
tarx "How does authentication work?" --rag
\`\`\`

### Health monitoring in scripts
\`\`\`bash
if tarx --health --json | jq -e '.inference.healthy'; then
  echo "TARX is ready"
fi
\`\`\`

## Future Enhancements

1. **Claude Code interop** — \`tarx cc <command>\` to dispatch to Claude Code
2. **Agent mode** — \`tarx agent <task>\` for autonomous multi-step execution
3. **Voice mode** — \`tarx voice\` for speech input
4. **Watch mode** — \`tarx watch <glob>\` to auto-respond to file changes
5. **Plugin system** — Custom commands via \`~/.tarx/plugins/\`

---
*Spec version 1.0, Feb 12, 2026*
