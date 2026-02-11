# TARX System Prompt Usage Guide

## Quick Reference

### Default Behavior
Every inference call automatically includes the TARX system prompt. No action needed.

```typescript
// Automatic in all these tools:
tarx_chat, tarx_send_message, tarx_reason_stream, tarx_prewarm,
tarx_voice_conversation_turn, tarx_voice_stress, tarx_stress_test
```

## Customization

### 1. Add Custom Instructions (Append)
Add specific instructions without changing TARX's core personality.

**MCP Tool**: `tarx_set_custom_instructions`

**Example**:
```json
{
  "instructions": "When discussing code, always mention performance implications."
}
```

**Result**: Appends to system prompt:
```
[Base TARX prompt]

## User Instructions
When discussing code, always mention performance implications.
```

**Clear Custom Instructions**:
```json
{
  "instructions": ""
}
```

### 2. Override Entire Prompt (Replace)
Completely replace TARX's personality. Use with caution.

**MCP Tool**: `tarx_override_system_prompt`

**Example**:
```json
{
  "prompt": "You are a technical writing assistant specialized in API documentation."
}
```

**Result**: Replaces entire prompt with your custom one.

**Restore Default**:
```json
{
  "prompt": null
}
```

### 3. Check Current Configuration

**MCP Tool**: `tarx_get_prompt_config`

**Returns**:
```json
{
  "customInstructions": "string or null",
  "overridePrompt": "string or null",
  "usingDefault": true,
  "hasCustomInstructions": false
}
```

## Architecture

### System Prompt Hierarchy
```
1. Check for override → If exists, use it (full replacement)
2. If no override → Use TARX_SYSTEM_PROMPT
3. Enrich with context:
   - Project/space info (if available)
   - Memory context (if requested)
4. Append custom instructions (if set)
```

### Context Enrichment

**Lightweight** (fast responses):
- Base prompt + space name + custom instructions
- Used by: `tarx_chat`, `tarx_send_message`, `tarx_reason_stream`, `tarx_prewarm`

**Full Contextual** (detailed context):
- Base prompt + memory + project + topic + custom instructions
- Available via: `buildContextualPrompt()` (future use)

## Code Examples

### From Extension/Client Code

```typescript
// Option 1: Using MCP tools (recommended)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Add custom instructions
await client.callTool('tarx_set_custom_instructions', {
  instructions: 'Be concise and focus on security.'
});

// Check config
const config = await client.callTool('tarx_get_prompt_config', {});

// Restore default
await client.callTool('tarx_override_system_prompt', { prompt: null });
```

### From MCP Server Code

```typescript
import { TARX_SYSTEM_PROMPT } from './systemPrompt.js';
import { buildLightweightPrompt, promptConfigStore } from './contextInjector.js';

// Get enriched prompt
const systemPrompt = await buildLightweightPrompt(TARX_SYSTEM_PROMPT, {
  config: promptConfigStore.getConfig()
});

// Use in inference
const messages = [
  { role: "system", content: systemPrompt },
  { role: "user", content: userMessage }
];
```

## Best Practices

### ✅ DO
- Use custom instructions for specific preferences
- Test changes with simple queries first
- Document why you set custom instructions
- Use override for specialized bots (docs, support, etc.)

### ❌ DON'T
- Override unless you need a completely different personality
- Add custom instructions that conflict with TARX core identity
- Set excessively long custom instructions (increases token usage)
- Forget to restore default after testing

## Troubleshooting

### Issue: Custom instructions not appearing
**Solution**: Check config with `tarx_get_prompt_config`

### Issue: Want to reset everything
**Solution**:
```typescript
await client.callTool('tarx_set_custom_instructions', { instructions: '' });
await client.callTool('tarx_override_system_prompt', { prompt: null });
```

### Issue: Prompt too long
**Solution**: Use lightweight prompt or reduce custom instructions length

## Advanced: Per-Tool System Prompts

Some tools allow passing a custom `systemPrompt` parameter:

```typescript
// tarx_reason_stream
{
  prompt: "Explain quantum computing",
  systemPrompt: "You are a physics professor." // Optional override
}

// tarx_prewarm
{
  partialPrompt: "The user is typing...",
  systemPrompt: "Focus on code completion." // Optional override
}
```

**Note**: These overrides are temporary (single call) and don't affect the global config.

---

**Reference**: See `SYSTEM_PROMPT_DEPLOYMENT_REPORT.md` for full deployment details.
