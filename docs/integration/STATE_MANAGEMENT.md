# TARX State Management

## Overview

The TARX chat system uses a layered state management approach combining VS Code's storage services, local component state, and event-driven updates.

## State Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Persistence Layer (IStorageService)                        │
│  └── Workspace-scoped session & message storage             │
├─────────────────────────────────────────────────────────────┤
│  View State (TarxChatViewPane)                              │
│  └── Current session reference, view lifecycle              │
├─────────────────────────────────────────────────────────────┤
│  Panel State (TarxChatPanel)                                │
│  └── Session object, child component coordination           │
├─────────────────────────────────────────────────────────────┤
│  Component State (Individual Components)                     │
│  └── UI state (expanded/collapsed, hover, focus)            │
└─────────────────────────────────────────────────────────────┘
```

## Storage Keys

**File**: `tarxChatViewPane.ts:21-22`

```typescript
const MESSAGES_STORAGE_KEY = 'tarx.chat.messages';
const SESSION_STORAGE_KEY = 'tarx.chat.session';
```

## Session Interface

**File**: `tarxChatPanel.ts:24-31`

```typescript
export interface ITarxChatSession {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly messages: ITarxMessage[];
  readonly createdAt: number;
  readonly updatedAt: number;
}
```

## State Operations

### Session Lifecycle

#### Creating a New Session
**File**: `tarxChatViewPane.ts:229-245`

```typescript
private startNewChat(): void {
  // 1. Clear existing storage
  this.storageService.remove(SESSION_STORAGE_KEY, StorageScope.WORKSPACE);
  this.storageService.remove(MESSAGES_STORAGE_KEY, StorageScope.WORKSPACE);

  // 2. Create new session object
  this.chatPanel.setSession({
    id: `session-${Date.now()}`,
    title: 'New Chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
```

#### Loading Persisted Session
**File**: `tarxChatViewPane.ts:143-164`

```typescript
private loadPersistedSession(): void {
  try {
    const sessionData = this.storageService.get(SESSION_STORAGE_KEY, StorageScope.WORKSPACE);
    const messagesData = this.storageService.get(MESSAGES_STORAGE_KEY, StorageScope.WORKSPACE);

    if (sessionData && this.chatPanel) {
      const session = JSON.parse(sessionData);
      const messages: ITarxMessage[] = messagesData ? JSON.parse(messagesData) : [];

      this.chatPanel.setSession({ ...session, messages });
    } else {
      this.chatPanel?.setSession(undefined);
    }
  } catch {
    this.chatPanel?.setSession(undefined);
  }
}
```

#### Saving Session
**File**: `tarxChatViewPane.ts:169-187`

```typescript
private saveSession(): void {
  if (!this.chatPanel?.session) return;

  const session = this.chatPanel.session;

  // Session metadata (without messages for efficiency)
  const sessionData = JSON.stringify({
    id: session.id,
    title: session.title,
    description: session.description,
    createdAt: session.createdAt,
    updatedAt: Date.now()
  });

  // Messages stored separately
  const messagesData = JSON.stringify(session.messages);

  this.storageService.store(SESSION_STORAGE_KEY, sessionData, StorageScope.WORKSPACE, StorageTarget.USER);
  this.storageService.store(MESSAGES_STORAGE_KEY, messagesData, StorageScope.WORKSPACE, StorageTarget.USER);
}
```

### Message State

#### Message Array Location
**File**: `tarxMessageRenderer.ts:61`

```typescript
private messages: ITarxMessage[] = [];
```

#### Message Operations

| Operation | Method | Behavior |
|-----------|--------|----------|
| Set all | `setMessages(messages)` | Replaces all, re-renders |
| Add one | `addMessage(message)` | Appends, renders single |
| Update one | `updateMessage(id, updates)` | Merges, re-renders all |
| Get all | `getMessages()` | Returns copy of array |
| Clear | `clear()` | Empties array, clears DOM |

### Component State

#### TarxInputArea
```typescript
private isSending = false;  // Prevents duplicate submissions
```

#### TarxRecentConversations
```typescript
private conversations: ITarxConversation[] = [];
private isOpen = false;  // Dropdown state
```

#### TarxArtifactCard
```typescript
private isExpanded = false;  // Content expansion state
```

#### TarxReactionsBar
```typescript
private currentVote: ReactionType | null = null;
private counts = { thumbsUp: 0, thumbsDown: 0 };
```

## State Flow Diagram

```
┌─────────────┐     setSession()      ┌──────────────┐
│   Storage   │ ──────────────────►   │  ChatPanel   │
│  (persist)  │                       │   (state)    │
└─────────────┘                       └──────────────┘
       ▲                                     │
       │ saveSession()                       │ setMessages()
       │                                     ▼
┌─────────────┐                       ┌──────────────┐
│  ViewPane   │ ◄───── events ─────   │  Renderer    │
│ (lifecycle) │                       │  (display)   │
└─────────────┘                       └──────────────┘
       ▲                                     ▲
       │ handleMessage()                     │ addMessage()
       │                                     │
┌─────────────┐     onDidSubmit       ┌──────────────┐
│  InputArea  │ ──────────────────►   │   Panel      │
│   (input)   │                       │   (coord)    │
└─────────────┘                       └──────────────┘
```

## Storage Service Usage

### Injection Pattern
**File**: `tarxChatViewPane.ts:52`

```typescript
@IStorageService private readonly storageService: IStorageService
```

### Storage Scopes

| Scope | Use Case |
|-------|----------|
| `StorageScope.WORKSPACE` | Current workspace session data |
| `StorageScope.APPLICATION` | User preferences across workspaces |
| `StorageScope.PROFILE` | Profile-specific settings |

### Storage Targets

| Target | Use Case |
|--------|----------|
| `StorageTarget.USER` | Synced user data |
| `StorageTarget.MACHINE` | Machine-local data |

## State Synchronization Points

### On Session Change
```typescript
setSession(session: ITarxChatSession | undefined): void {
  this._session = session;

  if (session) {
    this.header.setTitle(session.title || 'TARX');
    this.sessionSummary.update({
      isNew: session.messages.length === 0,
      title: session.title,
      description: session.description,
    });
    this.messageRenderer.setMessages(session.messages);
  } else {
    this.header.setTitle('TARX');
    this.sessionSummary.update({ isNew: true });
    this.messageRenderer.setMessages([]);
  }
}
```

### On Message Add
```typescript
addMessage(message: ITarxMessage): void {
  this.messageRenderer.addMessage(message);
  if (this._session) {
    this._session.messages.push(message);
  }
}
```

## Integration Points for State

### Extending Session Data
```typescript
// Extend the session interface
export interface ITarxChatSession {
  // ... existing fields ...
  readonly customField?: CustomType;
}
```

### Adding New Storage Keys
```typescript
const CUSTOM_STORAGE_KEY = 'tarx.chat.custom';

// Save
this.storageService.store(CUSTOM_STORAGE_KEY, JSON.stringify(data),
  StorageScope.WORKSPACE, StorageTarget.USER);

// Load
const data = this.storageService.get(CUSTOM_STORAGE_KEY, StorageScope.WORKSPACE);
```

### Custom State Service (Future)
For complex state requirements, consider:
```typescript
export interface ITarxChatStateService {
  readonly session: ITarxChatSession | undefined;
  readonly onDidSessionChange: Event<ITarxChatSession | undefined>;

  createSession(): ITarxChatSession;
  loadSession(id: string): Promise<ITarxChatSession>;
  saveSession(): Promise<void>;
  deleteSession(id: string): Promise<void>;
}
```
