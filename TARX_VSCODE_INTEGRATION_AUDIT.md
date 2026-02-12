# TARX VS Code Integration Audit

**Date:** February 12, 2026
**Auditor:** Claude Code (Opus 4.5)
**Fork Base:** VS Code 1.96.0

---

## Executive Summary

TARX is built on a **VS Code 1.96.0 fork** with **2,001 TARX-specific modifications** to the core codebase. The integration is **functional but has significant technical debt**: 585 Copilot references remain, critical VS Code APIs are underutilized, and Sentry shows 3,558+ recurring errors from integration issues.

**Fork Health Score: 6/10**
**API Coverage: 10/14 APIs used**
**Agentic Score: 9/12 capabilities**
**Critical Blocker Count: 5**

---

## 1. Fork Health

### Base Version
- **VS Code Version:** 1.96.0
- **Package Version:** 1.96.0
- **Quality:** None (development build)
- **Commit:** Not tracked

### Codebase Statistics
| Metric | Count |
|--------|-------|
| TARX references in src/vs/ | 2,001 |
| Copilot ghost references | 585 |
| Cline ghost references | 14 |
| Core TARX code (src/vs/) | ~9,612 lines |
| Extension code (extensions/tarx/) | ~38,402 lines |
| Total TARX extensions | 7 |
| Modified VS Code core files | 41 |

### Extension Architecture
```
extensions/
├── tarx/           # Main extension (sidebar, chat, commands, 51 commands)
├── tarx-core/      # MCP server: memory, RAG, spaces, sessions (46 tools)
├── tarx-ops/       # MCP server: Sentry, orchestration, daemon (47 tools)
├── tarx-ui-mcp-server/  # MCP server: UI control, testing (167 tools)
├── tarx-local/     # Local inference sidecar
├── tarx-shared/    # Shared utilities
└── tarx-theme/     # TARX purple theme
```

### Core Integration Points (src/vs/)
```
src/vs/
├── platform/tarx/
│   ├── common/tarxIpc.ts          # IPC channel definitions
│   ├── common/tarx.ts             # Core types
│   ├── electron-main/tarxSidecarService.ts      # Sidecar management
│   └── electron-main/tarxEmbeddingSidecarService.ts
├── workbench/
│   ├── browser/parts/tarxsidebar/
│   │   ├── tarxSidebarPart.ts     # 102,614 lines - THE SIDEBAR
│   │   ├── webviewContent.ts      # 554,291 lines - Webview HTML/JS
│   │   ├── tarxCommands.ts
│   │   └── tarxProjectModal.ts
│   ├── contrib/tarx/browser/tarx.contribution.ts
│   └── contrib/tarxDashboard/     # Dashboard editor
└── code/electron-main/            # App initialization
```

### Proposed APIs in Use
```json
{
  "tarx-ai.tarx": [
    "defaultChatParticipant",
    "chatParticipantAdditions",
    "chatProvider",
    "speech"
  ]
}
```

### Build System
- Webview bundling: `node esbuild.webview.js --production`
- Webview inlining: `node build/lib/tarx-webview-inline.js`
- TypeScript: `yarn compile`
- **Status:** Custom gulp tasks, webview requires manual rebuild

---

## 2. VS Code API Usage

| API | Using? | Should Use? | Enables | Priority |
|-----|--------|-------------|---------|----------|
| `vscode.workspace.fs` | YES | YES | File operations | - |
| `vscode.workspace.onDidChangeTextDocument` | YES | YES | Real-time tracking | - |
| `vscode.languages.registerCompletionItemProvider` | NO | YES | Autocomplete suggestions | P2 |
| `vscode.languages.registerCodeActionsProvider` | NO | YES | Quick fixes, refactoring | P1 |
| `vscode.languages.registerInlineCompletionItemProvider` | YES | YES | Ghost text completions | - |
| `vscode.debug` | YES | YES | Debugger control | - |
| `vscode.tasks` | NO | YES | Task automation | P2 |
| `vscode.terminal` | YES | YES | Terminal commands | - |
| `vscode.window.createWebviewPanel` | YES | YES | Custom UI | - |
| `vscode.window.registerTreeDataProvider` | YES | YES | Sidebar trees | - |
| `vscode.commands.registerCommand` | YES | YES | Command palette | - |
| `vscode.workspace.onDidSaveTextDocument` | NO | YES | Save-triggered actions | P1 |
| `vscode.window.activeTextEditor` | YES | YES | Editor context | - |
| `vscode.DiagnosticCollection` | NO | YES | Show errors/warnings | P1 |

