# TARX Extension

Built-in AI coding assistant for TARX CODE.

## Features

- **@tarx participant** - Chat with AI in VS Code Chat panel
- **Local inference** - Connects to localhost:11435 (llama-server)
- **Code actions** - Explain, refactor, add tests (coming soon)

## Usage

1. Open Chat panel (View → Chat)
2. Type: `@tarx <your question>`
3. Get AI response from local model

## Configuration

Extension automatically connects to:
- llama-server: `http://localhost:11435`
- Model: TX-16G or TX-8G (auto-detected)

## Development
```bash
# Build extension
npm run compile

# Watch mode
npm run watch
```

## Files

- `extension.ts` - Main extension entry, registers @tarx
- `tarxClient.ts` - HTTP client for llama-server
- `completionProvider.ts` - Inline completions (future)
- `statusBar.ts` - Status indicator
