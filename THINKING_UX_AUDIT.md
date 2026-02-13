# TARX V1 Thinking Token UX Audit

**Date:** 2026-02-12
**Auditor:** Claude Opus 4.5
**Fork Version:** VS Code 1.96.0

## Executive Summary

VS Code 1.96.0 already has thinking token infrastructure. PATH A applies: adapt existing infrastructure rather than building from scratch.

## 1. Fork Version

```json
// package.json
"version": "1.96.0"
```

This is pre-1.109, but the fork already includes thinking token rendering infrastructure.

## 2. Thinking Token Infrastructure

### EXISTS ✅

| Component | Location | Status |
|-----------|----------|--------|
| `ChatThinkingContentPart` | `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatThinkingContentPart.ts` | 902 lines, fully implemented |
| `ThinkingDisplayMode` enum | `src/vs/workbench/contrib/chat/common/constants.ts` | 3 modes defined |
| `thinkingMapper.ts` | `extensions/tarx/src/thinkingMapper.ts` | 105 lines, maps Qwen format |
| `tarxClient.ts` | `extensions/tarx/src/tarxClient.ts` | Streaming client |

### Key Classes & Interfaces

**`chatThinkingContentPart.ts`:**
```typescript
export class ChatThinkingContentPart extends ChatCollapsibleContentPart {
  // Reads config for display mode
  this.configurationService.getValue<ThinkingDisplayMode>('chat.agent.thinkingStyle')

  // Key methods:
  updateThinking(thinkingPart: IChatThinkingPart)  // Update with new content
  finalizeTitleIfDefault()                          // Set title when done
  renderMarkdown()                                  // Render thinking content
}
```

**`constants.ts`:**
```typescript
export enum ThinkingDisplayMode {
  Collapsed = 'collapsed',           // Fully collapsed, click to expand
  CollapsedPreview = 'collapsedPreview',  // Shows preview snippet
  FixedScrolling = 'fixedScrolling', // Fixed height with scroll
}

// Config key
ChatConfiguration.ThinkingStyle = 'chat.agent.thinkingStyle'
```

**`thinkingMapper.ts`:**
```typescript
export interface QwenStreamChunk {
  choices: [{
    delta: {
      reasoning_content?: string;  // Thinking tokens
      content?: string;            // Response tokens
    };
    finish_reason?: string | null;
  }];
}

export function mapQwenToThinking(chunk: QwenStreamChunk): MappedChunk {
  const delta = choice.delta;
  if (delta.reasoning_content) {
    return { thinking: { kind: 'thinking', content: delta.reasoning_content }, done };
  }
  if (delta.content) {
    return { content: delta.content, done };
  }
  return { done };
}

// ThinkingAccumulator for buffering stream chunks
export class ThinkingAccumulator {
  private thinkingBuffer = '';
  private contentBuffer = '';
  // ...
}
```

## 3. Current Gap

**`tarxClient.ts` (line ~150):**
```typescript
// Handle both standard content and reasoning_content
const content = delta?.content || delta?.reasoning_content;
if (content) {
  yield content;  // ❌ MERGES thinking and content
}
```

The client currently combines `reasoning_content` and `content` into a single stream, losing the distinction needed for proper thinking UI display.

## 4. TARX Sidebar Files

```
extensions/tarx/src/
├── chatPanel.ts           # Webview chat panel
├── healthService.ts       # Health checking
├── tarxClient.ts          # LLM client
├── thinkingMapper.ts      # Qwen stream mapper
├── router.ts              # LOCAL/NETWORK routing
├── webview/
│   └── ui/
│       ├── App.tsx
│       ├── components/
│       │   ├── ChatMessage.tsx
│       │   ├── ChatInput.tsx
│       │   ├── Footer.tsx
│       │   └── ThinkingBlock.tsx  # May exist or need creation
│       └── hooks/
```

## 5. Path Decision

### PATH A: Adapt Existing Infrastructure ✅

**Rationale:**
1. `ChatThinkingContentPart` already exists with full UI (collapsible, streaming, markdown)
2. `thinkingMapper.ts` already handles Qwen's `reasoning_content` field
3. `ThinkingAccumulator` already buffers and separates thinking/content
4. Only gap is wiring the separated streams to VS Code's rendering

**Required Changes:**

1. **`tarxClient.ts`**: Modify `chatCompletionStream()` to yield structured objects instead of raw strings:
   ```typescript
   yield { type: 'thinking', content: delta.reasoning_content };
   yield { type: 'content', content: delta.content };
   ```

2. **`chatPanel.ts`**: Update to handle structured chunks and create `IChatThinkingPart` objects

3. **Config**: Ensure `chat.agent.thinkingStyle` defaults to `collapsedPreview`

## 6. Model Behavior Confirmed

From deployment testing, the fine-tuned TARX model (tarx-qwen3-8b-Q4_K_M.gguf) uses:
- `reasoning_content` field for chain-of-thought (not `<think>` tags in content)
- Separate `content` field for final response
- OpenAI-compatible streaming format

Sample stream chunk:
```json
{
  "choices": [{
    "delta": {
      "reasoning_content": "Let me think about this...",
      "content": null
    }
  }]
}
```

## 7. Baseline Checklist

| Item | Status |
|------|--------|
| Fork version identified | ✅ 1.96.0 |
| Thinking infrastructure exists | ✅ chatThinkingContentPart.ts |
| Path determined | ✅ PATH A (adapt) |
| Gap identified | ✅ Stream merging in tarxClient |
| TARX sidebar files located | ✅ extensions/tarx/src/ |
| Model format confirmed | ✅ reasoning_content field |

## Next Steps (Track 2)

1. Modify `tarxClient.ts` to yield structured stream chunks
2. Update consumer (chatPanel.ts or equivalent) to create thinking parts
3. Verify VS Code's `ChatThinkingContentPart` receives and renders thinking
4. Test with actual TARX model on port 11435

---
*Audit complete. Proceeding to Track 2.*
