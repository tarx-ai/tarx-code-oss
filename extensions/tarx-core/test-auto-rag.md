# Testing Auto-RAG Functionality

## Prerequisites
1. Restart Claude Desktop to reload the MCP server
2. Ensure you have some knowledge base content in at least one space

## Test Cases

### Test 1: Auto-RAG (Federated Search)
**Purpose**: Verify RAG works without spaceId parameter

**Command** (via Claude Desktop):
```
Please use the tarx_chat tool with this prompt: "What documentation do we have?"
```

**Expected Behavior**:
- Searches across ALL spaces in the database
- Logs: `[TARX RAG] Federated search across N spaces`
- Response includes `rag_mode: "federated"`
- Response includes `rag_spaces_searched: N` where N > 0 if you have multiple spaces

**Example Response Metadata**:
```json
{
  "response": "...",
  "rag_enabled": true,
  "rag_chunks_used": 5,
  "rag_mode": "federated",
  "rag_spaces_searched": 3
}
```

---

### Test 2: Single-Space RAG (Legacy Behavior)
**Purpose**: Verify spaceId parameter still works

**Step 1** - Get a space ID:
```
Please use tarx_list_spaces to show all spaces
```

**Step 2** - Use that space ID:
```
Please use tarx_chat with spaceId="[ID from step 1]" and prompt="What is in this space?"
```

**Expected Behavior**:
- Searches only the specified space
- Logs: `[TARX RAG] Searching single space: [ID]`
- Response includes `rag_mode: "single-space"`
- Response includes `rag_spaces_searched: 1`

**Example Response Metadata**:
```json
{
  "response": "...",
  "rag_enabled": true,
  "rag_chunks_used": 3,
  "rag_mode": "single-space",
  "rag_spaces_searched": 1
}
```

---

### Test 3: RAG Disabled
**Purpose**: Verify useRAG=false disables RAG completely

**Command**:
```
Please use tarx_chat with useRAG=false and prompt="What is 2+2?"
```

**Expected Behavior**:
- No RAG search occurs
- No context injection
- Response includes `rag_enabled: false`
- Response includes `rag_chunks_used: 0`

**Example Response Metadata**:
```json
{
  "response": "4",
  "rag_enabled": false,
  "rag_chunks_used": 0,
  "rag_mode": "federated",
  "rag_spaces_searched": 0
}
```

---

## Debugging

### Check Console Logs
Monitor the Claude Desktop logs (or MCP server logs) for RAG activity:

```bash
# macOS - tail Claude Desktop logs
tail -f ~/Library/Logs/Claude/mcp*.log
```

Look for lines like:
```
[TARX RAG] Federated search across 3 spaces
[TARX RAG] Federated search found 15 chunks across 2 spaces
[TARX RAG] Injected 8 chunks (similarity >= 0.5)
```

### Verify Knowledge Base Content
If RAG returns 0 chunks, check that you have embeddings:

```
Use tarx_list_spaces to see all spaces
Use tarx_knowledge_stats with each spaceId to see embedding counts
```

Expected output should show `embedding_count > 0` for at least one space.

---

## Performance Benchmarks

With auto-RAG enabled (default):

| Metric | Expected Value |
|--------|---------------|
| Space cache duration | 60 seconds |
| Chunks per space | Max 5 |
| Total chunks considered | Max 10 |
| Similarity threshold | >= 0.5 |
| Additional latency | ~100-300ms (depending on # of spaces) |

---

## Rollback Plan

If auto-RAG causes issues, you can:

1. **Disable RAG per-request**: Use `useRAG: false` parameter
2. **Revert code**:
   ```bash
   cd /Users/master/Desktop/tarx-code-oss/extensions/tarx-core
   git checkout server.ts
   npm run build
   ```
3. **Restart Claude Desktop** to reload the old version

---

## Next Steps

Once auto-RAG is working:

1. Monitor performance with multiple spaces
2. Tune similarity threshold if needed (currently 0.5)
3. Adjust per-space chunk limit (currently 5)
4. Adjust global chunk limit (currently 10)
5. Increase/decrease cache TTL (currently 60 seconds)

All these values are configurable in `server.ts` lines 175-250.
