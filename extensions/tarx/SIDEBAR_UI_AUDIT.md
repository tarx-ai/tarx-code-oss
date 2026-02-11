# TARX Sidebar UI Audit - Migration to WebviewViewProvider

**Generated:** 2026-01-31
**Source:** `src/vs/workbench/browser/parts/tarxsidebar/tarxSidebarPart.ts`
**Target:** `extensions/tarx/src/webview/TarxSidebarProvider.ts`

---

## Current Architecture

The current sidebar is implemented as a **VS Code Core Part** (`TarxSidebarPart`), extending `AbstractPaneCompositePart`. This gives full control over the sidebar but creates coupling with VS Code internals.

### Key Files
- `src/vs/workbench/browser/parts/tarxsidebar/tarxSidebarPart.ts` (1925 lines)
- `src/vs/workbench/browser/parts/tarxsidebar/media/tarxSidebarPart.css` (1498 lines)
- `src/vs/workbench/browser/parts/tarxsidebar/tarxProjectModal.ts`
- `src/vs/workbench/browser/parts/tarxsidebar/extensionsView.ts`

---

## UI Structure to Preserve

### 1. Header Section
```
┌─────────────────────────────────────┐
│ [Logo Icon]  Good Morning, Holly    │
└─────────────────────────────────────┘
```

**Components:**
- TARX logo icon (18x18px) - `media/tarx-logo.png`
- Greeting text (dynamic: Morning/Afternoon/Evening + name)
- Height: 35px
- Padding: 0 12px

**Behavior:**
- Greeting updates based on time of day
- Logo visible in both expanded and collapsed states

---

### 2. Model Loading Indicator
```
┌─────────────────────────────────────┐
│        [Spinner]                    │
│   Starting TARX engine...           │
│   This may take a moment            │
└─────────────────────────────────────┘
```

**Components:**
- Spinner animation (32x32px, CSS animation)
- Main text: "Starting TARX engine..."
- Subtext: "This may take a moment on first launch"

**Behavior:**
- Shows when `connectionStatus === 'connecting'`
- Hides nav rows and sections when visible

---

### 3. Nav Rows
```
┌─────────────────────────────────────┐
│ [Comment] Chat                  [+] │
└─────────────────────────────────────┘
```

**Components:**
- Chat row with `commentDiscussion` icon
- Hover reveals [+] button for new chat
- Padding: 8px 12px, margin: 0 8px

**Commands:**
- Row click: `workbench.action.chat.open`
- [+] button: `tarx.chat.new`

**Note:** Voice row is disabled for V1

---

### 4. Collapsible Sections

#### 4.1 CODE Section (collapsed by default)
```
┌─────────────────────────────────────┐
│ [Code] Code                     [v] │
├─────────────────────────────────────┤
│     [SCM] Source Control            │
│     [Bug] Run & Debug               │
│     [Terminal] Terminal             │
└─────────────────────────────────────┘
```

**Items:**
- Source Control → `workbench.view.scm`
- Run & Debug → `workbench.view.debug`
- Terminal → `workbench.action.terminal.toggleTerminal`

**Behavior:**
- Opens in Auxiliary Bar (right side), NOT primary sidebar

#### 4.2 FILES Section (collapsed by default)
```
┌─────────────────────────────────────┐
│ [Files] Files           [Upload] [v]│
├─────────────────────────────────────┤
│     [Folder] Explorer               │
│     [Search] Search                 │
│     ─────────────────               │
│     UPLOADED                        │
│     [File] document.pdf    1.2 MB [x]│
└─────────────────────────────────────┘
```

**Items:**
- Explorer → `workbench.view.explorer`
- Search → `workbench.view.search`
- Divider + Uploaded files list

**Upload Button:**
- Opens native file picker
- Accepts: `.txt,.md,.pdf,.doc,.docx,.py,.js,.ts,.json,.yaml,.yml,.xml,.html,.css`
- Command: `tarx.uploadFile`

**Drag & Drop:**
- Section has `drag-over` class when files dragged over
- Shows "Drop files here or click 📎" when empty

#### 4.3 PROJECTS Section (expanded by default)
```
┌─────────────────────────────────────┐
│ [Project] Projects          [+] [v] │
├─────────────────────────────────────┤
│     [Folder] tarx-code-oss    (active)│
│     [Folder] other-project          │
│     [FolderOpen] Open Folder...     │
└─────────────────────────────────────┘
```

**Empty State:**
```
│     No projects yet                 │
│     + Create Project                │
```

**Data Source:** `tarx.projects.list` command
**Create Project:** Opens `TarxProjectModal` with name + instructions fields
**Open Project:** `tarx.projects.open` with project path

#### 4.4 HISTORY Section (expanded by default)
```
┌─────────────────────────────────────┐
│ [History] History           [→] [v] │
├─────────────────────────────────────┤
│     TODAY                           │
│     [Claude] Bug fix discussion  2h │
│     [TARX] Code review          3h  │
│     YESTERDAY                       │
│     [Claude] API design         1d  │
│     THIS WEEK                       │
│     [TARX] Performance tuning   3d  │
└─────────────────────────────────────┘
```

**Icons:**
- Claude conversations: Claude SVG logo (orange)
- TARX conversations: `media/tarx-eyes.png`

**Data Sources (parallel loading):**
- `tarx.getConversationHistory` (legacy table)
- `tarx.getSessionHistory` (MCP sessions table)

**Time Grouping:**
- Today: timestamp >= todayStart
- Yesterday: timestamp >= yesterdayStart
- This Week: timestamp >= weekStart (6 days ago)

