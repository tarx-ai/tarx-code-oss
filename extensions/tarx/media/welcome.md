# TARX Workbench

Local. Private. Proactive.

---

## What TARX Does

TARX runs entirely on your hardware. No cloud dependencies. No data collection. No subscription fees.

- **GPU-accelerated inference** using llama.cpp
- **RAG-powered context** that understands your codebase
- **Voice input** for hands-free interaction
- **Native VS Code integration** through the Chat panel

Everything stays on your machine.

---

## Quick Start

### 1. Open Chat

Press `Cmd+Shift+T` (Mac) or `Ctrl+Shift+T` (Windows/Linux) to open TARX Chat.

Or click the chat icon in the Activity Bar.

### 2. Ask TARX

Type `@tarx` followed by your question:

```
@tarx explain this function
@tarx refactor for readability
@tarx write tests for this code
@tarx fix the bug here
```

### 3. Use Context

Select code in your editor. TARX sees what you've selected.

Right-click for quick actions: Explain, Refactor, Fix, Generate Tests.

---

## Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Open Chat | `Cmd+Shift+T` | `Ctrl+Shift+T` |
| Explain Selection | `Cmd+K Cmd+E` | `Ctrl+K Ctrl+E` |
| Refactor Selection | `Cmd+K Cmd+R` | `Ctrl+K Ctrl+R` |
| Fix Code | `Cmd+K Cmd+F` | `Ctrl+K Ctrl+F` |
| Generate Tests | `Cmd+K Cmd+T` | `Ctrl+K Ctrl+T` |

---

## How TARX Works

**Local Inference Engine**
TARX uses llama-server running on your GPU. The model runs locally. Your prompts never leave your machine.

**RAG System**
TARX indexes your project with nomic-embed. When you ask a question, it retrieves relevant code and documentation to provide accurate answers.

**Voice Input**
TARX Voice uses Moshi for real-time speech recognition. Audio processing happens locally. No cloud transcription.

---

## Connection Status

Check the TARX sidebar for connection status:

- **Green dot** — Connected and ready
- **Yellow dot** — Connecting or reconnecting
- **No dot** — Offline

If TARX shows offline, ensure llama-server is running on port 11435.

---

## Privacy

TARX was built with one principle: your data belongs to you.

- No telemetry phones home
- No model training on your code
- No cloud API calls
- No account required

The code is open source. Verify it yourself.

---

## Getting Help

**Command Palette**
Press `Cmd+Shift+P` and type "TARX" to see all available commands.

**Connection Issues**
Run "TARX: Show Connection Status" from the Command Palette to diagnose.

**Documentation**
Visit [tarx.com/docs](https://tarx.com/docs) for detailed guides.

---

## What TARX Is Not

TARX is not a ChatGPT wrapper. It doesn't send your code to external servers. It doesn't require an internet connection after initial setup. It doesn't collect usage data.

TARX is a tool that runs on your machine, for your benefit, under your control.

---

*TARX — Designed in Austin, Texas*
