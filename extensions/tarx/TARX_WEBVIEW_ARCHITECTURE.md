# TARX Webview Architecture

## Overview

The TARX sidebar uses a React-based webview embedded within VS Code's workbench. This document describes the architecture, build pipeline, message protocol, and identifies current issues.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VS Code Workbench                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    TarxSidebarPart.ts                             │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │  │
│  │  │ createWebview   │  │ handleWebview   │  │ sendWebview      │  │  │
│  │  │ Sidebar()       │  │ Message()       │  │ Message()        │  │  │
│  │  └────────┬────────┘  └────────▲────────┘  └────────┬─────────┘  │  │
│  │           │                    │                    │            │  │
│  └───────────┼────────────────────┼────────────────────┼────────────┘  │
│              │                    │                    │               │
│              ▼                    │                    ▼               │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    IWebviewService                                │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │ WebviewElement (pre/index.html outer frame)                 │  │  │
│  │  │  ┌───────────────────────────────────────────────────────┐  │  │  │
│  │  │  │ Inner iframe (loaded via fake.html + document.write)  │  │  │  │
│  │  │  │  ┌─────────────────────────────────────────────────┐  │  │  │  │
│  │  │  │  │              React Application                  │  │  │  │  │
│  │  │  │  │  ┌─────────┐ ┌─────────┐ ┌─────────────────┐   │  │  │  │  │
│  │  │  │  │  │ Header  │ │ NavRow  │ │ Sections        │   │  │  │  │  │
│  │  │  │  │  └─────────┘ └─────────┘ │ - Code          │   │  │  │  │  │
│  │  │  │  │                          │ - Files         │   │  │  │  │  │
│  │  │  │  │                          │ - Projects      │   │  │  │  │  │
│  │  │  │  │                          │ - History       │   │  │  │  │  │
│  │  │  │  │                          └─────────────────┘   │  │  │  │  │
│  │  │  │  └─────────────────────────────────────────────────┘  │  │  │  │
│  │  │  └───────────────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Build Pipeline

### Source Files
```
extensions/tarx/src/webview/ui/
├── index.tsx          # Entry point - mounts React to #root
├── App.tsx            # Main component with state management
├── types.ts           # TypeScript interfaces
├── hooks/
│   └── useVSCodeAPI.ts  # acquireVsCodeApi() wrapper
├── components/
│   ├── Header.tsx
│   ├── NavRow.tsx
│   ├── CollapsibleSection.tsx
│   ├── SectionItem.tsx
│   ├── ProjectsSection.tsx
│   ├── ProjectModal.tsx
│   ├── HistorySection.tsx
│   ├── FilesSection.tsx
│   ├── Footer.tsx
│   ├── ModelLoadingIndicator.tsx
│   └── UploadProgress.tsx
└── styles/
    └── sidebar.css    # All CSS styles
```

### Build Configuration (esbuild.webview.js)
```javascript
{
  entryPoints: ['src/webview/ui/index.tsx'],
  bundle: true,
  outfile: 'out/webview/sidebar.js',
  format: 'iife',           // Immediately Invoked Function Expression
  platform: 'browser',
  target: 'es2020',
  minify: isProd,
  sourcemap: !isProd
}
```

### Output Files
```
extensions/tarx/out/webview/
├── sidebar.js    # ~160KB bundled IIFE (includes React)
└── sidebar.css   # ~20KB copied from src
```

### Build Commands
```bash
# Compile TypeScript + build webview
npm run compile

# Build webview only
npm run compile:webview

# Watch mode
npm run watch:webview
```

## Message Protocol

### Webview → Host (type: 'tarx-webview')

| Command | Data | Description |
|---------|------|-------------|
| `ready` | - | Webview initialized and ready |
| `getProjects` | - | Request projects list |
| `getHistory` | - | Request history items |
| `getConnectionStatus` | - | Request connection status |
| `getUploadedFiles` | - | Request uploaded files list |
| `openChat` | - | Open chat panel |
| `newChat` | - | Create new chat session |
| `openSession` | `{ sessionId, spaceId? }` | Open specific session |
| `openProject` | `{ projectPath }` | Open project folder |
| `createProject` | `{ name, instructions? }` | Create new project |
| `openView` | `{ viewId }` | Open VS Code view |
| `openSettings` | - | Open settings |
| `openFolder` | - | Open folder picker |
| `uploadFile` | `{ filename, content, size, mimeType }` | Upload file |
| `deleteFile` | `{ fileId }` | Delete uploaded file |
| `toggleCollapse` | - | Toggle sidebar collapse |
| `refresh` | - | Refresh all data |

