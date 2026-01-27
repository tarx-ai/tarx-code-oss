# Missing Hooks and Utilities for Figma Integration

## Overview

This document identifies hooks, services, and utilities that need to be created or integrated to fully support Figma component designs.

## Critical Missing Hooks

### 1. Backend API Integration

**Current State**: Placeholder timeout in `handleMessage()`

**File**: `tarxChatViewPane.ts:213-226`

```typescript
// TODO: Send to TARX backend and get response
setTimeout(() => {
  this.chatPanel?.hideLoading();
  this.chatPanel?.addMessage({...});
}, 1000);
```

**Needed**:
```typescript
interface ITarxApiService {
  sendMessage(message: string, context?: IChatContext): Promise<ITarxResponse>;
  streamMessage(message: string, context?: IChatContext): AsyncIterable<ITarxChunk>;
  cancelRequest(): void;
}
```

**Priority**: P0 - Critical

---

### 2. Streaming Response Handler

**Current State**: Not implemented

**Needed**:
```typescript
interface ITarxStreamHandler {
  onChunk(chunk: string): void;
  onArtifact(artifact: ITarxArtifact): void;
  onComplete(): void;
  onError(error: Error): void;
}

// In TarxMessageRenderer
updateStreamingContent(messageId: string, content: string): void;
appendStreamingChunk(messageId: string, chunk: string): void;
```

**Priority**: P0 - Critical

---

### 3. Clipboard Service Integration

**Current State**: Direct `navigator.clipboard` usage

**File**: `tarxMessageRenderer.ts:287-300`

**Needed**:
```typescript
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';

// Inject in constructor
@IClipboardService private readonly clipboardService: IClipboardService

// Use
await this.clipboardService.writeText(content);
```

**Priority**: P1 - Important

---

### 4. Editor Insert Service

**Current State**: `onDidInsert` fires but no handler

**Needed**:
```typescript
import { IEditorService } from '../../../../services/editor/common/editorService.js';

private async insertToEditor(content: string): Promise<void> {
  const editor = this.editorService.activeTextEditorControl;
  if (editor) {
    const selection = editor.getSelection();
    editor.executeEdits('tarx', [{
      range: selection,
      text: content,
      forceMoveMarkers: true
    }]);
  }
}
```

**Priority**: P1 - Important

---

### 5. File Attachment Handler

**Current State**: `onDidRequestAttach` fires but no handler

**File**: `tarxInputArea.ts:87-89`

**Needed**:
```typescript
interface ITarxFileAttachment {
  readonly uri: URI;
  readonly name: string;
  readonly content?: string;
  readonly type: 'file' | 'selection' | 'workspace';
}

// File picker integration
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';

private async handleAttach(): Promise<void> {
  const result = await this.fileDialogService.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: true,
    filters: [{ name: 'All Files', extensions: ['*'] }]
  });
  // Process selected files...
}
```

**Priority**: P1 - Important

---

### 6. Conversation History Service

**Current State**: Basic storage, no history management

**Needed**:
```typescript
interface ITarxConversationService {
  // CRUD operations
  getConversations(): Promise<ITarxConversation[]>;
  getConversation(id: string): Promise<ITarxChatSession>;
  saveConversation(session: ITarxChatSession): Promise<void>;
  deleteConversation(id: string): Promise<void>;

  // Search
  searchConversations(query: string): Promise<ITarxConversation[]>;

  // Events
  readonly onDidChangeConversations: Event<void>;
}
```

**Priority**: P1 - Important

---

### 7. Syntax Highlighting for Code Blocks

**Current State**: Language class added but no highlighting

**Needed**:
```typescript
import { ITextMateTokenizationService } from '../../../../services/textMate/browser/textMateTokenizationFeature.js';

private async highlightCode(codeElement: HTMLElement, language: string): Promise<void> {
  // Use VS Code's tokenization service
  const tokens = await this.textMateService.tokenize(content, language);
  // Apply token styles...
}
```

**Priority**: P2 - Nice to have

---

### 8. Markdown Rendering

**Current State**: Plain text with basic code block detection

