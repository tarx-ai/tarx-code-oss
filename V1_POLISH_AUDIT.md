# TARX V1 Desktop App Polish Audit

**Date:** 2026-02-12
**Auditor:** Claude Opus 4.5

---

## File Map: TARX Custom Components

### Extension Core (`extensions/tarx/src/`)
| File | Purpose |
|------|---------|
| `extension.ts` | Main extension entry, chat participant, commands |
| `tarxClient.ts` | HTTP client for llama-server (port 11435) |
| `systemPrompt.ts` | TARX_SYSTEM_PROMPT, TARX_SYSTEM_PROMPT_V2, voice instructions |
| `projectContextPanel.ts` | Project context tab UI |
| `languageModelProvider.ts` | VS Code Language Model API integration |
| `healthService.ts` | llama-server health monitoring |
| `networkModel.ts` | Claude API fallback routing |

### Webview UI (`extensions/tarx/src/webview/ui/`)
| File | Purpose |
|------|---------|
| `App.tsx` | Main sidebar app, routes to views |
| `components/FirstRunWelcome.tsx` | First-time user welcome screen |
| `components/Footer.tsx` | Health indicator, compute dropdown |
| `components/Header.tsx` | Logo, navigation |
| `components/Dashboard.tsx` | TARX dashboard view |
| `components/SettingsView.tsx` | Settings panel |
| `components/ProjectsSection.tsx` | Project list |
| `components/HistorySection.tsx` | Chat history list |
| `components/FilesSection.tsx` | Uploaded files |
| `components/ui/index.tsx` | Shared UI primitives (Button, Card, Badge) |
| `styles/sidebar.css` | Main sidebar styles |

### MCP Servers
| Directory | Tools |
|-----------|-------|
| `extensions/tarx-core/` | 46 tools: memory, spaces, sessions, RAG |
| `extensions/tarx-ops/` | 47 tools: Sentry, orchestration, file locks |
| `extensions/tarx-ui-mcp-server/` | 167 tools: UI automation, testing |

---

## Chat Flow

```
User types message
    ↓
extension.ts: tarx chat participant handler (line ~1200)
    ↓
buildTarxSystemPrompt() called (line 1294)
    ↓
Messages array built: [system, ...history, user]
    ↓
tarxClient.chatCompletionStream() (line 1739)
    ↓
StreamChunk yields { type: 'thinking' | 'content', content }
    ↓
Thinking → response.thinkingProgress() (line ~1756)
Content → response.markdown() (line ~1762)
    ↓
DB storage: addConversationTurn()
```

---

## System Prompt Injection Points

| Location | Status | Notes |
|----------|--------|-------|
| `extension.ts:1294` | OK | Uses `buildTarxSystemPrompt()` |
| `extension.ts:2909` | OK | Uses `buildTarxSystemPrompt({})` |
| `languageModelProvider.ts:103` | OK | Uses `TARX_SYSTEM_PROMPT_V2` |
| `projectContextPanel.ts:876` | FIXED | Now uses `TARX_SYSTEM_PROMPT_V2` |
| `testHarness.ts:783` | OK (test) | Has its own prompt |
| `daemon/error-analyzer.ts` | OK (daemon) | Has its own prompt |

**Result:** All production code paths now inject the canonical system prompt.

---

## First-Time User Experience

### Current State: IMPLEMENTED
- `FirstRunWelcome.tsx` exists with:
  - TARX logo with gradient
  - Model status card (health check to 11435)
  - Quick action cards (Start Chat, Create Project, Settings)
  - Feature list (local inference, project memory, MCP tools, mesh)
  - CTA buttons (Get Started, Skip Welcome)
  - Fade-in animations with delays

### First-Run Detection
- `App.tsx:113-116`: Checks `getState<{ hasSeenWelcome: boolean }>()`
- Shows `FirstRunWelcome` if `!hasSeenWelcome`
- Skip button sets `hasSeenWelcome: true`

---

## Visual State

### Branding (`product.json`)
- `nameShort`: "TARX Workbench"
- `nameLong`: "TARX Workbench"
- `applicationName`: "tarx-code"
- `productDescription`: "Local. Private. Proactive."
- `welcomePageTitle`: "Welcome to TARX Workbench"

### Theme
- No custom TARX theme file found
- Uses VS Code default dark theme
- Purple accent colors defined in components (VS.purple)

### CSS
- `sidebar.css`: Main sidebar styles
- Health indicator dot added in previous session
- VS Code CSS variables used throughout

---

## Error Handling

### llama-server Connection
- `tarxClient.ts`: ECONNREFUSED → "TARX Desktop is not running"
- `tarxClient.ts`: 503 → "TARX is busy processing another request"
- `tarxClient.ts`: timeout → "TARX request timed out"

### Health Check
- `FirstRunWelcome.tsx:261-280`: Polls /health every 3s
- Shows "Connecting..." status if not ready

### Gaps
- No loading state in main chat if llama-server is starting
- No auto-retry on connection failure

---

## Navigation

### Sidebar Sections
- Projects: List of user projects
- History: Past conversations
- Files: Uploaded files

### Working
- FirstRunWelcome renders on first launch
- Project selection opens ProjectContextPanel
- Chat opens VS Code chat panel (@tarx participant)

---

## Gaps Identified

1. **Chat welcome state**: When FirstRunWelcome is dismissed but no messages exist yet, the VS Code chat panel is blank (no in-chat welcome). This is acceptable for V1 since VS Code chat has its own placeholder.

2. **Suggestion chips in chat**: FirstRunWelcome has quick actions, but the actual chat input doesn't have clickable suggestions. Feature request for V1.1.

3. **Model loading spinner**: If llama-server is slow to start (11s), there's no blocking loading screen in the main app. FirstRunWelcome shows "Connecting..." but main app doesn't.

4. **Input auto-resize**: VS Code chat input has built-in resize. TARX session panel input may need review.

---

## Summary

| Track | Status |
|-------|--------|
| System Prompt Lock | COMPLETE |
| First-Time UX | IMPLEMENTED (existing) |
| Chat UX | Thinking tokens working |
| Branding | TARX Workbench |
| Error Handling | Basic coverage |
| Navigation | Working |

**Ship Readiness:** Ready for V1 testing
