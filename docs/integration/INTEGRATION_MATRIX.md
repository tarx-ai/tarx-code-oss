# TARX Integration Points Matrix

## Overview

This matrix maps Figma components to their integration points in the TARX codebase, with specific file locations and method signatures.

## Component Integration Map

### Message Types

| Figma Component | TypeScript File | Interface/Class | Integration Method |
|-----------------|-----------------|-----------------|-------------------|
| User Message | tarxMessageRenderer.ts | `ITarxMessage` | `renderMessage()` |
| Assistant Message | tarxMessageRenderer.ts | `ITarxMessage` | `renderMessage()` |
| System Message | - | **NOT IMPLEMENTED** | Add to `TarxMessageRole` |
| Tool Call Message | - | **NOT IMPLEMENTED** | Add to `ITarxMessage` |
| Streaming Message | tarxMessageRenderer.ts | `status: 'streaming'` | `updateMessage()` |
| Error Message | tarxErrorMessage.ts | `ITarxErrorOptions` | `showError()` |
| Loading Message | tarxLoadingMessage.ts | `TarxLoadingMessage` | `showLoading()` |

### Artifact Types

| Figma Component | TARX Type | Color | Icon | Status |
|-----------------|-----------|-------|------|--------|
| Code Block | `code` | #3b82f6 | Codicon.file | ✅ Implemented |
| Refactored Code | `refactored-code` | #8b5cf6 | Codicon.symbolMethod | ✅ Implemented |
| Test Suite | `tests` | #22c55e | Codicon.beaker | ✅ Implemented |
| Config File | `config` | #f59e0b | Codicon.settingsGear | ✅ Implemented |
| Benchmark | `benchmark` | #ec4899 | Codicon.dashboard | ✅ Implemented |
| Specification | `spec` | #14b8a6 | Codicon.notebook | ✅ Implemented |
| Checklist | `checklist` | #06b6d4 | Codicon.checklist | ✅ Implemented |
| Decision Matrix | `decision-matrix` | #f97316 | Codicon.table | ✅ Implemented |
| Risk Assessment | `risk-assessment` | #ef4444 | Codicon.warning | ✅ Implemented |
| Decision Log | `decision-log` | #eab308 | Codicon.history | ✅ Implemented |
| Comparison | `comparison` | #a855f7 | Codicon.splitHorizontal | ✅ Implemented |
| Multiple Options | `multiple-options` | #6366f1 | Codicon.listFlat | ✅ Implemented |
| Architecture Diagram | `architecture-diagram` | #0891b2 | Codicon.typeHierarchy | ✅ Implemented |
| Image/Media | - | - | - | ❌ Not Implemented |
| File Reference | - | - | - | ❌ Not Implemented |

### UI Components

| Figma Component | TypeScript File | CSS Class | Status |
|-----------------|-----------------|-----------|--------|
| Chat Header | tarxChatHeader.ts | `.tarx-chat-header` | ✅ Implemented |
| New Chat Button | tarxChatHeader.ts | `.tarx-chat-header-button` | ✅ Implemented |
| Settings Button | tarxChatHeader.ts | `.tarx-chat-header-button` | ✅ Implemented |
| Close Button | tarxChatHeader.ts | `.tarx-chat-header-button` | ✅ Implemented |
| Recent Conversations | tarxRecentConversations.ts | `.tarx-recent-conversations` | ✅ Implemented |
| Session Summary | tarxSessionSummary.ts | `.tarx-session-summary` | ✅ Implemented |
| Message Input | tarxInputArea.ts | `.tarx-input-textarea` | ✅ Implemented |
| Send Button | tarxInputArea.ts | `.tarx-send-button` | ✅ Implemented |
| Attach Button | tarxInputArea.ts | `.tarx-input-button` | ✅ Implemented |
| Reactions Bar | tarxReactionsBar.ts | `.tarx-reactions-bar` | ✅ Implemented |
| Thumbs Up | tarxReactionsBar.ts | `.tarx-reaction-btn` | ✅ Implemented |
| Thumbs Down | tarxReactionsBar.ts | `.tarx-reaction-btn` | ✅ Implemented |
| Copy Code Button | tarxMessageRenderer.ts | `.tarx-code-copy` | ✅ Implemented |
| Prompt Suggestions | - | - | ❌ Not Implemented |
| Model Selector | - | - | ❌ Not Implemented |
| Token Counter | - | - | ❌ Not Implemented |
| Context Indicators | - | - | ❌ Not Implemented |

### Actions/CTAs

| Figma Component | Location | Event | Status |
|-----------------|----------|-------|--------|
| View Artifact | tarxArtifactCard.ts | `onDidView` | ✅ Implemented |
| Copy Artifact | tarxArtifactCard.ts | `onDidCopy` | ✅ Implemented |
| Insert Artifact | tarxArtifactCard.ts | `onDidInsert` | ✅ Implemented |
| Apply Refactor | tarxArtifactCard.ts | `onDidApply` | ✅ Implemented |
| Retry Error | tarxErrorMessage.ts | `onDidRetry` | ✅ Implemented |
| Dismiss Error | tarxErrorMessage.ts | `onDidDismiss` | ✅ Implemented |
| Submit Message | tarxInputArea.ts | `onDidSubmit` | ✅ Implemented |
| Attach File | tarxInputArea.ts | `onDidRequestAttach` | ⚠️ Event Only |
| Stop Generation | - | - | ❌ Not Implemented |
| Regenerate | - | - | ❌ Not Implemented |
| Edit Message | - | - | ❌ Not Implemented |
| Copy Message | - | - | ❌ Not Implemented |

