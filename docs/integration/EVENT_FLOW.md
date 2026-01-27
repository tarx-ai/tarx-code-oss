# TARX Event Flow Architecture

## Overview

The TARX chat system uses VS Code's event pattern (`Emitter<T>` / `Event<T>`) for all inter-component communication. This document maps all events and their flow paths.

## Event Pattern

All components follow this pattern:

```typescript
import { Emitter, Event } from '../../../../../base/common/event.js';

export class Component extends Disposable {
  // Private emitter (fires events)
  private readonly _onDidSomething = this._register(new Emitter<PayloadType>());

  // Public event (subscribers connect here)
  readonly onDidSomething: Event<PayloadType> = this._onDidSomething.event;

  // Firing the event
  private doSomething(): void {
    this._onDidSomething.fire(payload);
  }
}
```

## Complete Event Map

### TarxChatHeader
**File**: `tarxChatHeader.ts`

| Event | Payload | Triggered By |
|-------|---------|--------------|
| `onDidRequestNewChat` | `void` | + button click |
| `onDidRequestSettings` | `void` | Settings button click |
| `onDidRequestMenu` | `void` | ... button click |
| `onDidRequestClose` | `void` | × button click |

### TarxRecentConversations
**File**: `tarxRecentConversations.ts`

| Event | Payload | Triggered By |
|-------|---------|--------------|
| `onDidSelectConversation` | `string` (id) | Conversation item click |
| `onDidRequestViewAll` | `void` | "View all" button click |

### TarxInputArea
**File**: `tarxInputArea.ts`

| Event | Payload | Triggered By |
|-------|---------|--------------|
| `onDidSubmit` | `string` (message) | Ctrl/Cmd+Enter or Send click |
| `onDidRequestAttach` | `void` | Attach button click |
| `onDidRequestClose` | `void` | Escape key (empty input) |

### TarxMessageRenderer
**File**: `tarxMessageRenderer.ts`

| Event | Payload | Triggered By |
|-------|---------|--------------|
| `onDidRetryMessage` | `string` (messageId) | Error retry button |
| `onDidReactToMessage` | `{ messageId: string; type: ReactionType }` | Reaction button |
| `onDidViewArtifact` | `ITarxArtifact` | Artifact "View" button |
| `onDidCopyArtifact` | `string` (content) | Artifact "Copy" button |
| `onDidInsertArtifact` | `string` (content) | Artifact "Insert" button |

### TarxArtifactCard
**File**: `tarxArtifactCard.ts`

| Event | Payload | Triggered By |
|-------|---------|--------------|
| `onDidView` | `ITarxArtifact` | View button |
| `onDidCopy` | `string` (content) | Copy button |
| `onDidInsert` | `string` (content) | Insert button |
| `onDidApply` | `ITarxArtifact` | Apply button (refactored-code) |

### TarxReactionsBar
**File**: `tarxReactionsBar.ts`

| Event | Payload | Triggered By |
|-------|---------|--------------|
| `onDidReact` | `{ messageId: string; type: ReactionType }` | Thumbs up/down click |

### TarxChatPanel
**File**: `tarxChatPanel.ts`

| Event | Payload | Triggered By |
|-------|---------|--------------|
| `onDidSubmitMessage` | `string` | Bubbled from InputArea |
| `onDidRequestNewChat` | `void` | Bubbled from Header |
| `onDidRequestClose` | `void` | Bubbled from Header/InputArea |
| `onDidSelectConversation` | `string` (id) | Bubbled from RecentConversations |

### TarxErrorMessage
**File**: `tarxErrorMessage.ts`

| Event | Payload | Triggered By |
|-------|---------|--------------|
| `onDidRetry` | `void` | Retry button |
| `onDidDismiss` | `void` | Dismiss button |

## Event Flow Diagrams

### Message Submit Flow