### Host → Webview (type: 'tarx-host')

| Command | Data | Description |
|---------|------|-------------|
| `refresh` | - | Trigger data refresh |
| `projectsLoaded` | `{ projects: TarxProject[] }` | Projects data |
| `historyLoaded` | `{ items: TarxHistoryItem[] }` | History data |
| `uploadedFilesLoaded` | `{ files: TarxUploadedFile[] }` | Files data |
| `connectionStatusChanged` | `{ status: ConnectionStatus }` | Status update |
| `uploadProgress` | `{ text, percent }` | Upload progress |
| `uploadProgressHide` | - | Hide progress indicator |

### Data Types

```typescript
interface TarxProject {
  id: string;
  name: string;
  path: string;
  type: string | null;
  isActive: boolean;
  createdAt: number;
}

interface TarxHistoryItem {
  id: string;
  title: string;
  timestamp: number;
  source: 'claude' | 'tarx';
  spaceId?: string;
  spaceName?: string;
}

interface TarxUploadedFile {
  id: string;
  filename: string;
  size: number;
  uploadedAt: number;
}

type ConnectionStatus = 'online' | 'offline' | 'connecting' | 'reconnecting';
```

## VS Code Webview Architecture (How It Actually Works)

VS Code's webview system uses a two-iframe architecture:

### 1. Outer Frame (pre/index.html)
- Loaded by VS Code's webview service
- Handles communication with the workbench via MessageChannel
- Creates and manages the inner content frame
- Applies VS Code theme styles

### 2. Inner Frame (Content)
- NOT loaded via `srcdoc` (that has issues with service workers)
- Loaded by first navigating to `fake.html` on the correct origin
- Then content is injected using `contentDocument.write(html)`
- VS Code injects `acquireVsCodeApi()` script automatically

### Key Insight: VS Code's Content Injection
```javascript
// VS Code's approach (pre/index.html lines 1080-1087)
function onFrameLoaded(contentDocument) {
  setTimeout(() => {
    contentDocument.open();
    contentDocument.write(newDocument);  // <-- This is how HTML is injected
    contentDocument.close();
  }, 0);
}
```

### acquireVsCodeApi() Injection
VS Code automatically prepends this script to webview content:
```javascript
globalThis.acquireVsCodeApi = (function() {
  const originalPostMessage = window.parent[...].bind(window.parent);
  let acquired = false;
  let state = undefined;

  return () => {
    if (acquired) throw new Error('Already acquired');
    acquired = true;
    return Object.freeze({
      postMessage: function(message, transfer) {
        doPostMessage('onmessage', { message, transfer }, transfer);
      },
      setState: function(newState) {
        state = newState;
        doPostMessage('do-update-state', JSON.stringify(newState));
        return newState;
      },
      getState: function() {
        return state;
      }
    });
  };
})();
```

## Current Issues Identified

### Issue 1: Resource Loading Blocked
**Symptom:** CSS/JS files return 404 or are blocked
**Cause:** `FileAccess.asBrowserUri()` paths don't match actual file locations
**Current workaround:** Inlining CSS/JS content directly into HTML

### Issue 2: Node.js `require('fs')` in Browser Context
**Location:** tarxSidebarPart.ts lines 339-347
**Problem:** The current implementation tries to use Node.js `fs.readFileSync()` to read webview files at runtime:
```typescript
const fs = require('fs');
cssContent = fs.readFileSync(`${webviewBasePath}/sidebar.css`, 'utf8');
jsContent = fs.readFileSync(`${webviewBasePath}/sidebar.js`, 'utf8');
```
**Issue:** This won't work in the browser/Electron renderer process context

### Issue 3: Hardcoded Absolute Paths
**Location:** tarxSidebarPart.ts line 335, 366
```typescript
const webviewBasePath = '/Users/master/Desktop/tarx-code-oss/extensions/tarx/out/webview';
URI.file('/Users/master/Desktop/tarx-code-oss/extensions/tarx/out/webview')
```
**Problem:** These paths are machine-specific and won't work on other systems

