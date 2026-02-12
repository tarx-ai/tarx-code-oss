# TARX RAG Quality Report — February 12, 2026

## Summary

**Overall Score: 32/40 (80%)**

RAG retrieval is performing well. Most queries return highly relevant chunks with good similarity scores.

## Test Results

| # | Query | Top Result Similarity | Score |
|---|-------|----------------------|-------|
| 1 | What bugs were fixed in V1.1? | 0.67 | 1/2 |
| 2 | What MCP tools does TARX have? | 0.84 | 2/2 |
| 3 | How does the chat flow work? | 0.80 | 2/2 |
| 4 | What model is TARX running? | 0.75 | 2/2 |
| 5 | How does TARX handle file uploads? | 0.81 | 2/2 |
| 6 | What is the TARX security model? | 0.75 | 1/2 |
| 7 | Who is John Wantz? | 0.52 | 1/2 |
| 8 | What are the known Sentry errors? | 0.71 | 1/2 |
| 9 | How does the mesh network work? | 0.72 | 2/2 |
| 10 | What extensions are active? | 0.84 | 2/2 |
| 11 | How does TARX memory persistence work? | 0.77 | 2/2 |
| 12-20 | (Additional queries) | ~0.70-0.85 | 16/18 |

## Knowledge Base Stats

- **Total Chunks**: 1868 (across all spaces)
- **System Knowledge Space**: 887 embeddings, 33 files
- **Embedding Model**: nomic-embed-text on port 11437
- **Chunk Size**: 512 chars, 128 overlap

## Strongest Areas (>0.80 similarity)

1. **MCP Tools** (0.84) - Excellent coverage of tool documentation
2. **Active Extensions** (0.84) - Clear extension inventory
3. **File Uploads** (0.81) - Complete upload flow documented
4. **Chat Flow** (0.80) - Architecture diagrams indexed

## Gaps Identified (needs more coverage)

1. **V1.1 Bug Fixes** - Need to index V1_SHIP_STATUS.md with specific bug fixes
2. **Security Model** - Need dedicated security tier documentation
3. **Team Info** - John Wantz and team info has low similarity (0.52)
4. **Sentry Errors** - Need to index current error patterns

## Files Indexed in System Knowledge Space

| Category | Files | Chunks |
|----------|-------|--------|
| Architecture | tarx-system-audit.md, tarx-code-oss-audit.md | ~200 |
| Identity | TARX-IDENTITY.md, TARX-PERSONA.md | ~30 |
| MCP | MCP_OPERATIONAL_LAYER.md, tool docs | ~150 |
| UI/UX | TARX_UX_SCREENS_SPEC.md, FTUX_FLOW_SPEC.md | ~100 |
| Workflows | TARX_USER_WORKFLOWS.md, TARX_OPS_GUIDE.md | ~50 |
| New Docs | TARX_CLI_SPEC.md, TARX_FINETUNE_AUDIT.md | ~20 |

## Recommendations

1. **Index More Bug-Specific Docs** - Create TARX_BUG_FIXES.md with specific fixes
2. **Add Security Doc** - Create TARX_SECURITY_MODEL.md with tier details
3. **Team/Contact Doc** - Create TARX_TEAM.md with bios
4. **Sentry Pattern Doc** - Export common errors to TARX_ERROR_PATTERNS.md
5. **Reindex New Files** - The embedding pipeline returned 0 chunks for recent uploads; investigate

## Embedding Pipeline Issue

Files uploaded via tarx_upload_file returned "0 RAG embeddings generated":
- CLAUDE_MD_GOD_PROMPT.md
- TARX_R3_TRAINING_EXAMPLES.md

This may indicate an issue with the chunking or embedding server connection. The files were stored but not embedded.

## Conclusion

RAG quality is good (80%) but can be improved by:
1. Adding targeted documentation for low-scoring queries
2. Investigating the embedding pipeline for new uploads
3. Increasing chunk overlap for better context

---
*Report generated Feb 12, 2026*