```
User types message
        │
        ▼
┌─────────────────┐
│  TarxInputArea  │
│  Ctrl+Enter     │
└────────┬────────┘
         │ onDidSubmit(message)
         ▼
┌─────────────────┐
│  TarxChatPanel  │
│  (bubbles up)   │
└────────┬────────┘
         │ onDidSubmitMessage(message)
         ▼
┌─────────────────┐
│TarxChatViewPane │
│ handleMessage() │
└────────┬────────┘
         │
         ├──► addMessage(userMsg)
         │
         ├──► showLoading()
         │
         ├──► [API Call - TODO]
         │
         ├──► hideLoading()
         │
         └──► addMessage(assistantMsg)
```

### Artifact Interaction Flow

```
User clicks artifact action
        │
        ▼
┌─────────────────┐
│ TarxArtifactCard│
│ onDidView/Copy/ │
│ Insert/Apply    │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ TarxMessageRenderer │
│ onDidViewArtifact/  │
│ CopyArtifact/       │
│ InsertArtifact      │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  TarxChatViewPane   │
│  (handle action)    │
│  - View: Open panel │
│  - Copy: Clipboard  │
│  - Insert: Editor   │
└─────────────────────┘
```

### Reaction Flow

```
User clicks thumbs up/down
        │
        ▼
┌─────────────────┐
│ TarxReactionsBar│
│ onDidReact      │
└────────┬────────┘
         │ { messageId, type }
         ▼
┌─────────────────────┐
│ TarxMessageRenderer │
│ onDidReactToMessage │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  TarxChatViewPane   │
│  - Update state     │
│  - Send to API      │
└─────────────────────┘
```

### Error Retry Flow

```
Error displayed
        │
        ▼
┌─────────────────┐
│ TarxErrorMessage│
│ User clicks     │
│ "Retry"         │
└────────┬────────┘
         │ onDidRetry()
         ▼
┌─────────────────────┐
│ TarxMessageRenderer │
│ onDidRetryMessage   │
│ (messageId)         │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  TarxChatViewPane   │
│  - Remove error     │
│  - Retry API call   │
└─────────────────────┘
```

## Event Subscription Pattern

### In Parent Components
```typescript
// TarxChatPanel subscribing to child events
this._register(this.header.onDidRequestNewChat(() => this._onDidRequestNewChat.fire()));
this._register(this.inputArea.onDidSubmit(message => this._onDidSubmitMessage.fire(message)));
```

### In ViewPane
```typescript
// TarxChatViewPane handling events
this._register(this.chatPanel.onDidSubmitMessage(message => {
  this.handleMessage(message);
}));

this._register(this.chatPanel.onDidRequestNewChat(() => {
  this.startNewChat();
}));
```

## Disposable Pattern

All events are properly disposed via `_register()`:

```typescript
export class Component extends Disposable {
  constructor() {
    super();
  }

  // Emitter is auto-disposed
  private readonly _onDidX = this._register(new Emitter<T>());

  // Listener is auto-disposed
  setupListeners() {
    this._register(someEvent((payload) => {
      // Handle event
    }));
  }
}
```

## Integration Points

### Adding New Events

1. **Define emitter in component**:
```typescript
private readonly _onDidCustomEvent = this._register(new Emitter<CustomPayload>());
readonly onDidCustomEvent: Event<CustomPayload> = this._onDidCustomEvent.event;
```

2. **Fire event**:
```typescript
this._onDidCustomEvent.fire({ data: 'value' });
```

3. **Bubble up through hierarchy**:
```typescript
// In parent component
this._register(child.onDidCustomEvent(payload => {
  this._onDidCustomEvent.fire(payload);
}));
```

4. **Handle in ViewPane**:
```typescript
this._register(this.chatPanel.onDidCustomEvent(payload => {
  this.handleCustomEvent(payload);
}));
```

### Event Payload Types

```typescript
// Define in types file or component
export interface ICustomEventPayload {
  readonly id: string;
  readonly action: 'create' | 'update' | 'delete';
  readonly data?: unknown;
}
```
