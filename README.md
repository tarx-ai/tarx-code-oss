# TARX Workbench

Local-first AI workspace. Runs entirely on your machine.
VS Code fork (code-oss) with TARX inference, memory, and mesh built in.

## What this is

TARX Workbench is a forked VS Code (code-oss) distribution that ships with:
- Local LLM inference via llama-server (port 11435)
- RAG memory via nomic-embed-v1.5 (port 11437)
- Mesh compute via libp2p (port 11436, standalone binary)
- 251 MCP tools across 3 servers

It is NOT a VS Code extension. It IS a standalone desktop app.

## Repos

| Repo | Purpose | Status |
|------|---------|--------|
| tarx-code-oss (this) | TARX Workbench app | Active |
| tarx-mesh | Mesh binary (standalone) | Active |
| tarx-figma | tarx.com website | Active |
| tarx-docs | docs.tarx.com | Active |
| tarx-quantum | quantum.tarx.com | Active |
| tarx-palantir-connector | Palantir AIP integration | Active |

## Install

```bash
curl -fsSL tarx.com/install | sh
```

2.9MB daemon. Model downloads in background (~5 min).

## Ports

| Port | Service | Binary |
|------|---------|--------|
| 11435 | llama-server (inference) | bundled |
| 11436 | tarx-mesh (libp2p) | ~/Desktop/tarx-mesh/ |
| 11437 | llama-server (embeddings) | bundled |

## MCP Servers

| Server | Tools | Location |
|--------|-------|----------|
| tarx-core | 29 | extensions/tarx-core/ |
| tarx-ops | 53 | extensions/tarx-ops/ |
| tarx-ui | 172 | extensions/tarx-ui-mcp-server/ |

## Model

Fine-tuned Qwen 2.5 7B — `tarx-qwen2.5-7b-deep-Q4_K_M.gguf`
HuggingFace: tarx-ai/tarx-qwen2.5-7b-deep
Identity: responds as TARX (system prompt override in systemPrompt.ts)

## Architecture decisions

- llama-server NOT Ollama (migration complete, never revert)
- Daemon-first: 2.9MB tarball, lazy-load 253MB IDE
- Workbench = product name. TARX = AI identity.
- Mesh is standalone repo/binary (NOT inside this repo)

## Build

```bash
# If you edited webview code (sidebar, chat panel):
cd extensions/tarx && node esbuild.webview.js --production
node build/lib/tarx-webview-inline.js

# TypeScript check (everything):
yarn compile

# Full release build:
./scripts/release.sh
```

## Key files

| File | Purpose |
|------|---------|
| extensions/tarx/src/systemPrompt.ts | TARX persona + identity override |
| extensions/tarx/src/extension.ts | Main extension entry point |
| extensions/tarx/package.json | Chat participant, commands, views |
| src/vs/workbench/browser/parts/tarxsidebar/ | Sidebar webview host |
| extensions/tarx/esbuild.webview.js | Webview bundler config |
| build/lib/tarx-webview-inline.js | Inlines sidebar.js/css into TS |
