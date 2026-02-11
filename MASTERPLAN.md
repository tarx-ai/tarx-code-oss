# TARX CODE OSS - MASTERPLAN

**Project:** TARX SuperComputer IDE
**Version:** 1.0
**Audit Date:** 2026-02-01
**Status:** PRODUCTION-READY

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [VS Code Core Modifications](#3-vs-code-core-modifications)
4. [TARX Extension](#4-tarx-extension)
5. [Database Systems](#5-database-systems)
6. [UI/Webview Components](#6-uiwebview-components)
7. [Service Infrastructure](#7-service-infrastructure)
8. [Port Configuration](#8-port-configuration)
9. [Build System](#9-build-system)
10. [Known Issues & Technical Debt](#10-known-issues--technical-debt)
11. [Security Considerations](#11-security-considerations)
12. [Roadmap](#12-roadmap)
13. [File Inventory](#13-file-inventory)

---

## 1. EXECUTIVE SUMMARY

Workbench is a **fully customized VS Code fork** providing local-first AI assistance with:

- **Custom Sidebar:** React-based 240px sidebar replacing VS Code's Activity Bar
- **Local LLM:** llama-server integration on port 11435
- **RAG System:** Embedding server on port 11437 for code search
- **MCP Integration:** Model Context Protocol for knowledge management
- **Authentication:** PIN + SMS 2FA with auto-lock
- **Voice Interface:** WebSocket-based (deferred to V1.5)

### Component Health Summary

| Component | Files | Status | Notes |
|-----------|-------|--------|-------|
| VS Code Core Mods | 46+ | WORKING | Custom sidebar, chat, layout |
| TARX Extension | 53 | WORKING | Chat participant, auth, MCP |
| React Webview | 14 | WORKING | Sidebar UI components |
| Database Layer | 2 | WORKING | SQLite with RAG |
| Sidecar Service | 3 | WORKING | LLM process management |
| Voice System | 6 | DEFERRED | V1.5 feature |

---

## V1 SHIP AUDIT (2026-02-01)

### Architecture Verified

| Component | Status | Notes |
|-----------|--------|-------|
| React Sidebar | ✅ WORKING | App.tsx + all components functional |
| Chat Participant | ✅ WORKING | @tarx with RAG + context injection |
| Native VS Code Chat | ✅ WORKING | Chat clicks → `workbench.action.chat.open` |
| RAG Client | ✅ WORKING | Port 11437, nomic-embed, 768 dims |
| File Upload | ✅ WORKING | Drag-drop in FilesSection.tsx |
| llama-server | ✅ WORKING | Port 11435, streaming responses |
| History Persistence | ✅ WORKING | SQLite via sqlite3 CLI |

### Critical Fix Status: ✅ RESOLVED

**better-sqlite3 version mismatch (NODE_MODULE_VERSION 140 vs 137)**

All critical files migrated to sqlite3 CLI:

| File | Status | Notes |
|------|--------|-------|
| `sessionPanel.ts` | ✅ FIXED | Uses execSync + sqlite3 CLI |
| `claudeSessionsProvider.ts` | ✅ FIXED | Uses execSync + sqlite3 CLI |
| `projectContextPanel.ts` | ✅ FIXED | Uses execSync + sqlite3 CLI |
| `overnight-test.ts` | ⚠️ OK | Tests only, not runtime critical |
| `sqliteDatabase.ts` | ⚠️ OK | Disabled code path |

**Pattern used:**
```typescript
const result = execSync(`sqlite3 "${dbPath}" -json`, {
    encoding: 'utf8',
    input: query
});
const rows = JSON.parse(result || '[]');
```

### V1 Ship Checklist

- [x] React sidebar navigation works
- [x] Chat clicks open native VS Code chat
- [x] @tarx chat participant responds
- [x] RAG context injection working
- [x] llama-server integration tested
- [x] Projects list loads from memory.db
- [x] History list loads from memory.db
- [x] File upload via drag-drop works
- [x] Fix sessionPanel.ts sqlite3 ✅ DONE
- [x] Fix claudeSessionsProvider.ts sqlite3 ✅ DONE
- [x] Fix projectContextPanel.ts sqlite3 ✅ DONE

### No Custom Chat to Strip

**CONFIRMED:** tarxSidebarPart.ts does NOT build custom chat panels.
- Chat row → `workbench.action.chat.open` (native)
- New chat → `tarx.chat.new` (opens native chat with @tarx)
- History clicks → `tarx.openSession` / `tarx.openConversation`

---

## 2. ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          TARX CODE OSS                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐     │
│  │   VS CODE CORE   │   │  TARX EXTENSION  │   │   REACT WEBVIEW  │     │
│  │                  │   │                  │   │                  │     │
│  │  - TarxSidebar   │◄──┤  - Chat Partic.  │◄──┤  - App.tsx       │     │
│  │  - Layout Mods   │   │  - Auth System   │   │  - Components    │     │
│  │  - Chat Widget   │   │  - MCP Bridge    │   │  - Styles        │     │
│  │  - Sidecar IPC   │   │  - Database      │   │  - Hooks         │     │
│  └────────┬─────────┘   └────────┬─────────┘   └──────────────────┘     │
│           │                      │                                       │
│           ▼                      ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                      BACKEND SERVICES                          │     │
│  │                                                                │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │     │
│  │  │ llama-server│  │ nomic-embed │  │  memory.db  │            │     │
│  │  │  :11435     │  │   :11437    │  │   SQLite    │            │     │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │     │
│  │                                                                │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │     │
│  │  │ mesh-server │  │voice-bridge │  │test-harness │            │     │
│  │  │  :11436     │  │   :11438    │  │   :11439    │            │     │
│  │  │  (TODO)     │  │  (DEFERRED) │  │  (WORKING)  │            │     │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| IDE Shell | VS Code (Electron) | Desktop application |
| Core UI | TypeScript/DOM | Workbench integration |
| Sidebar UI | React 18 | Component-based sidebar |
| Extension | TypeScript | Chat, auth, MCP |
| Database | SQLite (better-sqlite3) | Project/conversation storage |
| LLM | llama-server (llama.cpp) | Local inference |
| Embeddings | nomic-embed-text-v1.5 | RAG vector search |

---

## 3. VS CODE CORE MODIFICATIONS

### 3.1 Custom Sidebar (TarxSidebarPart)

**File:** `src/vs/workbench/browser/parts/tarxsidebar/tarxSidebarPart.ts`
**Size:** 91,806 bytes
**Status:** WORKING

**Features:**
- 240px expanded / 48px collapsed (icon-only mode)
- React webview integration via inline CSS/JS
- Header with logo + SuperComputer toggle
- Collapsible sections: CREATE, CODE, FILES, PROJECTS
- History grouping by time
- MCP Bridge state synchronization

**Key Configuration:**
```typescript
minimumWidth: 48   // Collapsed
maximumWidth: 400  // Maximum expansion
USE_WEBVIEW_MODE: true  // React rendering
```

### 3.2 Layout Modifications

**Activity Bar Hidden:**
- `src/vs/workbench/browser/layout.ts:2758` - `ACTIVITYBAR_HIDDEN = true`
- `src/vs/workbench/browser/layout.ts:3050` - `isActivityBarHidden()` returns `true`
- `src/vs/workbench/browser/parts/activitybar/activitybarPart.ts:52` - Width set to 0

**Extensions Dual Registration:**
- `src/vs/workbench/contrib/extensions/browser/extensions.contribution.ts:131-134`
- Extensions view registered in BOTH Sidebar AND AuxiliaryBar

### 3.3 Chat Widget Customizations

| File | Modification |
|------|--------------|
| `chatWidget.ts:850` | Hide Copilot instructions |
| `chatWidget.ts:887` | TARX logo for welcome |
| `chatWidget.ts:910-923` | @tarx suggested prompts |
| `chatListRenderer.ts:795` | TARX eyes as agent icon |
| `chatInputPart.ts:128` | 25% taller input editor |
| `editorGroupWatermark.ts:29,43` | "Chat with TARX" first |

### 3.4 TARX Contribution

**File:** `src/vs/workbench/contrib/tarx/browser/tarx.contribution.ts`

**Startup Behavior:**
1. Hide Auxiliary Bar on startup
2. Hide Activity Bar (first run only)
3. Show welcome notification: "Use @tarx in Chat"
4. Mark `tarx.initialized` flag

**Commands Registered:**
- `tarx.focusChatPanel` - Cmd+Shift+C
- `tarx.checkVoiceBridge` - Port 11438 status
- `tarx.showActivityBar` - Restore activity bar
- Stub commands for sidebar (until extension loads)

### 3.5 Sidecar Service (Inference Management)

**Files:**
- `src/vs/platform/tarx/common/tarx.ts` - Interfaces
- `src/vs/platform/tarx/electron-main/tarxSidecarService.ts` - Implementation
- `src/vs/platform/tarx/common/tarxIpc.ts` - IPC communication

**Model Profiles (RAM-based):**
| RAM | Context | Batch | Quantization |
|-----|---------|-------|--------------|
| ≤8GB | 4096 | 256 | q4_0 |
| ≤12GB | 8192 | 512 | q4_0 |
| ≤16GB | 16384 | 512 | q8_0 |
| ≤32GB | 8192 | 512 | q8_0 |
| >32GB | 65536 | 2048 | f16 |

### 3.6 Account/Entitlement Changes

**Purpose:** Disable Copilot setup when no defaultChatAgent

- `chatEntitlementService.ts:258-260` - Hide setup when no agent
- `defaultAccount.ts:85-102` - Safe empty config fallback
- `defaultAccount.ts:770-771` - Skip provider registration

### 3.7 Telemetry

**Sentry Disabled:**
- `desktop.main.ts:6-16` - Commented out
- `workbench.ts` - Commented out
- Reason: Module resolution issue in browser context

---

## 4. TARX EXTENSION

### 4.1 Package Overview

**Location:** `extensions/tarx/`
**Files:** 53 TypeScript source files
**Status:** WORKING

### 4.2 Contributions

**Chat Participant:**
- ID: `tarx.chat`
- Modes: ask, edit, agent
- Commands: explain, refactor, fix, tests

**Language Model Provider:**
- Vendor: "TARX Local"
- Model: "tarx-local" (llama family)
- Max tokens: 8192 input, 4096 output

**Commands (25 primary):**
- Chat: `tarx.openChat`, `explainSelection`, `refactorSelection`, etc.
- Projects: `create`, `createFromWorkspace`, `refresh`, `remove`
- MCP: `refreshMcpSettings`, `openMcpConfig`, `toggleMcpServer`
- Claude.ai: `refreshClaudeSessions`, `openClaudeSession`

**Views (5):**
- `tarx.sidebarWebview` - React sidebar
- `tarx.projects` - Project tree
- `tarx.claudeSessions` - Claude.ai sessions
- `tarx.sidebar` - Conversation history
- `tarx.mcpSettings` - MCP configuration

### 4.3 Extension Activation Flow

```
Phase 1: Analytics & Auth
├── TarxAnalytics instantiated
├── AuthManager initialized
├── AuthChatView created
└── Auth required on startup (if configured)

Phase 2: Core Services
├── TarxClient → llama-server
├── RagClient → embedding server
├── HealthService → connection polling
└── TestHarnessService → port 11439

Phase 3: Database & Indexing
├── SqliteDatabase initialized
├── ProjectIndexer created
├── File watcher setup
└── Progress tracking

Phase 4: Providers & UI
├── SidebarProvider
├── ProjectTreeProvider
├── ClaudeSessionsProvider
├── McpSettingsProvider
└── WebviewSidebarProvider (React)

Phase 5: Chat Participant
├── Authentication guard
├── Conversation history loading
└── System prompt integration
```

### 4.4 Command Categories

| Category | Count | Examples |
|----------|-------|----------|
| Chat | 8 | openChat, explainSelection, fixCode |
| Connection | 3 | reconnect, getConnectionStatus, uploadFile |
| Voice | 6 | voice.start, voice.stop, voice.test |
| Proactive | 7 | proactive.start, proactive.approve |
| History | 4 | chat.new, openConversation, openSession |
| Mesh | 3 | mesh.connect, mesh.disconnect |
| Projects | 9 | projects.new, projects.open, projects.delete |
| Indexing | 4 | indexProject, showIndexingProgress |
| Database | 3 | getConversationHistory, getSessionHistory |

---

## 5. DATABASE SYSTEMS

### 5.1 Memory Database (MCP)

**Path:** `~/Library/Application Support/tarx/memory.db`
**Size:** ~2.2 MB (with data)
**Engine:** SQLite

**Tables:**
| Table | Purpose | Records (sample) |
|-------|---------|------------------|
| spaces | Projects/workspaces | 100 |
| sessions | Chat sessions | 221 |
| messages | Conversation turns | 565 |

**Query Method:**
```javascript
// sqlite3 CLI (avoids native module issues)
const result = execSync(`sqlite3 "${mcpDbPath}" -json`, {
    encoding: 'utf8',
    input: query
});
```

### 5.2 TARX Database

**Path:** `~/Library/Application Support/tarx/tarx.db`
**Engine:** SQLite (better-sqlite3)
**Status:** Empty (data in memory.db)

**Schema:**
```sql
projects (id, name, root, type, is_active, created_at, updated_at)
project_files (id, project_id, file_path, indexed_at)
file_embeddings (id, file_id, chunk_index, content, embedding)
conversations (id, project_id, title, created_at, updated_at)
conversation_turns (id, conversation_id, role, content, created_at)
```

### 5.3 RAG Capabilities

**Embedding Model:** nomic-embed-text-v1.5
**Dimensions:** 768
**Search:** Cosine similarity (manual implementation)

```typescript
// Fallback cosine similarity (vec0 extension not loaded)
function cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return dot / (normA * normB);
}
```

---

## 6. UI/WEBVIEW COMPONENTS

### 6.1 React Component Tree

```
App.tsx (Container)
├── Header.tsx (Logo + Greeting)
├── NavRow.tsx (Chat/Voice buttons)
├── CollapsibleSection.tsx (Wrapper)
│   ├── ProjectsSection.tsx
│   │   └── SectionItem.tsx (with emoji support)
│   ├── HistorySection.tsx
│   │   ├── HistoryGroup.tsx (Today/Yesterday/Week/Claude)
│   │   └── HistoryItem.tsx
│   └── FilesSection.tsx (Drag-drop upload)
├── ModelLoadingIndicator.tsx
├── UploadProgress.tsx
└── Footer.tsx (Compute dropdown + Settings)
```

### 6.2 Component Status

| Component | Lines | Status | Features |
|-----------|-------|--------|----------|
| App.tsx | 345 | WORKING | State management, message routing |
| Header.tsx | 39 | WORKING | Time-based greeting |
| NavRow.tsx | 44 | WORKING | Hover action buttons |
| CollapsibleSection.tsx | 72 | WORKING | Smooth animations |
| SectionItem.tsx | 40 | WORKING | Emoji display support |
| ProjectsSection.tsx | 88 | WORKING | Type-based icons |
| HistorySection.tsx | 221 | WORKING | Time grouping, Claude.ai sync |
| FilesSection.tsx | 161 | WORKING | Drag-drop, file types |
| Footer.tsx | 107 | WORKING | Compute dropdown |

### 6.3 Message Passing

**Direction: Webview → Workbench**
```
openChat, newChat, openProject, createProject,
openSession, openConversation, uploadFile, deleteFile,
openView, openSettings, openExtensions, openFolder,
getProjects, getHistory, getUploadedFiles, ready
```

**Direction: Workbench → Webview**
```
projectsLoaded, historyLoaded, uploadedFilesLoaded,
connectionStatusChanged, uploadProgress, uploadProgressHide,
refresh, stateSync, extensionReady
```

### 6.4 Styling

**CSS Variables (Design Tokens):**
```css
--tarx-sidebar-width: 240px;
--tarx-sidebar-collapsed-width: 48px;
--tarx-spacing-xs/sm/md/lg: 4px / 8px / 12px / 16px;
--tarx-radius-sm/md: 4px / 6px;
--tarx-transition-fast/normal: 0.15s / 0.2s ease;
--tarx-font-xs/sm/md/lg: 10px / 11px / 12px / 13px;
```

**VS Code Theme Integration:**
- `--vscode-sideBar-background`
- `--vscode-sideBar-foreground`
- `--vscode-list-hoverBackground`
- `--vscode-textLink-foreground`
- `--vscode-button-background`

---

## 7. SERVICE INFRASTRUCTURE

### 7.1 TarxClient

**Purpose:** HTTP communication with llama-server
**Timeout:** 3s for health, blocking for chat

```typescript
interface TarxClient {
    chat(messages: ChatMessage[]): Promise<string>;
    chatStream(messages: ChatMessage[]): AsyncGenerator<string>;
    isHealthy(): Promise<boolean>;
}
```

### 7.2 HealthService

**Purpose:** Connection monitoring with auto-reconnect

**Configuration:**
- Poll interval: 10s
- Health timeout: 5s
- Max backoff: 30s
- Max retries: 5

**States:** online, offline, connecting, reconnecting

### 7.3 RagClient

**Purpose:** Embedding generation for code search

```typescript
interface RagClient {
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    isHealthy(): Promise<boolean>;
}
```

### 7.4 ProjectIndexer

**Purpose:** File discovery and embedding generation

**Workflow:**
1. Scan files (respecting .gitignore)
2. Filter by extension
3. Chunk content (code vs text)
4. Generate embeddings
5. Store in database

### 7.5 MCP Bridge

**Purpose:** Model Context Protocol integration

**Event Types:**
- projects (created, updated, deleted, refreshed)
- history (created, updated, refreshed)
- files (created, updated, deleted)
- status (connection changes)
- error (error events)

---

## 8. PORT CONFIGURATION

| Port | Service | Status | Purpose |
|------|---------|--------|---------|
| 11435 | llama-server | ACTIVE | Chat completions & inference |
| 11436 | mesh-server | TODO | Distributed compute mesh |
| 11437 | nomic-embed | ACTIVE | Embeddings/RAG |
| 11438 | voice-bridge | DEFERRED | Voice WebSocket (V1.5) |
| 11439 | test-harness | ACTIVE | Automated testing |

**Paths:**
- Models: `~/Library/Application Support/tarx/models`
- Data: `~/Library/Application Support/com.tarx.supercomputer`
- Database: `~/Library/Application Support/tarx/memory.db`

---

## 9. BUILD SYSTEM

### 9.1 Extension Build

```bash
cd extensions/tarx
npm run compile          # TypeScript + Webview
npm run compile:webview  # React bundle only
```

**Output:**
- `out/` - Compiled TypeScript
- `out/webview/sidebar.js` - React bundle (~159KB)
- `out/webview/sidebar.css` - Styles (~20KB)

### 9.2 Webview Inline Generation

```bash
node build/lib/tarx-webview-inline.js
```

**Input:**
- `extensions/tarx/out/webview/sidebar.js`
- `extensions/tarx/out/webview/sidebar.css`

**Output:**
- `src/vs/workbench/browser/parts/tarxsidebar/webviewContent.ts`
  - `TARX_SIDEBAR_CSS` - Inlined CSS
  - `TARX_SIDEBAR_JS` - Inlined JS

**Why Inlining?**
- Webview sandbox requires inline assets
- No external file loading allowed
- CSP compliance

### 9.3 Main Build

```bash
npm run watch     # Development
npm run compile   # Production
```

---

## 10. KNOWN ISSUES & TECHNICAL DEBT

### 10.1 High Priority

| Issue | Location | Impact | Status |
|-------|----------|--------|--------|
| better-sqlite3 version mismatch | Extension | DB queries fail | FIXED (sqlite3 CLI) |
| Projects empty | tarx.db unused | No projects displayed | FIXED (use memory.db) |

### 10.2 Medium Priority

| Issue | Location | Impact | Status |
|-------|----------|--------|--------|
| Mesh connectivity | extension.ts:888-900 | No distributed compute | TODO stub |
| Private compute pool | extension.ts:917-928 | No pool join | TODO stub |
| Analytics batch write | extension.ts:156 | In-memory only | TODO |
| vec0 extension | sqliteDatabase.ts:160 | Slower cosine similarity | ACCEPTABLE |

### 10.3 Low Priority

| Issue | Location | Impact | Status |
|-------|----------|--------|--------|
| Voice services | speechProvider.ts | No voice input | DEFERRED V1.5 |
| Sentry telemetry | desktop.main.ts | No error reporting | DISABLED |
| List virtualization | HistorySection.tsx | Slow with 1000+ items | FUTURE |

### 10.4 Code Quality Notes

**Positive:**
- Comprehensive TypeScript types
- Command registration guard
- Debug logging framework (`TARX_DEBUG`)
- Event emitters for async ops
- Configuration-driven behavior

**Areas for Improvement:**
- SQL queries use string interpolation (low risk - internal UUIDs only)
- Multiple `[TARX DEBUG]` logs (verbose)
- Some TODO comments remain

---

## 11. SECURITY CONSIDERATIONS

### 11.1 Authentication

- PIN authentication (PinAuth)
- SMS 2FA support (SmsAuth via Twilio)
- Auto-lock timeout (configurable 1-480 minutes)
- Activity tracking

### 11.2 Content Security Policy

```html
default-src 'none';
style-src 'unsafe-inline';
script-src 'unsafe-inline';
img-src data: https:;
font-src data:;
```

### 11.3 Data Handling

- Local-first architecture (no cloud)
- File uploads via extension commands
- No direct filesystem access from webview
- State persisted via VS Code API

### 11.4 Potential Concerns

**SQL Injection (Low Risk):**
```typescript
// extension.ts:587-589
const insertQuery = `INSERT INTO spaces ... VALUES ('${spaceId}', ...)`
```
- Only internal UUIDs used, not user input
- Mitigation: Consider parameterized queries

---

## 12. ROADMAP

### 12.1 V1.0 (Current)

- [x] Custom TARX sidebar
- [x] Local LLM integration
- [x] RAG/embedding search
- [x] MCP knowledge integration
- [x] Authentication system
- [x] Claude.ai session sync
- [x] Project management
- [x] File upload/indexing

### 12.2 V1.1 (Short-term)

- [ ] Implement mesh.connect networking
- [ ] Implement privateCompute.join
- [ ] Load vec0 extension for performance
- [ ] SQL parameter binding
- [ ] Analytics persistence

### 12.3 V1.5 (Medium-term)

- [ ] Voice services (speechProvider.ts)
- [ ] Proactive voice interface
- [ ] Live action proposals
- [ ] WebSocket voice bridge

### 12.4 V2.0 (Long-term)

- [ ] SuperComputer GPU mesh network
- [ ] Offline-first cloud backup
- [ ] Local model fine-tuning
- [ ] Collaborative mesh features
- [ ] Multi-user workspaces

---

## 13. FILE INVENTORY

### 13.1 VS Code Core Modifications (46+ files)

```
src/vs/workbench/
├── browser/
│   ├── layout.ts (Activity Bar hidden)
│   ├── workbench.ts (Sentry disabled)
│   └── parts/
│       ├── tarxsidebar/
│       │   ├── tarxSidebarPart.ts (91,806 bytes)
│       │   ├── tarxCommands.ts
│       │   ├── webviewContent.ts (184,488 bytes)
│       │   ├── tarxProjectModal.ts
│       │   ├── extensionsView.ts
│       │   └── media/
│       │       ├── tarx-logo.png
│       │       ├── tarx-eyes.png
│       │       └── tarxSidebarPart.css
│       ├── activitybar/
│       │   └── activitybarPart.ts (width zeroed)
│       ├── editor/
│       │   └── editorGroupWatermark.ts (TARX chat)
│       └── paneCompositePartService.ts
├── contrib/
│   ├── tarx/browser/
│   │   └── tarx.contribution.ts
│   ├── chat/browser/
│   │   ├── widget/
│   │   │   ├── chatWidget.ts (TARX branding)
│   │   │   ├── chatListRenderer.ts (TARX icon)
│   │   │   ├── input/chatInputPart.ts (taller)
│   │   │   └── media/chat.css (typing indicator)
│   │   └── tarx.bak/ (voice interface backup)
│   ├── extensions/browser/
│   │   └── extensions.contribution.ts (dual registration)
│   └── welcomeGettingStarted/common/
│       └── gettingStartedContent.ts (TARX welcome)
├── services/
│   ├── chat/common/
│   │   └── chatEntitlementService.ts
│   └── accounts/browser/
│       └── defaultAccount.ts
└── workbench.common.main.ts (TARX import)

src/vs/platform/tarx/
├── common/
│   ├── tarx.ts (interfaces)
│   └── tarxIpc.ts (IPC channel)
└── electron-main/
    └── tarxSidecarService.ts (process management)
```

### 13.2 TARX Extension (53 files)

```
extensions/tarx/src/
├── extension.ts (MAIN - 2000+ lines)
├── auth/
│   ├── authManager.ts
│   ├── authChatView.ts
│   ├── pinAuth.ts
│   └── smsAuth.ts
├── core/config/
│   └── McpSettingsProvider.ts
├── services/
│   ├── mcpBridge.ts
│   ├── firstRunFlow.ts
│   ├── firstRunManager.ts
│   ├── modelDownload.ts
│   ├── hardwareDetection.ts
│   └── toastManager.ts
├── proactive/
│   ├── index.ts
│   ├── contextObserver.ts
│   ├── patternDetector.ts
│   ├── actionProposer.ts
│   ├── actionExecutor.ts
│   ├── proactiveVoiceInterface.ts
│   └── logger.ts
├── webview/
│   ├── TarxSidebarProvider.ts
│   └── ui/
│       ├── App.tsx
│       ├── index.tsx
│       ├── types.ts
│       ├── components/ (14 files)
│       ├── hooks/useVSCodeAPI.ts
│       └── styles/sidebar.css
├── database.ts
├── sqliteDatabase.ts
├── tarxClient.ts
├── languageModelProvider.ts
├── completionProvider.ts
├── healthService.ts
├── ragClient.ts
├── projectIndexer.ts
├── sidebarProvider.ts
├── projectTreeProvider.ts
├── claudeSessionsProvider.ts
├── statusBar.ts
├── systemPrompt.ts
├── chatContext.ts
├── contextWindow.ts
├── projectDashboard.ts
├── projectContextPanel.ts
├── sessionPanel.ts
├── voiceTranscriptPanel.ts
├── speechProvider.ts
├── codeAnalysis.ts
├── agentIntegration.ts
├── meshProvider.ts
├── mcpKnowledge.ts
├── testHarness.ts
├── overnight-test.ts
└── test-ui-overnight.ts
```

### 13.3 React Webview Components (14 files)

```
extensions/tarx/src/webview/ui/
├── App.tsx (345 lines)
├── index.tsx (27 lines)
├── types.ts (94 lines)
├── components/
│   ├── Header.tsx (39)
│   ├── NavRow.tsx (44)
│   ├── CollapsibleSection.tsx (72)
│   ├── SectionItem.tsx (40)
│   ├── ProjectsSection.tsx (88)
│   ├── HistorySection.tsx (221)
│   ├── FilesSection.tsx (161)
│   ├── Footer.tsx (107)
│   ├── ModelLoadingIndicator.tsx (17)
│   ├── UploadProgress.tsx (32)
│   └── index.ts (17)
├── hooks/
│   └── useVSCodeAPI.ts (106)
└── styles/
    └── sidebar.css (913)
```

---

## APPENDIX A: BREAKING CHANGES FROM VANILLA VS CODE

1. **Activity Bar** - Permanently hidden (restorable via command)
2. **Sidebar** - Replaced with custom TARX sidebar
3. **Chat UI** - All suggestions use @tarx prefix
4. **Icons** - Agent icons use TARX eyes
5. **Welcome** - Rebranded to TARX
6. **Telemetry** - Sentry disabled
7. **Account Setup** - Skipped when no defaultChatAgent

---

## APPENDIX B: CRITICAL DEPENDENCIES

1. **llama-server binary** - Must be on system PATH
2. **React webview** - `extensions/tarx/out/webview/sidebar.js/css`
3. **TARX extension** - For full functionality
4. **Port availability** - 11435, 11436, 11437, 11438, 11439
5. **Model directory** - `~/Library/Application Support/tarx/models`

---

## APPENDIX C: QUICK REFERENCE

### Build Commands

```bash
# Extension only
cd extensions/tarx && npm run compile

# Webview inline update
node build/lib/tarx-webview-inline.js

# Full VS Code build
npm run compile

# Run tests
node extensions/tarx/overnight-test.js
```

### Debug Flags

```bash
TARX_DEBUG=true  # Enable verbose logging
```

### Key Configuration

```json
{
  "tarx.serverUrl": "http://localhost:11435",
  "tarx.ragUrl": "http://localhost:11437",
  "tarx.model": "local",
  "tarx.security.autoLockMinutes": 30,
  "chat.viewSessions.enabled": true
}
```

---

**Document Version:** 1.0
**Last Updated:** 2026-02-01
**Generated By:** Claude Code Audit System