### Missing High-Value APIs

**1. DiagnosticCollection (P1)**
- TARX can READ diagnostics but cannot CREATE them
- Would enable: AI-generated error squiggles, proactive issue detection
- Location to add: `extensions/tarx/src/diagnostics.ts` (new file)
```typescript
const diagnosticCollection = vscode.languages.createDiagnosticCollection('tarx');
// Then: diagnosticCollection.set(uri, [diagnostic1, diagnostic2]);
```

**2. onDidSaveTextDocument (P1)**
- TARX doesn't react to file saves
- Would enable: Auto-format, auto-lint, post-save analysis
- Location: `extensions/tarx/src/extension.ts`
```typescript
vscode.workspace.onDidSaveTextDocument(doc => {
  // Trigger analysis, suggest improvements
});
```

**3. CodeActionsProvider (P1)**
- No quick fix integration
- Would enable: "TARX: Fix this" lightbulb actions
- Location: `extensions/tarx/src/codeActions.ts` (new file)

**4. TaskProvider (P2)**
- Not using VS Code task system
- Would enable: "TARX: Run Tests" as VS Code task

---

## 3. Agentic Capabilities

| Capability | Status | Location | Gap |
|------------|--------|----------|-----|
| Read current file | YES | `extension.ts:1225` | - |
| Read user selection | YES | `extension.ts:2106-2169` | - |
| Insert text at cursor | YES | Via editor commands | - |
| Open/create files | YES | `vscode.workspace.fs` | - |
| Run terminal commands | YES | `extension.ts:2198` | - |
| Show diagnostics | PARTIAL | Reads only, can't create | Add DiagnosticCollection |
| Provide inline completions | YES | `extension.ts:2055` | - |
| React to file saves | NO | - | Add onDidSaveTextDocument |
| Access git status/diff | YES | Via git commands | - |
| Show notifications | YES | `vscode.window.show*Message` | - |
| Create VS Code tasks | NO | - | Add TaskProvider |
| Access debug console | YES | Via debug commands | - |

**Agentic Score: 9/12** (3 gaps: diagnostics creation, save hooks, task system)

---

## 4. Chat Flow Analysis

### Architecture
```
User types in VS Code Chat Panel
         ↓
vscode.chat.createChatParticipant('tarx.chat', handler)
         ↓
┌─────────────────────────────────────────────────────────┐
│ 1. Auth check (ensureAuthenticated)                     │
│ 2. Load conversation history (SQLite DB)                │
│ 3. Get active editor context (activeTextEditor)         │
│ 4. Load project instructions (.tarx/instructions.md)    │
│ 5. Parse file references from prompt                    │
│ 6. Load RAG context (if file refs or knowledge exist)   │
│ 7. Build dynamic system prompt                          │
│ 8. Check Skills Bridge for interception                 │
│ 9. Check Direct Action detection                        │
│ 10. Route to local (llama-server) or network (Claude)   │
└─────────────────────────────────────────────────────────┘
         ↓
Stream response via `for await (chunk of chatCompletionStream)`
         ↓
response.markdown(chunk) → VS Code Chat UI
```

### Features
| Feature | Status | Location |
|---------|--------|----------|
| Streaming | YES | `extension.ts:1636,1736` |
| Context injection | YES | RAG + project instructions |
| Tool use / function calling | NO | Not implemented |
| Code apply buttons | YES | `limit-patch.ts:744` (applyArtifactSafe) |
| Conversation persistence | YES | SQLite DB |
| Voice input | YES | `speechProvider.ts` |

### Context Injection Points
1. **Project instructions:** `.tarx/instructions.md`
2. **RAG chunks:** Semantic search via nomic-embed (port 11437)
3. **File references:** Parsed from prompt (e.g., `@file.ts`)
4. **Active editor:** Current file content
5. **Conversation history:** From DB or VS Code context

---

## 5. Sentry Error Analysis

### Critical Recurring Issues

| Issue | Count | Culprit | Root Cause |
|-------|-------|---------|------------|
| HostProvider not setup | 2,792 | `HostProvider.get(host-provider)` | Initialization order bug |
| mkdir '/mock' denied | 766 | `getGlobalStorageDir(disk)` | Test code in production |
| Channel has been closed | 316 | `extensionHostProcess` | Extension crash/reload |
| Canceled | 1,282 | Various | User cancellation (normal) |

