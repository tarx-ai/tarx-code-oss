# TARX Message Rendering Pipeline

## Overview

The TARX chat system uses a hierarchical component architecture for rendering messages. This document maps the complete rendering pipeline from data input to DOM output.

## Component Hierarchy

```
TarxChatViewPane (ViewPane)
└── TarxChatPanel (orchestrator)
    ├── TarxChatHeader
    ├── TarxRecentConversations
    ├── TarxSessionSummary
    ├── TarxMessageRenderer (message container)
    │   ├── TarxLoadingMessage
    │   ├── TarxErrorMessage
    │   ├── Message Elements
    │   │   ├── Prefix (> @user: / < @tarx:)
    │   │   ├── Content (with code block parsing)
    │   │   ├── TarxArtifactCard[] (13 types)
    │   │   └── TarxReactionsBar (assistant only)
    └── TarxInputArea
```

## Data Flow

### 1. Message Input Flow
```
User Input → TarxInputArea.submit()
           → onDidSubmit event
           → TarxChatPanel.onDidSubmitMessage
           → TarxChatViewPane.handleMessage()
           → chatPanel.addMessage()
           → TarxMessageRenderer.addMessage()
           → renderMessage()
           → DOM update
```

### 2. Message Interface

**File**: `tarxMessageRenderer.ts:32-42`

```typescript
export interface ITarxMessage {
  readonly id: string;
  readonly role: TarxMessageRole;      // 'user' | 'assistant'
  readonly content: string;
  readonly timestamp: number;
  readonly status?: TarxMessageStatus; // 'sending' | 'streaming' | 'complete' | 'error'
  readonly error?: ITarxMessageError;
  readonly artifacts?: ITarxArtifact[];
  readonly reactions?: ITarxMessageReactions;
  readonly isLoading?: boolean;
}
```

## Rendering Methods

### Main Render Entry Point

**File**: `tarxMessageRenderer.ts:156-198`

```typescript
private renderMessage(message: ITarxMessage): void {
  // 1. Check loading state → showLoading()
  // 2. Check error state → showError()
  // 3. Create message container with role-specific class
  // 4. Render prefix (> @user: / < @tarx:)
  // 5. Render content with code block parsing
  // 6. Render artifacts if present
  // 7. Render reactions bar (assistant only)
}
```

### Content Formatting

**File**: `tarxMessageRenderer.ts:200-256`

The `renderFormattedContent()` method handles:
- Plain text rendering
- Code block detection via regex: `/```(\w*)\n?([\s\S]*?)```/g`
- Language-specific class assignment
- Copy button injection for code blocks

### Rendering Hooks Available

| Hook Point | Method | Location |
|------------|--------|----------|
| Before render | `setMessages()` | Clear and re-render all |
| Single add | `addMessage()` | Append single message |
| Update existing | `updateMessage()` | Re-render specific message |
| Clear all | `clear()` | Remove all messages |
| Show loading | `showLoading(label?)` | Append loading indicator |
| Hide loading | `hideLoading()` | Remove loading indicator |
| Show error | `showError(id, error)` | Append error message |

## DOM Structure

### Message Element Structure
```html
<div class="tarx-message tarx-message-{role}" data-message-id="{id}">
  <span class="tarx-message-prefix">> @user:</span>
  <div class="tarx-message-content-wrapper">
    <span class="tarx-message-content">
      <span>Text content...</span>
      <pre class="tarx-code-block">
        <code class="language-{lang}">code content</code>
        <button class="tarx-code-copy">Copy</button>
      </pre>
    </span>
    <div class="tarx-message-artifacts">
      <!-- TarxArtifactCard elements -->
    </div>
  </div>
  <div class="tarx-message-reactions">
    <!-- TarxReactionsBar element -->
  </div>
</div>
```

### Loading Element Structure
```html
<div class="tarx-loading-message" role="status" aria-live="polite">
  <span class="tarx-message-prefix">< @tarx:</span>
  <span class="tarx-loading-dots">
    <span class="tarx-loading-dot">•</span>
    <span class="tarx-loading-dot">•</span>
    <span class="tarx-loading-dot">•</span>
  </span>
  <span class="tarx-loading-label">TARX is thinking...</span>
</div>
```

### Error Element Structure
```html
<div class="tarx-error-message" role="alert" data-message-id="{id}">
  <div class="tarx-error-header">
    <div class="tarx-error-icon"><span class="codicon-error"></span></div>
    <h3 class="tarx-error-title">Error Title</h3>
    <button class="tarx-error-dismiss">×</button>
  </div>
  <p class="tarx-error-description">Error description...</p>
  <div class="tarx-error-actions">
    <button class="tarx-error-retry">Retry</button>
  </div>
</div>
```

## Integration Points for Figma Components

### Where New Components Plug In

1. **Message Types**: Extend `ITarxMessage` interface
2. **Custom Renderers**: Add branches in `renderMessage()`
3. **Inline Elements**: Modify `renderFormattedContent()`
4. **Post-Message UI**: Add after reactions bar in `renderMessage()`
5. **Loading States**: Extend `TarxLoadingMessage` or replace `showLoading()`
6. **Error Handling**: Extend error types in `TarxErrorType`

### Extension Pattern

```typescript
// To add a new message component:
private renderMessage(message: ITarxMessage): void {
  // ... existing checks ...

  // Add new component type check
  if (message.customComponent) {
    this.renderCustomComponent(messageContainer, message);
    return;
  }

  // ... rest of rendering ...
}

private renderCustomComponent(parent: HTMLElement, message: ITarxMessage): void {
  const component = this.instantiationService.createInstance(CustomComponent, { /* options */ });
  component.render(parent);
  // Wire up events...
}
```

## Performance Considerations

1. **Batch Updates**: Use `setMessages()` for bulk operations
2. **Scroll Optimization**: `scrollToBottom()` uses `requestAnimationFrame`
3. **Disposable Pattern**: All event listeners are properly disposed
4. **Lazy Rendering**: Artifacts only rendered if present in message
