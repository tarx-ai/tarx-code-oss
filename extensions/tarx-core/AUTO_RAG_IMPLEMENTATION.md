# Auto-RAG Implementation for tarx_chat

## What Changed

Modified `extensions/tarx-core/src/server.ts` to enable **automatic RAG (Retrieval-Augmented Generation)** without requiring users to specify a `spaceId`.

## Implementation Details

### 1. **Space ID Caching**
Added a simple cache to avoid repeated database queries:
```typescript
let cachedSpaceIds: string[] | null = null;
let cacheTimestamp: number = 0;
const SPACE_CACHE_TTL_MS = 60000; // 1 minute

function getAvailableSpaceIds(): string[] {
  // Returns cached space IDs if cache is still valid
  // Otherwise queries database and updates cache
}
```

### 2. **Federated RAG Search**
When `spaceId` is **not provided**, the system now:
1. Gets all available space IDs from the database
2. Searches each space for relevant embeddings (top 5 per space)
3. Merges all results and sorts by similarity score
4. Takes the top 10 most relevant chunks across all spaces
5. Filters by similarity threshold (>= 0.5)
6. Injects into prompt context

### 3. **Backward Compatibility**
- If `spaceId` **is provided**: Original behavior (single-space search)
- If `spaceId` **is NOT provided**: New federated search across all spaces
- `useRAG` parameter still controls whether RAG is enabled (defaults to `true`)

### 4. **Response Metadata**
Added new fields to track RAG usage:
```json
{
  "rag_enabled": true,
  "rag_chunks_used": 5,
  "rag_mode": "federated",  // or "single-space"
  "rag_spaces_searched": 3
}
```

## How It Works

### Before (Required spaceId)
```typescript
// User HAD to provide spaceId
tarx_chat({
  prompt: "What is the API structure?",
  spaceId: "abc-123-def"
})
```

### After (Auto-RAG)
```typescript
// Works without spaceId - searches ALL spaces
tarx_chat({
  prompt: "What is the API structure?"
})
// Automatically searches all spaces and injects relevant context
```

### Explicit Control Still Available
```typescript
// Search specific space only
tarx_chat({
  prompt: "...",
  spaceId: "abc-123-def"
})

// Disable RAG entirely
tarx_chat({
  prompt: "...",
  useRAG: false
})
```

## Build Results

✅ **Compiled successfully**
- `npm run build` in `extensions/tarx-core` succeeded
- Verified presence of federated search code in `dist/server.js`
- Found 16 instances of auto-RAG related code in compiled output

## Testing Instructions

### 1. Restart Claude Desktop
The MCP server needs to be reloaded to pick up the changes:
```bash
# Quit Claude Desktop completely
# Relaunch Claude Desktop
```

### 2. Test Auto-RAG (No spaceId)
```
Use tarx_chat with prompt: "What files are in the knowledge base?"
```

Expected result:
- Searches across ALL spaces automatically
- Returns chunks from multiple spaces if available
- Response metadata shows `rag_mode: "federated"` and `rag_spaces_searched: N`

### 3. Test Single-Space RAG (With spaceId)
First get a space ID:
```
Use tarx_list_spaces to get a spaceId
Use tarx_chat with that spaceId and a relevant prompt
```

Expected result:
- Searches only the specified space
- Response metadata shows `rag_mode: "single-space"` and `rag_spaces_searched: 1`

### 4. Test RAG Disabled
```
Use tarx_chat with useRAG: false and any prompt
```

Expected result:
- No RAG injection occurs
- Response metadata shows `rag_enabled: false` and `rag_chunks_used: 0`

## Performance Considerations

1. **Cache Duration**: Space IDs are cached for 60 seconds to reduce database overhead
2. **Per-Space Limit**: Only searches top 5 chunks per space (configurable)
3. **Global Limit**: Takes top 10 chunks across all spaces after merging
4. **Similarity Threshold**: Only injects chunks with similarity >= 0.5

## Benefits

1. **User Experience**: No need to know or specify spaceId
2. **Comprehensive Search**: Finds relevant context across entire knowledge base
3. **Backward Compatible**: Existing code with spaceId still works
4. **Transparent**: Response metadata shows exactly what happened

## Log Output

When using auto-RAG, you'll see console logs like:
```
[TARX RAG] Federated search across 3 spaces
[TARX RAG] Federated search found 15 chunks across 2 spaces
[TARX RAG] Injected 8 chunks (similarity >= 0.5)
```

When using single-space RAG:
```
[TARX RAG] Searching single space: abc-123-def
[TARX RAG] Injected 5 chunks (similarity >= 0.5)
```