### HostProvider Issue (NODE-A, 2,792 events)
- **Error:** `HostProvider not setup. Call HostProvider.initialize() first.`
- **Location:** Likely in tarx-local or mesh initialization
- **Fix:** Ensure HostProvider.initialize() is called before any getHost() calls

### Mock Directory Issue (NODE-B, 766 events)
- **Error:** `EACCES: permission denied, mkdir '/mock'`
- **Location:** `getGlobalStorageDir(disk)`
- **Fix:** Remove test/mock code from production paths

---

## 6. Janky Integrations & Tech Debt

### TODOs Found
```
extensions/tarx/src/claude-bridge.ts:1094   # TODO: Implement actual API call
extensions/tarx/src/speechProvider.ts:712   # TODO: Implement when Moshi TTS is ready
extensions/tarx/src/sessionPanel.ts:283     # TODO: Integrate with chat to send messages
extensions/tarx/src/extension.ts:270        # TODO: Batch write to SQLite every 30s
extensions/tarx/src/extension.ts:3066       # TODO: Implement memory clearing
extensions/tarx/src/extension.ts:3599       # TODO: Actual mesh connection
extensions/tarx/src/extension.ts:3628       # TODO: Actual pool join logic
extensions/tarx/src/skillsBridge.ts:171     # TODO: Implement full conversational creation
```

### Architectural Issues
1. **Massive webviewContent.ts:** 554,291 lines - should be bundled separately
2. **Massive tarxSidebarPart.ts:** 102,614 lines - needs refactoring
3. **Multiple sidebar providers:** 6+ TreeDataProvider implementations with overlap
4. **No tool/function calling:** LLM cannot execute tools directly
5. **Copilot ghosts:** 585 references still in src/vs/
6. **Missing error boundaries:** Extension crashes affect entire host

---

## 7. Critical Fixes for Agentic TARX

### Tier 1: Blocks Agentic Functionality

1. **Add Tool Use / Function Calling**
   - LLM cannot execute tools directly
   - Must implement: tool definitions, tool execution, result injection
   - Priority: CRITICAL

2. **Fix HostProvider Initialization**
   - 2,792 Sentry events
   - Blocks reliable startup
   - Priority: CRITICAL

3. **Add DiagnosticCollection**
   - TARX can't show AI-generated errors/warnings
   - Limits proactive assistance
   - Priority: HIGH

### Tier 2: Improves Agentic Experience

4. **Add onDidSaveTextDocument**
   - Enable save-triggered analysis
   - Priority: HIGH

5. **Add CodeActionsProvider**
   - "TARX: Fix this" lightbulb actions
   - Priority: HIGH

6. **Remove '/mock' path references**
   - 766 Sentry events
   - Priority: MEDIUM

### Tier 3: Polish

7. **Clean up Copilot/Cline ghosts**
   - 599 total ghost references
   - Priority: LOW

8. **Refactor massive files**
   - tarxSidebarPart.ts, webviewContent.ts
   - Priority: LOW

---

## 8. Recommendations

### Immediate (This Week)
1. Fix HostProvider initialization order
2. Remove '/mock' test paths from production
3. Add DiagnosticCollection for AI-generated warnings

### Short Term (This Month)
4. Implement tool use / function calling in chat handler
5. Add onDidSaveTextDocument for proactive analysis
6. Add CodeActionsProvider for quick fixes

### Medium Term (Q1)
7. Clean up Copilot/Cline ghost code
8. Refactor massive sidebar files
9. Add TaskProvider integration
10. Implement proper error boundaries

---

## Appendix: File Reference

### Commands (92 registered, 51 in package.json)
```
tarx.openChat, tarx.openDashboard, tarx.explainSelection, tarx.refactorSelection,
tarx.generateTests, tarx.fixCode, tarx.addToContext, tarx.clearContext,
tarx.showStatus, tarx.indexProject, tarx.applyArtifact, tarx.showWelcome,
tarx.runQA, tarx.projects.refresh, tarx.projects.create, tarx.spawnClaudeCode, ...
```

### Keybindings (6)
- `Ctrl+Shift+T`: Open Chat
- `Ctrl+K Ctrl+E`: Explain Selection
- `Ctrl+K Ctrl+T`: Generate Tests
- `Ctrl+K Ctrl+R`: Refactor Selection
- `Ctrl+K Ctrl+F`: Fix Code
- `Ctrl+Shift+;`: Spawn Claude Code

### Ports
- 11435: llama-server (local LLM)
- 11436: Mesh HTTP API (libp2p)
- 11437: Embedding server (nomic-embed)
