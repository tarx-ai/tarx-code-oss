# TARX Memory - Claude Extension

Persistent local memory for Claude Desktop. Never lose context again.

## Features

- **Local Storage**: All data stays on your machine in `~/Library/Application Support/tarx/`
- **Semantic Search**: Find relevant memories based on meaning, not just keywords
- **Chat Threading**: All Claude conversations are threaded into TARX chat history
- **Cross-Session**: Memories persist across Claude sessions

## Installation

### Quick Install (Claude Code)

```bash
claude mcp add tarx-memory npx tarx-claude-memory
```

### Manual Install (Claude Desktop)

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tarx-memory": {
      "command": "node",
      "args": ["/path/to/tarx-code-oss/extensions/tarx-claude-memory/dist/server.js"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `memory_store` | Save information for future recall |
| `memory_search` | Search memories by topic/keywords |
| `memory_recall` | Load relevant context for current topic |
| `memory_list` | List all stored memories |
| `memory_forget` | Delete a specific memory |
| `memory_stats` | View memory usage statistics |
| `thread_message` | Thread conversation into TARX history |

## Usage Examples

### Store a memory
```
"Remember that I prefer TypeScript over JavaScript"
→ Claude calls memory_store
```

### Recall context
```
"What do you remember about my coding preferences?"
→ Claude calls memory_recall with topic="coding preferences"
```

### Search memories
```
"Search my memories for anything about authentication"
→ Claude calls memory_search with query="authentication"
```

## Storage

Data is stored in SQLite at:
```
~/Library/Application Support/tarx/memory.db
```

Tables:
- `memories` - Semantic memory storage
- `messages` - Conversation history (threaded)
- `sessions` - Conversation sessions
- `spaces` - Conversation namespaces

## Development

```bash
cd extensions/tarx-claude-memory
npm install
npm run build
npm start
```

## License

MIT - TARX Project
