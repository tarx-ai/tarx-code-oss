# Thinking Tokens Test Guide

## Overview

This document explains how to test the Qwen 8.2B reasoning_content integration with VS Code thinking tokens.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Qwen 8.2B (localhost:11435)                                │
│  Emits: reasoning_content → content                         │
└────────────────────┬────────────────────────────────────────┘
                     │ SSE Stream
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  languageModelProvider.ts                                    │
│  ├─ thinkingMapper.mapQwenToThinking()                      │
│  ├─ ThinkingAccumulator.feed()                              │
│  └─ Emits: **Thinking:** block → **Answer:** block          │
└────────────────────┬────────────────────────────────────────┘
                     │ vscode.LanguageModelTextPart
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  VS Code Chat UI                                            │
│  Renders markdown with thinking/answer sections             │
└─────────────────────────────────────────────────────────────┘
```

## File Changes

### 1. Core Integration Files
- **extensions/tarx/src/thinkingMapper.ts** (NEW)
  - Copied from tarx-skills-provider
  - Maps Qwen SSE chunks to thinking/content blocks
  - `mapQwenToThinking()` - single chunk mapper
  - `ThinkingAccumulator` - accumulates across stream

- **extensions/tarx/src/languageModelProvider.ts** (MODIFIED)
  - Line 11: Import thinkingMapper
  - Line 106-164: Stream parsing with thinking separation
  - Emits thinking in markdown code block: **Thinking:** ```...```
  - Then emits answer: **Answer:** ...

### 2. Configuration
- **extensions/tarx/package.json** (MODIFIED)
  - `tarx.thinking.enabled`: true (default)
  - `tarx.thinking.autoCollapse`: false (show for transparency)

### 3. VS Code Settings (Built-in)
VS Code 1.109 already supports:
- `chat.agent.thinkingStyle`: "collapsed" | "collapsedPreview" | "fixedScrolling"
- Default: "collapsed"

## Stream Flow

### Qwen SSE Format
```json
data: {"choices":[{"delta":{"reasoning_content":"Let me analyze..."}}]}
data: {"choices":[{"delta":{"reasoning_content":" this code..."}}]}
data: {"choices":[{"delta":{"content":"Here is the answer"}}]}
data: [DONE]
```

### Mapped Output
```
**Thinking:**
```
Let me analyze... this code...
```

**Answer:**
Here is the answer
```

## Testing Steps

### 1. Start TARX Desktop
```bash
# Ensure Qwen 8.2B is running on localhost:11435
curl http://localhost:11435/health
```

### 2. Launch Workbench
```bash
cd ~/Desktop/tarx-code-oss
./scripts/code.sh
```

### 3. Test in Chat
1. Open VS Code Chat (Cmd+Shift+I)
2. Ask: "Explain how binary search works step by step"
3. Expected output:
   - **Thinking:** section with Qwen's reasoning process
   - **Answer:** section with the final explanation
   - Check console for `[TARX Thinking]` logs

### 4. Check Configuration
```bash
# Enable thinking (default)
"tarx.thinking.enabled": true

# Disable thinking
"tarx.thinking.enabled": false
```

### 5. Verify Logs
```bash
# In VS Code Developer Tools Console (Help → Toggle Developer Tools)
# Look for:
[TARX Thinking] Let me analyze...
[TARX QA] TTFT: 123ms
[TARX QA] Response complete: 2500ms total
```

## Configuration Options

### TARX Extension Settings
```json
{
  "tarx.thinking.enabled": true,
  "tarx.thinking.autoCollapse": false
}
```

### VS Code Chat Settings
```json
{
  "chat.agent.thinkingStyle": "collapsed",
  "chat.agent.thinking.generateTitles": true
}
```

## Debugging

### Check Stream Chunks
Add to languageModelProvider.ts line 129:
```typescript
console.log('[TARX Stream]', parsed);
```

### Verify Qwen Model
```bash
curl -X POST http://localhost:11435/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role":"user","content":"Test"}],
    "stream": true,
    "max_tokens": 50
  }'
```

### Check for reasoning_content
The stream should include `reasoning_content` fields if Qwen 8.2B is properly configured.

## Known Limitations

1. **VS Code Extension API**:
   - No native `LanguageModelThinkingPart` in VS Code 1.109 extension API
   - We render thinking as markdown instead of native thinking blocks
   - This is a WORKAROUND until VS Code exposes thinking API to extensions

2. **Rendering**:
   - Thinking appears as markdown code block with **Thinking:** header
   - Not collapsible like native VS Code thinking blocks (those are internal only)

3. **MCP Server**:
   - tarx_reason_stream already separates reasoning/answer
   - This implementation is for the Language Model Provider (chat UI)

## Future Improvements

1. **Native Thinking API**: When VS Code exposes `IChatThinkingPart` to extensions
2. **Collapsible Blocks**: Use webview or custom rendering for collapsible thinking
3. **Thinking Metrics**: Track TTFT for thinking vs answer separately
4. **UI Polish**: Add shimmer animation during thinking phase

## Testing Checklist

- [ ] Qwen 8.2B emits reasoning_content in stream
- [ ] thinkingMapper correctly separates thinking/content
- [ ] Chat UI shows **Thinking:** section
- [ ] Chat UI shows **Answer:** section
- [ ] Console logs show `[TARX Thinking]` messages
- [ ] Configuration `tarx.thinking.enabled` works
- [ ] No TypeScript compilation errors
- [ ] Stream completes without errors