### Issue 4: acquireVsCodeApi Already Defined
**Problem:** The React app's `useVSCodeAPI.ts` calls `acquireVsCodeApi()`, but tarxSidebarPart.ts also wraps it:
```typescript
// getWebviewHtml() lines 428-442
const vscode = acquireVsCodeApi();
const tarxVscode = { postMessage: ..., getState: ..., setState: ... };
window.vscode = tarxVscode;
```
**Conflict:** The React app then tries to call `acquireVsCodeApi()` again, which throws "already acquired"

### Issue 5: CSS Variables Not Inherited
**Problem:** Webview iframe doesn't inherit VS Code's CSS variables
**Current workaround:** Hardcoded fallback values in getWebviewHtml()

## Recommended Fixes

### Fix 1: Use VS Code's Built-in Webview Resource Mechanism
Instead of manually reading files, let VS Code handle resource URIs:
```typescript
// Don't inline - use proper webview URIs
const webview = this.webviewService.createWebviewElement({
  contentOptions: {
    localResourceRoots: [
      // Point to the actual extension output directory
      this.extensionUri.with({ path: this.extensionUri.path + '/out/webview' })
    ]
  }
});

// Use webview.asWebviewUri() for resources
const cssUri = webview.asWebviewUri(
  URI.joinPath(this.extensionUri, 'out', 'webview', 'sidebar.css')
);
```

### Fix 2: Don't Re-wrap acquireVsCodeApi
Remove the wrapper script from getWebviewHtml() and let the React app use acquireVsCodeApi() directly. VS Code injects this automatically.

### Fix 3: Remove Hardcoded Paths
Use VS Code's extension APIs to get paths dynamically:
```typescript
// In constructor, get extension URI from service
this.extensionUri = URI.file(path.join(__dirname, '..', '..', '..', 'extensions', 'tarx'));

// Or use IExtensionService to find the extension
const tarxExtension = this.extensionService.extensions.find(e => e.identifier.value === 'tarx');
this.extensionUri = tarxExtension?.extensionLocation;
```

### Fix 4: Copy Webview Files to Accessible Location
Add a gulp task to copy webview files to `out/vs/workbench/browser/parts/tarxsidebar/webview/`:
```javascript
// In gulpfile.mjs
gulp.task('copy-tarx-webview', () => {
  return gulp.src('extensions/tarx/out/webview/**/*')
    .pipe(gulp.dest('out/vs/workbench/browser/parts/tarxsidebar/webview'));
});
```

### Fix 5: Proper CSS Variable Injection
Use VS Code's webview theming mechanism or inject variables at runtime:
```javascript
// Send theme variables to webview after mount
webview.postMessage({
  type: 'tarx-host',
  command: 'themeChanged',
  colors: {
    'sideBar-background': this.themeService.getColorTheme().getColor(SIDE_BAR_BACKGROUND)?.toString(),
    // ... more colors
  }
});
```

## Testing Checklist

- [ ] Webview renders without console errors
- [ ] CSS styles apply correctly (VS Code theme colors)
- [ ] React app mounts to #root
- [ ] acquireVsCodeApi() works without "already acquired" error
- [ ] Message passing works (ready → host sends data → webview displays)
- [ ] Projects list loads
- [ ] History list loads
- [ ] Section collapse/expand works
- [ ] Navigation buttons work (open chat, new chat, etc.)
- [ ] File upload works
- [ ] Theme changes propagate to webview

## File References

| File | Purpose |
|------|---------|
| `extensions/tarx/src/webview/ui/index.tsx` | React entry point |
| `extensions/tarx/src/webview/ui/App.tsx` | Main React component |
| `extensions/tarx/src/webview/ui/hooks/useVSCodeAPI.ts` | VS Code API wrapper |
| `extensions/tarx/esbuild.webview.js` | Webview build config |
| `extensions/tarx/tsconfig.webview.json` | TypeScript config for webview |
| `src/vs/workbench/browser/parts/tarxsidebar/tarxSidebarPart.ts` | Workbench integration |
| `src/vs/workbench/contrib/webview/browser/webview.ts` | IWebviewService interface |
| `src/vs/workbench/contrib/webview/browser/webviewElement.ts` | WebviewElement implementation |
| `src/vs/workbench/contrib/webview/browser/pre/index.html` | Outer webview frame |
