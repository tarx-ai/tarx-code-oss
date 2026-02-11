# TARX File Upload/Drop Integration

**Status:** ✅ Complete
**Date:** 2026-02-08

## Overview

Integrated file upload button and drag-and-drop functionality into the VS Code chat UI, wiring them to TARX's existing RAG pipeline.

## What Was Done

### 1. Created Chat Input Integration (`extensions/tarx/src/chatInputIntegration.ts`)

A new module that bridges VS Code's chat UI with TARX's RAG pipeline:

- **Upload Button Handler**: Opens file picker and processes files through RAG
- **Drag-and-Drop Handler**: Processes dropped files through RAG
- **RAG Pipeline Integration**: Uses existing `ChatFileAttachmentAdapter` to:
  - Chunk file content (512 tokens, 128 token overlap)
  - Generate embeddings via embedding server (port 11437)
  - Store chunks in SQLite with vector embeddings
  - Attach files to VS Code chat context

### 2. Added Upload Button to Chat Input Toolbar

Modified `src/vs/workbench/contrib/chat/browser/actions/chatContextActions.ts`:

- Added `TarxUploadWithRAGAction` class
- Registered action in `registerChatContextActions()`
- Button appears in chat input toolbar with cloud-upload icon
- Executes `tarx.chat.uploadFile` command when clicked

### 3. Enhanced Drag-and-Drop Flow

Modified `src/vs/workbench/contrib/chat/browser/widget/chatDragAndDrop.ts`:

- Extended `drop()` method to detect file attachments
- Calls `processTarxFileDrop()` from TARX extension
- Non-blocking - files are processed in background
- Gracefully handles case when TARX extension is not loaded

### 4. Registered Commands in Extension

Modified `extensions/tarx/src/extension.ts`:

- Imported and initialized `ChatInputIntegration`
- Registered during extension activation (after database init)
- Commands available:
  - `tarx.chat.uploadFile` - Upload button handler
  - `tarx.chat.handleFileDrop` - Drag-and-drop handler

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Chat UI                          │
├─────────────────────────────────────────────────────────────┤
│  Chat Input Toolbar                                         │
│  ├── Upload Button (cloud-upload icon) ──────────┐          │
│  └── Drag-and-Drop Zone                          │          │
│                                                   │          │
│  chatContextActions.ts                            │          │
│  └── TarxUploadWithRAGAction ────────────────────┘          │
│                                                              │
│  chatDragAndDrop.ts                                          │
│  └── drop() method ──────────────────────┐                  │
│                                           │                  │
├───────────────────────────────────────────┼──────────────────┤
│                    TARX Extension         │                  │
├───────────────────────────────────────────┼──────────────────┤
│  chatInputIntegration.ts                  │                  │
│  ├── handleUploadButton() ◄───────────────┘                  │
│  └── handleFileDrop() ◄──────────────────────────────────────┘
│       │                                                      │
│       └─► ChatFileAttachmentAdapter                          │
│            ├─► Chunk text (512/128 tokens)                   │
│            ├─► Generate embeddings (port 11437)              │
│            ├─► Store in SQLite                               │
│            └─► Attach to VS Code chat                        │
└─────────────────────────────────────────────────────────────┘
```

## File Changes

### New Files
- `extensions/tarx/src/chatInputIntegration.ts` - Main integration module
- `extensions/tarx/src/chatInputActions.ts` - Action configuration docs
- `FILE_UPLOAD_INTEGRATION.md` - This file

### Modified Files
- `extensions/tarx/src/extension.ts` - Added integration initialization
- `src/vs/workbench/contrib/chat/browser/actions/chatContextActions.ts` - Added upload button action
- `src/vs/workbench/contrib/chat/browser/widget/chatDragAndDrop.ts` - Enhanced drop handler

## User Experience

### Upload Button Flow
1. User clicks upload button (cloud-upload icon) in chat input toolbar
2. File picker opens with filters (text, code, config, documents)
3. User selects one or more files
4. Files are processed through RAG pipeline:
   - Chunked for semantic search
   - Embeddings generated
   - Stored in knowledge base
5. Files attached to chat context
6. Notification: "Attached N file(s) to chat with RAG indexing"

### Drag-and-Drop Flow
1. User drags files from Finder/Explorer
2. Drop zone highlights with overlay
3. User drops files into chat composer
4. VS Code's built-in attachment handling fires
5. TARX RAG processing runs in background
6. Notification: "Processed N file(s) through RAG pipeline"

## RAG Pipeline Details

When files are uploaded or dropped:

1. **Read**: File content read via VS Code FS API
2. **Chunk**: Text split into 512-token chunks with 128-token overlap
3. **Embed**: Each chunk sent to embedding server (Nomic Embed v1.5)
4. **Store**: Chunks + embeddings stored in SQLite:
   ```sql
   files: (id, space_id, filename, file_path, mime_type, size, created_at)
   embeddings: (id, file_id, chunk_index, content, embedding, created_at)
   ```
5. **Attach**: File URI attached to chat via `workbench.action.chat.attachFile`

## Supported File Types

- **Text**: `.txt`, `.md`, `.markdown`
- **Code**: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.rs`, `.go`, `.java`, `.c`, `.cpp`, `.h`, `.hpp`, `.cs`
- **Config**: `.json`, `.yaml`, `.yml`, `.xml`, `.toml`, `.ini`
- **Documents**: `.pdf`, `.doc`, `.docx`