**Time Format:** `Xm ago`, `Xh ago`, `Xd ago`, or `Mon DD`

---

### 5. Footer Section
```
┌─────────────────────────────────────┐
│ [CPU] Compute                   [v] │
│ [Extensions] Extensions             │
│ [Gear] Settings                     │
│ [Sidebar] Collapse                  │
└─────────────────────────────────────┘
```

#### 5.1 Compute Dropdown
```
┌─────────────────────────────────────┐
│ [●] TARX LOCAL                  [✓] │
│ [○] TARX NETWORK (Coming Soon)  [ ] │
└─────────────────────────────────────┘
```

**Status Indicators:**
- Green dot: Online
- Yellow pulsing dot: Connecting
- Gray dot: Offline

#### 5.2 Extensions Row
- Opens custom `TarxExtensionsModal` (not native VS Code extensions)

#### 5.3 Settings Row
- Command: `workbench.action.openSettings`

#### 5.4 Collapse Row
- Toggles between 48px (collapsed) and 240px (expanded)
- Stores width preference in `StorageScope.PROFILE`
- Icon: `layoutSidebarLeft` / `layoutSidebarLeftOff`

---

## CSS Design Tokens

```css
--tarx-sidebar-width: 240px;
--tarx-sidebar-collapsed-width: 48px;
--tarx-spacing-xs: 4px;
--tarx-spacing-sm: 8px;
--tarx-spacing-md: 12px;
--tarx-spacing-lg: 16px;
--tarx-radius-sm: 4px;
--tarx-radius-md: 6px;
--tarx-transition-fast: 0.15s ease;
--tarx-transition-normal: 0.2s ease;
--tarx-font-xs: 10px;
--tarx-font-sm: 11px;
--tarx-font-md: 12px;
--tarx-font-lg: 13px;
--tarx-icon-size: 16px;
--tarx-icon-gap: 8px;
```

---

## VS Code CSS Variables Used

```css
--vscode-sideBar-background
--vscode-sideBar-foreground
--vscode-sideBarSectionHeader-border
--vscode-list-hoverBackground
--vscode-list-activeSelectionBackground
--vscode-button-background
--vscode-button-foreground
--vscode-button-hoverBackground
--vscode-button-secondaryBackground
--vscode-button-secondaryHoverBackground
--vscode-textLink-foreground
--vscode-input-background
--vscode-input-foreground
--vscode-input-border
--vscode-focusBorder
--vscode-dropdown-background
--vscode-dropdown-border
--vscode-scrollbarSlider-background
--vscode-scrollbarSlider-hoverBackground
--vscode-testing-iconPassed
--vscode-charts-yellow
--vscode-progressBar-background
--vscode-errorForeground
--vscode-descriptionForeground
```

---

## Commands Required

### Read Commands
- `tarx.getConnectionStatus` → `{ status, isOnline }`
- `tarx.projects.list` → `TarxProject[]`
- `tarx.getConversationHistory` → `{ conversations, turns }`
- `tarx.getSessionHistory` → `{ sessions }`
- `tarx.getUploadedFiles` → `Array<{ id, filename, size, uploadedAt }>`

### Action Commands
- `workbench.action.chat.open`
- `tarx.chat.new`
- `tarx.projects.create`
- `tarx.projects.open`
- `tarx.uploadFile`
- `tarx.deleteUploadedFile`
- `tarx.openSession`
- `tarx.openConversation`
- `tarx.history.showAll`
- `tarx.showUploadProgress`
- `tarx.hideUploadProgress`
- `tarx.projects.refresh`
- `tarx.history.refresh`
- `workbench.view.scm`
- `workbench.view.debug`
- `workbench.view.explorer`
- `workbench.view.search`
- `workbench.action.terminal.toggleTerminal`
- `workbench.action.openSettings`
- `workbench.action.files.openFolder`

---

## State Management

### Persisted (StorageScope)
- `tarx.supercomputer.enabled` (APPLICATION)
- `tarx.sidebar.collapsed` (PROFILE)
- `tarx.sidebar.expandedWidth` (PROFILE)
- `tarx.sidebar.connectionStatus` (APPLICATION)

### Runtime State
- `sectionState: Map<string, boolean>` - collapse state per section
- `historyItems: TarxHistoryItem[]`
- `projects: TarxProject[]`
- `uploadedFiles: Array<...>`
- `connectionStatus: 'online' | 'offline' | 'connecting' | 'reconnecting'`
- `isCollapsed: boolean`

---

## Migration Checklist

- [ ] Create webview directory structure
- [ ] Implement `TarxSidebarProvider` with `resolveWebviewView`
- [ ] Create React App component
- [ ] Port all CSS to sidebar.css
- [ ] Implement message passing for all commands
- [ ] Create reusable components:
  - [ ] Header
  - [ ] NavRow
  - [ ] CollapsibleSection
  - [ ] SectionItem
  - [ ] HistoryGroup
  - [ ] HistoryItem
  - [ ] Footer
  - [ ] ComputeDropdown
  - [ ] ProjectModal
- [ ] Set up esbuild for webview bundling
- [ ] Register provider in extension.ts
- [ ] Update package.json with webview view
- [ ] Test all functionality
- [ ] Disable old tarxSidebarPart.ts

---

## Assets to Copy

- `media/tarx-logo.png` (18x18)
- `media/tarx-eyes.png` (16x16)
- Claude SVG logo (inline data URI)
- Codicon fonts (via VS Code webview)
