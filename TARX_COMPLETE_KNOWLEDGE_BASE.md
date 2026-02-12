# TARX Complete Knowledge Base
**Last Updated:** February 12, 2026
**Version:** 1.1.0

This is the canonical reference for all TARX knowledge, synthesized from fine-tune audits, RAG indexing, conversation testing, and system audits.

---

## 1. Identity

### What is TARX?
TARX is a local-first AI development environment built as a VS Code fork (code-oss). It runs AI inference entirely on the user's machine — no cloud dependency, no telemetry.

### Core Identity Facts
- **Name:** TARX (not an acronym)
- **Creator:** John Wantz, Austin TX, 2026
- **Tagline:** "Local. Private. Proactive."
- **Base Model:** Qwen 2.5 7B, fine-tuned as tarx-qwen2.5-7b-deep-Q4_K_M.gguf (4.68GB)
- **Personality:** Commander Data — technically precise, genuinely curious, direct without coldness
- **NOT:** ChatGPT, Claude, or Qwen. TARX is a distinct product with its own identity.

### Identity Training Status
- **Current:** CRITICAL FAILURE — Model identifies as "Qwen by Alibaba Cloud"
- **Score:** 1/20 on identity tests
- **Required:** R3 training with 100+ identity-reinforcing examples

---

## 2. Architecture

### Services and Ports
| Port | Service | Purpose |
|------|---------|---------|
| 11435 | llama-server | Local LLM inference (~18-20 tok/s on M4 Metal) |
| 11436 | Mesh HTTP API | P2P networking via libp2p |
| 11437 | Embedding server | RAG embeddings via nomic-embed-text |

### Extension Architecture
- **7 active extensions** in extensions/ directory
- **3 MCP servers** providing 260 tools total:
  - tarx-core (46 tools): memory, spaces, sessions, RAG, chat
  - tarx-ops (47 tools): Sentry, orchestration, file locks, daemon
  - tarx-ui (167 tools): editor control, terminals, screenshots, testing

### Database
- **memory.db** — SQLite storing memories, sessions, messages, embeddings
- **Location:** ~/Library/Application Support/tarx/
- **Tables:** memories, sessions, messages, chunk_embeddings, spaces, files, etc.

### Directory Structure
```
tarx-code-oss/
├── extensions/tarx/           → Main extension (chat, sidebar, commands)
├── extensions/tarx-core/      → MCP server: memory, RAG, inference
├── extensions/tarx-ops/       → MCP server: Sentry, orchestration
├── extensions/tarx-ui-mcp-server/ → MCP server: UI automation
├── extensions/tarx-theme/     → TARX cyberpunk theme
├── src/vs/workbench/contrib/tarx/ → Core VS Code integration
```

---

## 3. Capabilities

### MCP Tools (260 total)

#### Memory Tools (tarx-core)
- `memory_store` — Store information for future recall
- `memory_search` — Search memories by query
- `memory_search_index` — Lightweight scan (~50 tokens/result)
- `memory_store_observation` — Store structured observations
- `memory_recall` — Auto-recall relevant context

#### RAG Tools (tarx-core)
- `tarx_upload_file` — Upload and embed file
- `tarx_search_knowledge` — Semantic search
- `tarx_scan_directory` — Index local folder

#### Health Tools (tarx-core)
- `tarx_health` — Quick port status
- `tarx_system_brief` — Comprehensive system status

#### Sentry Tools (tarx-ops)
- `tarx_admin_sentry_issues` — Current open issues
- `tarx_admin_sentry_events` — Recent events
- `tarx_admin_sentry_search` — Query Sentry

#### UI Tools (tarx-ui)
- `tarx_ui_editor_open_file` — Open file in editor
- `tarx_ui_terminal_send_command` — Run terminal command
- `tarx_ui_screenshot_full` — Capture app screenshot

---

## 4. Current State (V1.1)

### Ship Status
- **V1.1 shipped:** February 11, 2026
- **Critical bugs fixed:** Chat blocking, sidebar race condition
- **Active issues:** See Sentry (HostProvider, mkdir /mock)

### Health Metrics
- Inference: Healthy (11435)
- Embeddings: Healthy (11437)
- Mesh: Healthy (11436)
- Memories: 188
- Sessions: 296
- Messages: 843

### Fine-Tune Status
- **Model:** tarx-qwen2.5-7b-deep-Q4_K_M.gguf
- **Training:** R1 (300 examples, loss 2.408), R2 (502 examples, loss 1.237)
- **Issue:** Identity not retained — model identifies as Qwen
- **Next:** R3 with 500+ identity-focused examples

---

## 5. CLI Interface

### Commands (from TARX_CLI_SPEC.md)
```bash
tarx                    # Interactive REPL
tarx "question"         # One-shot query
tarx --health           # Health check
tarx --status           # Full status
tarx chat               # Chat session
tarx project list       # List spaces
tarx mcp tools          # List MCP tools
tarx rag search <query> # Search RAG
tarx memory list        # List memories
```

