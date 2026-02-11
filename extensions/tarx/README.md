# TARX

AI-powered coding assistant running locally on your machine via TARX Desktop.

## Features

- **Local-first AI** - Runs entirely on your machine via TARX Desktop
- **Natural chat** - Conversational interface for coding tasks
- **Private by default** - Your code never leaves your computer
- **Fast inference** - GPU-accelerated with TX-16G or TX-8G models
- **Project context** - Understands your codebase structure
- **Voice input** - Speak your coding requests (optional)

## Requirements

- TARX Desktop installed and running
- VS Code or Code-OSS 1.85+
- macOS with Apple Silicon (M1/M2/M3) recommended

## Installation

1. Install TARX Desktop from https://tarx.ai
2. Start TARX Desktop (ensures llama-server is running)
3. Install this extension
4. Click the TARX icon in the sidebar
5. Start coding with AI assistance!

## Usage

### Chat Interface

Open the TARX panel (Cmd+Shift+T) and chat naturally:

- "Create a React component for user login"
- "Fix the bug in this function"
- "Add error handling to this code"
- "Explain what this regex does"

### Code Actions

Select code in the editor, then:

- **Right-click** → TARX submenu
- Or use keyboard shortcuts:
  - `Cmd+K Cmd+E` - Explain selection
  - `Cmd+K Cmd+R` - Refactor selection
  - `Cmd+K Cmd+F` - Fix code
  - `Cmd+K Cmd+T` - Generate tests

### Project Context

Initialize a project to give TARX context about your codebase:

1. Open your project folder
2. Click "Initialize Project" in the TARX sidebar
3. TARX will index your files for better responses

## Settings

Open VS Code Settings (Cmd+,) → Search "TARX":

| Setting | Default | Description |
|---------|---------|-------------|
| `tarx.serverUrl` | `http://localhost:11435` | TARX llama-server URL |
| `tarx.model` | `local` | Model to use (auto-detected) |
| `tarx.completions.enabled` | `true` | Enable inline completions |
| `tarx.voiceEnabled` | `true` | Enable voice input |

## Troubleshooting

### Extension not connecting?

1. Check TARX Desktop is running (look for menu bar icon)
2. Verify llama-server is active:
   ```bash
   curl http://localhost:11435/health
   ```
3. Restart VS Code
4. Check Output panel (View → Output → TARX)

### Slow responses?

- Use TX-8G model (faster, less memory)
- Close other GPU-intensive applications
- Reduce `max_tokens` in your prompts

### No completions appearing?

- Ensure `tarx.completions.enabled` is `true`
- Check that TARX Desktop is running
- Try restarting the extension

## Architecture

```
VS Code ←→ TARX Extension ←→ TARX Desktop ←→ llama-server
                                    ↓
                              Local GPU (Metal)
```

All inference happens locally. No cloud API calls.

## Support

- Documentation: https://docs.tarx.ai
- Issues: https://github.com/tarx-ai/tarx-code/issues
- Discord: https://discord.gg/tarx

## License

MIT License - See LICENSE file

---

Built with privacy in mind. Your code stays on your machine.
