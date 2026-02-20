# TARX System Memory
Last updated: 2026-02-20T12:00:00Z

## Services
- Inference: port 11435, model tarx-qwen2.5-7b-deep-Q4_K_M.gguf (4.68GB), status unknown
- Mesh: port 11436, peers 0, status unknown
- Embeddings: port 11437, model nomic-embed-text-v1.5 (768-dim), status unknown

## MCP Servers
- tarx-core: 30 tools, status ok (v1.2.0)
- tarx-ops: 55 tools, status ok (v1.2.0)
- tarx-ui: 177 tools, status ok (v2.0.0)
- tarx-mesh: 9 tools, status ok (standalone ~/Desktop/tarx-mesh/mcp/)
- tarx-verify: 24 tools, status ok (standalone ~/Desktop/tarx-verify/)
- tarx-martech: 18 tools, status ok (standalone ~/Desktop/tarx-martech/)
Total: 313 tools (262 in-repo + 51 standalone)

## Known Issues
- tarx-observer-mcp-server: DELETED (commit 0a85116). 8 tools retired. All doc references cleaned up (2026-02-20)
- @sentry/browser: NEVER import in renderer — bare specifiers fail in ESM. Use globalThis.Sentry stubs (2026-02-20)
- Embedding server: llama-server (NOT Ollama) — auto-managed as sidecar by tarxEmbeddingSidecarService.ts (2026-02-20)

## Architecture Decisions
- Conversational-first UX: @tarx chat participant is primary surface, webviews are last resort (2026-02-20)
- Upstream-first UI: use VS Code APIs before building custom components (2026-02-20)
- MCP consolidation complete: 5 servers, zero name collisions (2026-02-20)
- Sentry: @sentry/node in main+exthost, no-op stubs in renderer (2026-02-20)
- Persistence: SQLite via tarx-core MCP is database of record (2026-02-20)
- Agent Hub: conversational-only via @tarx participant, JSON defs in .tarx/agents/*.json, no webview (2026-02-20)
- Project context: read from .tarx/context.md (preferred) or .tarx/instructions.md (fallback) (2026-02-20)
- FTUX handoff: tarx.chat.send → workbench.action.chat.open with @tarx prefix (2026-02-20)

## Build Pipeline Reminder
1. Webview bundle FIRST: `cd extensions/tarx && node esbuild.webview.js --production`
2. Inline: `node build/lib/tarx-webview-inline.js`
3. Compile: `yarn compile`
BLACK SCREEN = missing webview bundle. Always run step 1 if sidebar changed.
