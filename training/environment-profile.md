# TARX Environment Profile

Generated: 2026-02-12

## Identity

- **Name:** TARX Workbench
- **Version:** 1.96.0
- **Base:** VS Code (code-oss) fork
- **License:** MIT
- **Description:** Local. Private. Proactive.
- **Bundle ID:** com.tarx.code

## Port Architecture

| Port | Service | Purpose |
|------|---------|---------|
| 11435 | llama-server | Local LLM inference (OpenAI-compatible /v1/chat/completions) |
| 11436 | Mesh HTTP API | P2P networking via libp2p (peer discovery, distributed compute) |
| 11437 | Embedding server | RAG embeddings via nomic-embed-text-v1.5 (768 dimensions) |
| 11438 | Voice pipeline | Voice synthesis and transcription coordinator (if enabled) |
| 11439 | UI test harness | Dev/QA only - VS Code UI automation |

## Current Model

- **Model:** tarx-qwen2.5-7b-deep-Q4_K_M.gguf
- **Parameters:** 7.6B (7,615,616,512)
- **Quantization:** Q4_K_M (4-bit)
- **Size:** 4.68 GB
- **Context Window:** 32,768 tokens (configured: 4,096 for speed)
- **Embedding Dimensions:** 768 (nomic-embed-text-v1.5)
- **Vocab Size:** 152,064

## Data Storage

| Location | Purpose |
|----------|---------|
| `~/Library/Application Support/tarx/` | Main data (SQLite databases, config) |
| `~/Library/Application Support/tarx/data.db` | Spaces, sessions, messages, files, embeddings |
| `~/Library/Application Support/tarx/memory.db` | Persistent memories |
| `~/Library/Application Support/tarx/console.log` | Extension console logs |
| `~/Library/Application Support/tarx/audit.jsonl` | Admin tool audit trail |
| `~/.tarx-code/` | VS Code data folder |
| `~/.ollama/models/blobs/` | Model files |
| `~/Library/Logs/TARX/` | Application logs |

## MCP Servers

| Server | Tools | Purpose |
|--------|-------|---------|
| tarx-core | 21 | Core AI: chat, spaces, sessions, memory, files, RAG |
| tarx-ops | 50 | Operations: Sentry, Claude Code orchestration, daemon |
| tarx-ui | 177 | UI automation (dev/QA only) |

**Total:** 248 tools

## Mesh Network

- **Protocol:** libp2p
- **Discovery:** mDNS (local), Kademlia DHT (global)
- **Purpose:** Distributed inference, peer compute sharing
- **Default:** Off (opt-in)
- **Current Status:** Not running (solo mode)
- **Local Peer ID:** 12D3KooWE1ksNPUFSzKab22LrTGTk3q568B5eXTBwFj1ciyRX1gh

## Local Capabilities

- **RAM:** 32 GB
- **GPU:** Yes (12 GB VRAM)
- **CPU Cores:** 10
- **Available for inference:** Yes (local only)

## Configuration Defaults

```json
{
  "tarx.thinking.enabled": true,
  "tarx.thinking.autoCollapse": false,
  "tarx.routing.default": "local",
  "tarx.health.pollInterval": 30000,
  "tarx.skills.locations": [".tarx/skills", ".github/skills"],
  "tarx.memory.autoRecall": true,
  "tarx.memory.maxRecall": 5,
  "telemetry.telemetryLevel": "off",
  "workbench.colorTheme": "TARX Dark"
}
```

## Performance Characteristics

- **Inference Speed:** ~18-30 tok/s (M4), ~8-15 tok/s (M1)
- **Embedding Generation:** ~50ms per chunk
- **RAG Chunk Size:** 512 chars, 128 overlap
- **Memory Usage:** ~5-6 GB GPU + ~500 MB CPU

## Network Behavior

- **Default:** Fully local, no external connections
- **Optional:** Claude API routing for complex queries (requires API key)
- **Sentry:** Error reporting (can be disabled)
- **Mesh:** Opt-in P2P for distributed compute

## Privacy Guarantees

- All inference runs locally (llama-server)
- All data stored locally (SQLite)
- No telemetry by default
- Mesh shares compute, not data
- User controls all network features
