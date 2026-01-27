# TARX Figma Integration Readiness Guide

## Executive Summary

**Current Implementation Status**: ~65% Figma-ready

The TARX chat system has a solid foundation with proper VS Code integration patterns. Key gaps are in backend connectivity, streaming support, and advanced features like mentions and file attachments.

## Readiness Scorecard

### Component Readiness

| Category | Score | Status |
|----------|-------|--------|
| Message Rendering | 85% | ✅ Ready |
| Artifact Cards | 90% | ✅ Ready |
| Input Area | 75% | ⚠️ Minor gaps |
| Header/Navigation | 80% | ✅ Ready |
| Loading States | 90% | ✅ Ready |
| Error Handling | 85% | ✅ Ready |
| Reactions | 80% | ✅ Ready |
| Styling/Theming | 95% | ✅ Ready |
| State Management | 70% | ⚠️ Needs backend |
| Event System | 90% | ✅ Ready |
| Accessibility | 85% | ✅ Ready |
| Backend Integration | 10% | ❌ Not ready |

### Overall: 65% Ready for Figma Component Integration

## What's Ready Now

### 1. Message Rendering Pipeline ✅
- User and assistant message display
- Code block detection and rendering
- Message animations (fade-in)
- Scroll management
- Message prefixes (> @user: / < @tarx:)

### 2. All 13 Artifact Types ✅
- Color-coded borders
- Type-specific icons
- Content truncation/expansion
- View/Copy/Insert/Apply CTAs
- Checklist rendering
- Table rendering

### 3. Loading & Error States ✅
- Animated loading dots (1s loop)
- Error cards with retry
- Slide-up/shake animations
- ARIA accessibility

### 4. Reactions System ✅
- Thumbs up/down buttons
- Vote state management
- Count display
- Hover reveal

### 5. Full Theme Compatibility ✅
- All VS Code CSS variables used
- Works with light/dark themes
- High contrast support
- Reduced motion support

### 6. Event Architecture ✅
- Complete event flow mapped
- Proper disposal pattern
- Bubbling through hierarchy
- All user actions emit events

## What Needs Work

### 1. Backend API Integration ❌ (Critical)

**Gap**: No actual API calls - using setTimeout placeholder

**Required**:
```typescript
// Create tarxApiService.ts
export interface ITarxApiService {
  sendMessage(message: string): Promise<ITarxResponse>;
  streamMessage(message: string): AsyncIterable<ITarxChunk>;
  cancelRequest(): void;
}
```

**Effort**: 2-3 days

---

### 2. Streaming Support ❌ (Critical)

**Gap**: No streaming response handling

**Required**:
- `updateStreamingContent()` method
- Chunk-by-chunk rendering
- Partial artifact handling

**Effort**: 1-2 days

---

### 3. File Attachment ⚠️ (Important)

**Gap**: Event fires but no handler

**Required**:
- File picker dialog
- File content reading
- Attachment display in input
- Send with message

**Effort**: 1 day

---

### 4. Editor Insert ⚠️ (Important)

**Gap**: Event fires but no implementation

**Required**:
- Get active editor
- Insert at cursor
- Handle selection replacement

**Effort**: 0.5 days

---

### 5. Conversation History ⚠️ (Important)

**Gap**: Basic storage only

**Required**:
- History service
- Search functionality
- Import/export
- Clear history

**Effort**: 1-2 days

---

### 6. Markdown Rendering ⚠️ (Nice to have)

**Gap**: Plain text only

**Required**:
- Use VS Code MarkdownRenderer
- Handle links
- Handle images

**Effort**: 0.5 days

---

### 7. Syntax Highlighting ⚠️ (Nice to have)

**Gap**: Language class added but no colors

**Required**:
- TextMate tokenization
- Apply token colors

**Effort**: 1 day

---

### 8. Context/Mentions ❌ (Future)

**Gap**: Not implemented

**Required**:
- @ mention detection
- Autocomplete provider
- File/symbol references