### CLI Architecture
- Entry: extensions/tarx-cli/bin/tarx
- Core: cli.ts (arg parsing), repl.ts (interactive mode)
- Services: inference.ts (llama-server), health.ts (port checks)

---

## 6. Known Issues

### Sentry Errors (High Volume)
| Error | Count | Severity |
|-------|-------|----------|
| HostProvider not setup | 2792 | Error |
| mkdir '/mock' denied | 766 | Error |
| Canceled operations | 365 | Error |
| Channel closed | 316 | Various |

### Architectural Issues
- Activity bar hidden (by design)
- Sentry disabled in V1 (EPIPE crash)
- Embedding pipeline may have chunking issues

---

## 7. Training Gaps

From Fine-Tune Audit (35/100 score):

| Category | Score | Gap |
|----------|-------|-----|
| Identity | 1/20 | Model doesn't know it's TARX |
| Architecture | 4/20 | Doesn't know ports, database |
| Tool Use | 2/20 | Doesn't know MCP tools |
| Proactive | 14/20 | Good |
| Edge Cases | 14/20 | Good |

### R3 Training Priorities
1. 100+ identity examples ("I am TARX")
2. 50+ negative examples ("I am NOT Qwen")
3. 80+ architecture examples (ports, database)
4. 150+ MCP tool examples

---

## 8. VS Code Integration

### APIs Used
- WebviewPanel API — sidebar, chat panels
- StatusBarItem API — connection status
- FileSystem API — file operations
- Terminal API — command execution
- Commands API — registerCommand

### Core Files
- `src/vs/workbench/contrib/chat/` — Chat UI base
- `src/vs/workbench/contrib/tarx/` — TARX-specific workbench
- `extensions/tarx/src/extension.ts` — Main extension (2000+ lines)

---

## 9. RAG Quality

### Stats
- Total chunks: 1868
- System Knowledge space: 887 embeddings, 33 files
- Quality score: 32/40 (80%)

### Best Results (>0.80 similarity)
- MCP tools queries (0.84)
- Extension inventory (0.84)
- File upload flow (0.81)

### Gaps
- V1.1 bug specifics (0.67)
- Team info (0.52)
- Security model (0.75)

---

## 10. Roadmap

### V1.2 (Next)
- [ ] R3 fine-tune with identity focus
- [ ] CLI polish and npm publish
- [ ] Fix embedding pipeline
- [ ] Theme improvements

### V1.5 (Future)
- [ ] Voice input
- [ ] Mesh distributed inference
- [ ] Agent marketplace

---

## 11. Team & Contacts

- **John Wantz** — Founder/CEO, Austin TX
- **Grey & Duke Wantz** — Co-founders (DoD applications)
- **Joe Rhoton** — CRO
- **Sentry:** tarx-fo.sentry.io

---

## 12. Design System

### Color Palette (Cyberpunk)
- Deep Space: #0a0a0f (background)
- Electric Blue: #00d4ff (primary accent)
- Cyber Pink: #ff0080 (secondary accent)
- Neon Purple: #8b5cf6 (VS Code theme compat)

### Gradients
- Primary: linear-gradient(135deg, #00d4ff, #ff0080)
- Glow: radial-gradient(circle, rgba(0,212,255,0.3), transparent)

---

## 13. MCP Tool Reference

See TARX_MCP_TOOL_INVENTORY.md for complete 260-tool listing.

Key tools by category:
- **Chat:** tarx_chat, tarx_reason_stream, tarx_prewarm
- **Memory:** memory_store, memory_search, memory_recall
- **RAG:** tarx_upload_file, tarx_search_knowledge
- **Health:** tarx_health, tarx_system_brief
- **Sentry:** tarx_admin_sentry_issues, tarx_admin_sentry_events
- **UI:** tarx_ui_editor_*, tarx_ui_terminal_*, tarx_ui_screenshot_*

---

## 14. API Reference

### Inference API (11435)
```
POST /v1/chat/completions — Chat completion
GET /v1/models — List models
GET /health — Health check
```

### Embedding API (11437)
```
POST /v1/embeddings — Generate embeddings
  Body: { input: "search_document: <text>", model: "nomic-embed" }
  Returns: { data: [{ embedding: number[] }] }
```

### Mesh API (11436)
```
GET /health — Mesh status
GET /peers — Connected peers
```

---

## 15. Error Patterns

### Common Sentry Errors
1. **HostProvider not setup** — Auth initialization order issue
2. **mkdir '/mock' denied** — Sandbox path resolution
3. **Channel closed** — Graceful shutdown artifact
4. **Canceled operations** — User-initiated cancellation

### Debug Approach
1. Check tarx_admin_sentry_issues for trends
2. Use tarx_admin_sentry_trace for session reconstruction
3. Check tarx_admin_read_console for [TARX] logs

---

*This document is the single source of truth for TARX knowledge.*
*Index this file in RAG for comprehensive system awareness.*
