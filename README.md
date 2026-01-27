# TARX CODE

**Private, local-first AI coding assistant. Access supercomputer when needed.**

## What is TARX CODE?

VS Code fork with built-in AI assistant powered by local llama-server.
- Private - Your code never leaves your machine
- Fast - Local inference, no API calls
- Smart - @tarx participant for code help

## Quick Start
```bash
# Install dependencies
npm install

# Run development mode
./scripts/code.sh

# Use @tarx in Chat panel
Open Chat -> Type: @tarx hello
```

## Features

### Core TARX Extension
- **@tarx Chat Participant** - Ask questions, explain code, refactor
- **Vague Request Detection** - Asks for clarification instead of guessing
- **Problem Spotting** - Detects security issues, bugs, anti-patterns
- **Voice Normalization** - Handles transcription errors
- **Conversation History** - Persists across sessions

### TARX Sidebar
- **Quick Chat Input** - Send messages directly from sidebar
- **Voice Button** - One-click voice input
- **Quick Actions** - Explain, Fix, Test buttons
- **History Section** - Time-grouped conversation history

### Local LLM (tarx-local)
- Runs llama-server with local model
- No internet required
- Complete privacy

### SuperComputer Mesh (tarx-supercomputer)
- P2P mesh network for distributed compute
- Share resources with other users
- Automatic peer discovery

## Build
```bash
# Compile
npm run compile

# Run tests
node cli/out/cli/tarx-dev.js test

# Package for macOS
npm run gulp vscode-darwin-arm64

# Package for Windows
npm run gulp vscode-win32-x64

# Package for Linux
npm run gulp vscode-linux-x64
```

## Install Extensions in VS Code
```bash
code --install-extension dist/tarx-0.1.0.vsix
code --install-extension dist/tarx-local-1.0.0.vsix
code --install-extension dist/tarx-supercomputer-1.0.0.vsix
```

## Requirements

- Node.js 18+
- llama-server running on localhost:11435
- macOS, Windows, or Linux

## Architecture

```
tarx-code-oss/
├── extensions/
│   ├── tarx/                    # Core extension
│   ├── tarx-local/              # Local LLM
│   └── tarx-supercomputer/      # Mesh network
├── src/vs/workbench/browser/parts/
│   └── tarxsidebar/             # TARX sidebar UI
├── cli/                         # tarx-dev CLI
└── dist/                        # .vsix packages
```

## v1.0.0-beta.1 - January 2026

Built by TARX AI - Local. Private. Proactive.