## Service Integration Points

### VS Code Services Used

| Service | Injected In | Purpose |
|---------|-------------|---------|
| `IInstantiationService` | TarxChatPanel, TarxMessageRenderer | Create child components |
| `IStorageService` | TarxChatViewPane | Persist session/messages |
| `IHoverService` | TarxChatHeader, TarxInputArea | Button tooltips |
| `IKeybindingService` | TarxChatViewPane | Keyboard handling |
| `IContextMenuService` | TarxChatViewPane | Context menus |
| `IConfigurationService` | TarxChatViewPane | Settings access |
| `IContextKeyService` | TarxChatViewPane | Conditional UI |
| `IViewDescriptorService` | TarxChatViewPane | View registration |
| `IOpenerService` | TarxChatViewPane | Link handling |
| `IThemeService` | TarxChatViewPane | Theme access |

### Services NOT Yet Used (Potential)

| Service | Potential Use |
|---------|---------------|
| `INotificationService` | Toast notifications |
| `IClipboardService` | Clipboard operations |
| `IEditorService` | Insert to editor |
| `IQuickInputService` | Model selector |
| `ICommandService` | Execute commands |
| `ILogService` | Debug logging |
| `ITelemetryService` | Analytics |

## File-to-Integration Mapping

### Core Components

```
tarxChatViewPane.ts
├── Entry point for ViewPane integration
├── Storage service for persistence
├── Keyboard shortcut handling
└── Event coordination to/from panel

tarxChatPanel.ts
├── Panel orchestrator
├── Child component creation
├── Session management
└── Event bubbling

tarxMessageRenderer.ts
├── Message rendering pipeline
├── Loading/error states
├── Artifact card creation
├── Reactions bar creation
└── Code block formatting

tarxInputArea.ts
├── Text input handling
├── Send/attach buttons
├── Keyboard shortcuts
└── Auto-resize logic

tarxArtifactCard.ts
├── 13 artifact type rendering
├── Content truncation/expansion
├── Action button handling
└── Color/icon mapping

tarxReactionsBar.ts
├── Thumbs up/down UI
├── Vote state management
└── Count display
```

### Extension Files

```
tarxChatHeader.ts
└── Header with title + action buttons

tarxRecentConversations.ts
└── Dropdown for conversation history

tarxSessionSummary.ts
└── Current session description

tarxLoadingMessage.ts
└── Animated loading indicator

tarxErrorMessage.ts
└── Error display with retry

tarxChat.css
└── All component styles
```

## Keyboard Shortcut Integration

| Shortcut | Location | Action |
|----------|----------|--------|
| `Ctrl/Cmd+Enter` | tarxInputArea.ts:62 | Submit message |
| `Escape` (empty input) | tarxInputArea.ts:68 | Close panel |
| `Escape` (any) | tarxChatViewPane.ts:105 | Collapse panel |
| `Tab` | tarxChatViewPane.ts:119 | Navigate focusables |
| `Enter/Space` on buttons | All components | Activate button |

## Localization Keys

All user-facing strings use `localize()`:

| Key | Usage |
|-----|-------|
| `tarx.inputPlaceholder` | Input placeholder |
| `tarx.inputAriaLabel` | Input accessibility |
| `tarx.send` | Send button tooltip |
| `tarx.attach` | Attach button tooltip |
| `tarx.loading` | Loading message |
| `tarx.error.*` | Error messages |
| `tarx.artifact.*` | Artifact actions |
| `tarx.reaction.*` | Reaction labels |
| `tarx.recentConversations` | Dropdown label |
| `tarx.viewAll` | View all link |
| `tarx.whatsNext` | New session title |
| `tarx.startConversation` | New session desc |

## Quick Integration Checklist

### To Add New Message Type
- [ ] Extend `TarxMessageRole` in tarxMessageRenderer.ts
- [ ] Add render branch in `renderMessage()`
- [ ] Create CSS class `.tarx-message-{type}`
- [ ] Add prefix style if needed

### To Add New Artifact Type
- [ ] Add to `ArtifactType` union
- [ ] Add to `COLOR_MAP`
- [ ] Add to `ICON_MAP`
- [ ] Add to `TYPE_LABELS`
- [ ] Add render method if special

### To Add New Action Button
- [ ] Add emitter in component
- [ ] Add to `renderActions()` in tarxArtifactCard.ts
- [ ] Wire event in tarxMessageRenderer.ts
- [ ] Handle in tarxChatViewPane.ts

### To Add New Service
- [ ] Add to constructor with `@ServiceDecorator`
- [ ] Add import from platform/
- [ ] Use in methods as needed
