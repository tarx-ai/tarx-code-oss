---
name: tarx-knowledge
description: "RAG-powered search over uploaded documents and project files"
route: local
tools:
  - tarx_search_knowledge
  - tarx_upload_file
  - tarx_list_files
  - tarx_knowledge_stats
tier: free
---

# Knowledge Base

## When to Use
- User asks about content in their uploaded files
- User references documentation, specs, or notes
- User wants to search across project knowledge
- User uploads a new file for indexing

## Instructions
1. Check if embedding server is healthy (port 11437)
2. If DOWN: inform user, suggest restart, skip RAG
3. If UP: `tarx_search_knowledge` with semantic query
4. Return top 3 chunks with source attribution
5. For uploads: `tarx_upload_file` then auto-embed and confirm

## Important
- Embedding server (11437) may be offline — always check first
- Prefix docs with "search_document:", queries with "search_query:"
- Similarity threshold: 0.7 for inclusion
- Always cite source file name in response