All files are treated as UTF-8 text. Binary parsing (PDF) would require additional handling.

## Testing

To test the integration:

1. **Upload Button**:
   ```bash
   # Launch TARX
   ./scripts/code.sh

   # Open chat view
   # Click upload button (cloud icon)
   # Select a .md or .ts file
   # Verify file appears in chat attachments
   ```

2. **Drag-and-Drop**:
   ```bash
   # Open chat view
   # Drag a file from Finder
   # Drop into chat composer
   # Verify file is attached and processed
   ```

3. **RAG Verification**:
   ```bash
   # Check embeddings were created
   sqlite3 ~/Library/Application\ Support/tarx/tarx.db
   > SELECT COUNT(*) FROM embeddings;
   > SELECT filename FROM files ORDER BY created_at DESC LIMIT 5;
   ```

## Future Enhancements

1. **Progress Indicator**: Show progress bar for large file uploads
2. **Batch Upload**: Upload entire folders
3. **Smart Chunking**: Use AST-based chunking for code files
4. **Preview**: Show file preview in attachment pill
5. **Remove Attachment**: Remove files from RAG index when removed from chat
6. **Duplicate Detection**: Skip files already in knowledge base

## Known Limitations

1. **Binary Files**: PDFs and other binary formats are not yet parsed (treated as text)
2. **Large Files**: No streaming for files >10MB (could cause memory issues)
3. **Error Handling**: Failed uploads show generic error (no detailed feedback)
4. **Async Processing**: RAG processing happens in background - no completion feedback

## Commands

- `tarx.chat.uploadFile` - Open file picker and attach files with RAG
- `tarx.chat.handleFileDrop` - Process dropped files through RAG

## Related Files

- `extensions/tarx/src/chatFileAttachment.ts` - RAG pipeline adapter
- `extensions/tarx/src/ragClient.ts` - Embedding server client
- `extensions/tarx/src/database.ts` - SQLite database interface
- `src/vs/workbench/contrib/chat/browser/attachments/chatAttachmentModel.ts` - VS Code attachment model

## References

- VS Code Chat API: `vscode.commands.executeCommand('workbench.action.chat.attachFile')`
- TARX Embedding Server: Port 11437 (Nomic Embed v1.5)
- Database Schema: `~/Library/Application Support/tarx/tarx.db`
