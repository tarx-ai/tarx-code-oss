# TARX Code-OSS - Claude Code Context

This is a VS Code fork called **TARX** with integrated local AI inference capabilities.

## Project Overview

- **Base**: VS Code OSS (Microsoft)
- **Purpose**: AI-native code editor with local LLM support
- **Key Feature**: `@tarx` chat participant for AI assistance

## Directory Structure

```
tarx-code-oss/
├── src/vs/                          # Core VS Code source
│   ├── workbench/
│   │   ├── browser/parts/editor/
│   │   │   ├── tarxLandingPage.ts   # TARX dashboard (empty editor)
│   │   │   └── media/tarxLandingPage.css
│   │   └── contrib/
│   │       └── welcomeGettingStarted/
│   │           └── browser/
│   │               ├── gettingStarted.ts      # Welcome tab (main)
│   │               └── media/gettingStarted.css
│   └── base/                        # Base utilities
├── extensions/
│   └── tarx-local/                  # TARX extension
│       ├── src/
│       │   ├── extension.ts         # Extension entry point
│       │   ├── chatParticipant.ts   # @tarx chat handler
│       │   ├── sidecarService.ts    # LLM server management
│       │   └── completionProvider.ts
│       └── binaries/                # llama.cpp server binaries
├── scripts/
│   └── code.sh                      # Dev launch script
├── product.json                     # Product branding
└── build/                           # Build scripts
```

## Key Files for TARX Customization

### Welcome/Dashboard
- `src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts` - Welcome tab content
- `src/vs/workbench/contrib/welcomeGettingStarted/browser/media/gettingStarted.css` - Welcome styling
- `src/vs/workbench/browser/parts/editor/tarxLandingPage.ts` - Empty editor landing page
- `src/vs/workbench/browser/parts/editor/media/tarxLandingPage.css` - Landing page CSS

### Extension
- `extensions/tarx-local/src/extension.ts` - Extension activation
- `extensions/tarx-local/src/chatParticipant.ts` - Chat participant registration
- `extensions/tarx-local/src/sidecarService.ts` - LLM sidecar process

### Branding
- `product.json` - Product name, URLs, branding
- `resources/` - Icons and images

## Development Commands

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Launch dev build
./scripts/code.sh

# Watch mode
npm run watch
```

## Important Notes

1. **ELECTRON_RUN_AS_NODE**: Must be unset before launching (handled in code.sh)
2. **CSS Discovery**: Development mode uses CSSDevelopmentService to find CSS modules
3. **Extension Host**: TARX extension runs in the extension host process
4. **Sidecar**: llama-server binary runs as separate process on port 11435

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      TARX Editor                            │
├─────────────────────────────────────────────────────────────┤
│  Workbench                                                  │
│  ├── Welcome Tab (gettingStarted.ts)                       │
│  ├── Landing Page (tarxLandingPage.ts)                     │
│  ├── Chat View (VS Code Chat API)                          │
│  └── Editor Groups                                          │
├─────────────────────────────────────────────────────────────┤
│  Extension Host                                             │
│  └── tarx-local extension                                   │
│      ├── @tarx chat participant                            │
│      ├── Inline completions                                │
│      └── Language model provider                           │
├─────────────────────────────────────────────────────────────┤
│  Sidecar Process                                            │
│  └── llama-server (llama.cpp)                              │
│      └── Qwen2.5-Coder model                               │
└─────────────────────────────────────────────────────────────┘
```

## Current State (Updated Jan 26, 2025)

- Welcome tab shows "TARX Dashboard" with stats row
- @tarx chat participant is functional
- Local LLM inference via llama.cpp sidecar on port 11435
- Embeddings server on port 11437 for RAG
- Inline completions enabled

### Extensions Structure
- `extensions/tarx/` - **Main extension** with RAG, chat context, 14 Figma components
- `extensions/tarx-local/` - Legacy extension (LLM sidecar management)
- `extensions/tarx-supercomputer/` - Remote compute extension

### 14 Figma Components (in tarx extension)
**Core (5):** ArtifactCard, ReactionsBar, LoadingMessage, ErrorMessage, FileHandler
**Specialized (9):** CodeComparisonCard, ErrorDetectionCard, PerformanceMetricsCard, ProjectContextCard, ProjectIntegrationCard, TestGenerationCard, TodoListCard, ReasoningBlock, DeepDiveLink

All components are native TypeScript in `src/vs/workbench/contrib/chat/browser/tarx/`

## Common Tasks

### Modify Welcome Tab
Edit `src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts`
- `buildCategoriesSlide()` - Main welcome content
- Add CSS to `media/gettingStarted.css`

### Modify Empty Editor Landing
Edit `src/vs/workbench/browser/parts/editor/tarxLandingPage.ts`
- Shows when no files are open
- Add CSS to `media/tarxLandingPage.css`

### Modify Chat Behavior
Edit `extensions/tarx-local/src/chatParticipant.ts`
- Handle chat messages
- Stream responses from LLM

### Change Branding
Edit `product.json`:
- `nameLong`: "TARX Dev"
- `nameShort`: "TARX"
- `applicationName`: "tarx-code-oss"