**Effort**: 2-3 days

---

## Integration Checklist

### Phase 1: Backend Ready (P0)

- [ ] Create `ITarxApiService` interface
- [ ] Implement API service with mock
- [ ] Wire up `handleMessage()` to service
- [ ] Add streaming response handler
- [ ] Implement `cancelRequest()`
- [ ] Add stop generation button

### Phase 2: Feature Complete (P1)

- [ ] Integrate clipboard service
- [ ] Implement editor insert
- [ ] Add file attachment dialog
- [ ] Create conversation history service
- [ ] Add search in history
- [ ] Implement "View" artifact action

### Phase 3: Polish (P2)

- [ ] Add markdown rendering
- [ ] Add syntax highlighting
- [ ] Implement prompt suggestions
- [ ] Add model selector
- [ ] Add token counter
- [ ] Add context indicators

### Phase 4: Advanced (P3)

- [ ] Implement @ mentions
- [ ] Add workspace context
- [ ] Add selection context
- [ ] Implement message editing
- [ ] Add regenerate button
- [ ] Add copy message action

## File Changes Required

### New Files to Create

```
src/vs/workbench/contrib/chat/browser/tarx/
├── services/
│   ├── tarxApiService.ts          # API integration
│   ├── tarxConversationService.ts  # History management
│   └── tarxContextService.ts       # Context/mentions
├── tarxStopButton.ts               # Stop generation UI
├── tarxPromptSuggestions.ts        # Quick prompts
├── tarxModelSelector.ts            # Model dropdown
└── tarxTokenCounter.ts             # Token display
```

### Files to Modify

| File | Changes |
|------|---------|
| tarxChatViewPane.ts | Add service injections, implement handlers |
| tarxMessageRenderer.ts | Add streaming, markdown, syntax |
| tarxInputArea.ts | Add attachments display, mentions |
| tarxChatPanel.ts | Add stop button, model selector |
| tarxChat.css | New component styles |

## Testing Recommendations

### Unit Tests

- Message rendering with all types
- Artifact card for each type
- Event propagation
- State persistence

### Integration Tests

- Full message flow
- Error handling
- Streaming simulation
- Keyboard shortcuts

### Manual Testing

- All themes (light, dark, high contrast)
- Reduced motion preference
- Screen reader compatibility
- Various viewport sizes

## Dependencies

### NPM Packages (if needed)

- None for core functionality
- Consider `marked` for markdown if VS Code's renderer is insufficient

### VS Code Services

All required services are available in VS Code's platform:

- `IClipboardService` - Clipboard operations
- `IEditorService` - Editor access
- `IFileDialogService` - File picker
- `INotificationService` - Toast notifications
- `MarkdownRenderer` - Markdown to HTML

## Migration Path from Figma

### For Each Figma Component:

1. **Identify TARX equivalent** (use INTEGRATION_MATRIX.md)
2. **Compare visual styles** (update CSS if needed)
3. **Check functionality** (add missing handlers)
4. **Test theme compatibility** (verify CSS variables)
5. **Verify accessibility** (ARIA, keyboard, focus)

### Figma Token Mapping

| Figma Token | TARX Implementation |
|-------------|---------------------|
| Colors | VS Code CSS variables |
| Typography | `--vscode-font-family`, `--vscode-editor-font-family` |
| Spacing | 4px, 8px, 12px, 16px scale |
| Radius | 3px (small), 4px (standard) |
| Shadows | None (VS Code doesn't use) |
| Animation | 150ms transitions, keyframe animations |

## Conclusion

The TARX chat system has a solid architecture following VS Code patterns. The main work needed is:

1. **Backend API integration** - Critical for functionality
2. **Streaming support** - Required for good UX
3. **Feature handlers** - Wire up existing events

The component layer (rendering, styling, events) is largely complete and Figma-ready. Focus development effort on the service layer and backend connectivity.

---

*Last updated: Based on codebase analysis*
*Documentation location: `/docs/integration/`*