**Needed**:
```typescript
import { MarkdownRenderer } from '../../../../../base/browser/markdownRenderer.js';

private renderMarkdownContent(container: HTMLElement, content: string): void {
  const result = this.markdownRenderer.render({
    value: content,
    isTrusted: false,
    supportThemeIcons: true,
    supportHtml: false
  });
  container.appendChild(result.element);
  this._register(result);
}
```

**Priority**: P2 - Nice to have

---

### 9. Stop Generation Handler

**Current State**: Not implemented

**Needed**:
```typescript
// In TarxChatPanel
showStopButton(): void;
hideStopButton(): void;

// Event
readonly onDidRequestStop: Event<void>;

// In TarxChatViewPane
private async handleStop(): Promise<void> {
  this.tarxApiService.cancelRequest();
  this.chatPanel?.hideLoading();
  // Add partial message if any
}
```

**Priority**: P2 - Nice to have

---

### 10. Context/Mentions System

**Current State**: Not implemented

**Needed**:
```typescript
interface ITarxMention {
  readonly type: 'file' | 'symbol' | 'workspace' | 'selection';
  readonly reference: string;
  readonly displayName: string;
}

// @ mention detection in input
private detectMentions(text: string): ITarxMention[];

// Autocomplete for mentions
interface ITarxMentionProvider {
  provideMentions(query: string): Promise<ITarxMention[]>;
}
```

**Priority**: P2 - Nice to have

---

## Utility Functions Needed

### 1. Message ID Generator

```typescript
// Currently using Date.now()
// Better approach:
import { generateUuid } from '../../../../../base/common/uuid.js';

const messageId = `msg-${generateUuid()}`;
```

### 2. Throttled Scroll

```typescript
import { Throttler } from '../../../../../base/common/async.js';

private readonly scrollThrottler = new Throttler();

private scrollToBottom(): void {
  this.scrollThrottler.queue(() => {
    return new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        this.container.scrollTop = this.container.scrollHeight;
        resolve();
      });
    });
  });
}
```

### 3. Content Size Calculator

```typescript
// For dynamic artifact expansion
private calculateContentHeight(content: string, maxLines: number): number;
private shouldTruncate(content: string, maxChars: number): boolean;
```

### 4. Relative Time Formatter

```typescript
// Improve tarxRecentConversations.ts:128-148
import { fromNow } from '../../../../../base/common/date.js';

private formatTimestamp(timestamp: number): string {
  return fromNow(timestamp, true);
}
```

## Service Registration Needed

### Register TARX Services

```typescript
// In contribution registration
registerSingleton(ITarxApiService, TarxApiService, InstantiationType.Delayed);
registerSingleton(ITarxConversationService, TarxConversationService, InstantiationType.Delayed);
```

### Service Interfaces

```typescript
// src/vs/workbench/contrib/chat/browser/tarx/tarxServices.ts

export const ITarxApiService = createDecorator<ITarxApiService>('tarxApiService');
export const ITarxConversationService = createDecorator<ITarxConversationService>('tarxConversationService');
```

## Command Registration Needed

```typescript
// Register TARX commands
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: 'tarx.newChat',
      title: localize('tarx.newChat', 'TARX: New Chat'),
      f1: true,
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT,
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }

  run(accessor: ServicesAccessor): void {
    // Open TARX panel and start new chat
  }
});
```

## Configuration Schema Needed

```typescript
// Settings for TARX
configurationRegistry.registerConfiguration({
  id: 'tarx',
  title: 'TARX AI',
  properties: {
    'tarx.defaultModel': {
      type: 'string',
      default: 'tarx-default',
      description: 'Default model for TARX'
    },
    'tarx.showRecentConversations': {
      type: 'boolean',
      default: true,
      description: 'Show recent conversations dropdown'
    },
    'tarx.maxHistorySize': {
      type: 'number',
      default: 50,
      description: 'Maximum number of conversations to store'
    }
  }
});
```

## Priority Summary

| Priority | Category | Items |
|----------|----------|-------|
| P0 | Critical | API Service, Streaming Handler |
| P1 | Important | Clipboard, Editor Insert, File Attach, History Service |
| P2 | Nice to have | Syntax Highlight, Markdown, Stop, Context/Mentions |
