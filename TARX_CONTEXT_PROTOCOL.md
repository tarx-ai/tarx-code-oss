# TARX Context Protocol

**Version:** 1.0
**Date:** February 20, 2026
**Status:** Implementation Spec
**Origin:** CC ↔ TARX protocol pattern → generalized to all TARX user interactions

---

## 0. Why This Exists

Claude Code sessions produced vaporware until we enforced a protocol: read state before acting, write state after acting, never hoard context. The same failure mode applies to TARX user conversations — without enforced context discipline, TARX loses what it learns, hallucinates from stale state, and every conversation starts from zero.

This protocol ensures TARX gets smarter with every interaction. Same state machine, whether the "user" is Claude Code or Holly.

**The pattern:**

```
CC reads CLAUDE.md         → TARX reads system prompt + persona
CC reads MEMORY.md         → TARX reads RAG embeddings + observations
CC reads SESSION_LOG.md    → TARX reads conversation history (SQLite)
CC queries via MCP tools   → TARX queries embeddings/SQLite (no hallucination)
CC updates at session end  → TARX stores observations after every conversation
```

---

## 1. Three-Tier Context Hierarchy

### Tier 1 — Identity (changes never/rarely)

**What it holds:**
- Who the user is (name, role, company, goals)
- How TARX should behave (pushback level, verbosity, style, persona mode)
- Workspace structure (Spaces, projects, pinned items)
- User hardware profile (CPU, RAM, GPU — for adaptive model selection)
- Onboarding data (from invite funnel, pre-seeded before first launch)

**When loaded:** Once at session start.
**When updated:** Only on explicit user change or onboarding flow completion.
**Storage:** User profile table in SQLite.

**Local optimization — Tier 1 is FREE on local inference:**

On local llama-server, tokens are compute-time, not dollars. Tier 1 can be rich and detailed without budget anxiety. This is a structural advantage over cloud-only systems that must compress identity into minimal tokens. TARX should exploit this:

- Full persona instructions (not abbreviated)
- Complete user preference history
- Detailed workspace context
- Hardware-aware instructions ("user has M4 with 16GB, use full context")

**Target: ~800-1200 tokens locally (free). Compressed to ~200 tokens on mesh/cloud.**

The compression strategy for mesh/cloud:

```
LOCAL (full):
You are TARX. User: Holly Chen, founder of ALL THE HORSES (equestrian
lifestyle brand), Shopify store owner. Prefers direct communication,
pushback on lazy thinking. Works PST hours. Has uploaded product catalog
(47 items), brand guidelines, Q4 marketing plan. Cognitive style:
visual thinker, prefers examples over theory. Previous AI experience:
ChatGPT (frustrated with generic responses). Goals: automate product
descriptions, improve SEO, weekly business review. TARX mode: prosumer,
cognitive enhancement enabled, pushback level 3/5.

MESH/CLOUD (compressed):
User: Holly, Shopify store owner (equestrian brand). Direct style,
pushback OK. Has product catalog + brand guidelines in RAG.
Goal: product descriptions, SEO, business reviews.
```

### Tier 2 — Knowledge (changes over days/weeks)

**What it holds:**
- RAG embeddings from uploaded files (documents, exports, data)
- Stored observations ("user prefers bullet points for lists")
- Learned patterns ("asks about inventory every Monday")
- Imported history (ChatGPT exports, email archives, notes)
- Skill usage patterns (which skills used most, in what contexts)
- Conversation summaries from past sessions

**When loaded:** Queried on demand via semantic search.
**When updated:** After significant interactions (new facts, new files, session summaries).
**Storage:** SQLite with sqlite-vec (768-dim embeddings from nomic-embed-v1.5).

**This tier is where TARX gets smarter over time.** Every conversation that teaches TARX something new adds to Tier 2. Every file upload enriches it. Every session summary compounds it.

### Tier 3 — Conversation (changes every message)

**What it holds:**
- Current conversation history (recent messages)
- Active task state (what TARX is working on right now)
- Recent tool call results (MCP responses, search results)
- Injected RAG chunks (from Tier 2 queries this conversation)

**When loaded:** Every prompt construction.
**When updated:** Every message send/receive.
**Storage:** In-memory during conversation, persisted to SQLite on conversation end.

**This tier has the hardest constraints** — it's the moving window that must fit within the model's context limit while preserving coherence.

---

## 2. Adaptive Context Budgeting

### The Core Insight: Local ≠ Cloud ≠ Mesh

TARX runs on three compute paths with different economics. The context protocol must adapt:

| Compute Path | Token Cost | Context Window | Budget Strategy |
|---|---|---|---|
| **Local** (llama-server) | Free (compute-time only) | 4096-32768 (model-dependent) | Generous — use full window |
| **Mesh** (peer inference) | Credits/reciprocal | Varies by peer model | Moderate — respect peer's window |
| **Cloud** (fallback) | $/token | 128K+ | Disciplined — minimize spend |

### Local Budget (Primary Path — 80%+ of queries)

With Qwen 8.2B at 4096 context:

```
Tier 1: Identity + System Prompt    ~1000 tokens  <- Rich, detailed, free
Tier 2: RAG Chunks (top 3-5)        ~800 tokens  <- Quality-gated
Tier 3: Conversation History        ~1200 tokens  <- Sliding window + summary
Response Budget                     ~1096 tokens  <- max_tokens for generation
Total: 4096 tokens
```

With larger local models (e.g., 32K context):

```
Tier 1: Identity + System Prompt    ~1500 tokens  <- Full persona + rules
Tier 2: RAG Chunks (top 8-12)      ~4000 tokens  <- Deep context retrieval
Tier 3: Conversation History       ~16000 tokens  <- Longer memory window
Response Budget                    ~10500 tokens  <- Extended generation
Total: 32000 tokens
```

**Key: Auto-detect available context window and scale budgets proportionally.**

### Mesh Budget

When TARX routes to a mesh peer:

1. Query peer's advertised context window via mesh protocol
2. Compress Tier 1 to essential identity (~200 tokens)
3. Include only highest-relevance RAG chunks (top 2, threshold 0.8+)
4. Send compressed conversation summary, not full history
5. Include full current message + immediate prior context

```
Tier 1: Compressed Identity          ~200 tokens
Tier 2: Top 2 RAG Chunks            ~400 tokens
Tier 3: Summary + Last 2 Turns      ~600 tokens
Response Budget                     ~800 tokens
Target: ~2000 tokens (fits any peer)
```

**Privacy constraint:** Tier 1 identity is NEVER sent to mesh peers unless user explicitly opts in. Send behavioral instructions only ("respond directly, pushback OK") not personal data ("user is Holly Chen").

### Cloud Budget

When falling back to cloud:

1. Minimize tokens (every token costs money)
2. Tier 1 compressed to ~200 tokens
3. Tier 2 only if query requires RAG (skip for general questions)
4. Tier 3 compressed to conversation summary + current exchange
5. Set response budget based on query complexity

```
Simple query:    ~500 tokens in -> ~200 tokens out  (~$0.001)
Complex query:   ~2000 tokens in -> ~1000 tokens out (~$0.01)
Deep analysis:   ~4000 tokens in -> ~2000 tokens out (~$0.02)
```

---

## 3. RAG Auditing & Chunk Quality Management

### The Problem with Naive RAG

Most RAG systems embed everything and hope for the best. This fails because:

- Low-quality chunks pollute retrieval (irrelevant content scores above threshold)
- Duplicate/near-duplicate chunks compete for top-K slots
- Stale content gets retrieved over fresh content
- No feedback loop — bad retrievals never get corrected
- Chunk boundaries split semantic units (a paragraph about X gets cut in half)

TARX needs production-grade RAG. Here's how.

### 3.1 Chunk Quality at Ingestion

**Smart chunking (not dumb character splits):**

Current: `chunkText(512 chars, 128 overlap)` — this is naive. Upgrade to:

```
Chunking Strategy:
1. Parse document structure (headings, paragraphs, lists, code blocks)
2. Chunk along semantic boundaries (paragraph breaks, section headers)
3. Target chunk size: 256-512 tokens (not characters)
4. Overlap: Include the parent heading/section title as prefix on every chunk
5. Minimum chunk size: 64 tokens (below this, merge with adjacent chunk)
6. Maximum chunk size: 768 tokens (above this, split at nearest sentence boundary)
```

**Why section-title prefix matters:**

```
BAD chunk:  "The quarterly revenue was $2.3M, up 15% from last quarter."
            (Orphaned — which quarter? Which business?)

GOOD chunk: "[Q4 2025 Financial Summary] The quarterly revenue was $2.3M,
            up 15% from last quarter. Growth was driven by..."
            (Self-contained — the heading gives context)
```

**Chunk metadata — store alongside every embedding:**

```sql
CREATE TABLE chunk_embeddings (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  chunk_index INTEGER,
  content TEXT,
  embedding BLOB,               -- 768-dim vector
  created_at INTEGER,
  -- Quality management fields:
  source_heading TEXT,           -- Parent section heading
  chunk_type TEXT,               -- 'prose' | 'list' | 'code' | 'table' | 'qa'
  token_count INTEGER,           -- Actual token count
  retrieval_count INTEGER DEFAULT 0,   -- How often retrieved
  retrieval_useful INTEGER DEFAULT 0,  -- How often retrieval led to good response
  last_retrieved_at INTEGER,     -- Recency tracking
  quality_score REAL DEFAULT 1.0,-- Computed quality (0.0 - 1.0)
  superseded_by TEXT             -- If this chunk was updated, points to replacement
);
```

### 3.2 Retrieval Quality Gating

**Multi-signal scoring (not just cosine similarity):**

```
final_score = (
  cosine_similarity * 0.5        -- Semantic relevance (base signal)
  + recency_score * 0.2          -- Newer content preferred
  + quality_score * 0.2          -- Historical usefulness
  + type_match_score * 0.1       -- Chunk type matches query intent
)
```

**Recency scoring:**

```
recency_score = exp(-decay_rate * days_since_creation)

Where:
  decay_rate = 0.01  (gentle decay — content stays relevant for months)

  Created today:     recency = 1.0
  Created 7 days:    recency = 0.93
  Created 30 days:   recency = 0.74
  Created 90 days:   recency = 0.41
  Created 365 days:  recency = 0.03
```

**Adjustable by user preference:** Power users may want longer decay (research documents stay relevant). Business users may want shorter decay (last week's data matters most).

**Quality scoring (feedback loop):**

```
After every response that used RAG context:
  1. Was the response helpful? (user reaction, follow-up pattern)
  2. If helpful: increment retrieval_useful for each injected chunk
  3. If unhelpful/user corrected: decrement quality_score for injected chunks
  4. quality_score = retrieval_useful / max(retrieval_count, 1)

Chunks with quality_score < 0.3 after 10+ retrievals:
  -> Flag for review
  -> Deprioritize in retrieval (still available, just scored lower)
  -> Surface to user: "Some of your older files may have outdated info"
```

**Type match scoring:**

```
Query intent     Best chunk types       Score
"how do I..."    prose, qa              1.0
"show me code"   code                   1.0
"what are the"   list, prose            1.0
"summarize"      prose                  1.0
numbers/data     table                  1.0
mismatched       any                    0.5
```

### 3.3 Retrieval Gating Rules

```
RULE 1: Minimum relevance threshold
  If best_chunk.final_score < 0.5: inject NO chunks
  Rationale: Irrelevant context is worse than no context

RULE 2: Diminishing returns cutoff
  If chunk[n].final_score < 0.6 * chunk[0].final_score: stop at chunk[n-1]
  Rationale: Don't pad with marginally relevant chunks

RULE 3: Budget-aware truncation
  total_chunk_tokens must fit within Tier 2 budget
  If over budget: drop lowest-scoring chunks first
  Never truncate a chunk mid-content — drop entirely or keep entirely

RULE 4: Diversity enforcement
  If top 3 chunks are all from same file: force chunk from different source into slot 3
  Rationale: Prevents single-file domination of context

RULE 5: Recency boost for contradictions
  If two chunks contain contradictory information:
  -> Prefer the newer chunk
  -> Inject both with annotation: "[Note: newer information may supersede this]"
```

### 3.4 RAG Audit Pipeline

**Continuous quality monitoring (runs in background):**

```
DAILY AUDIT:
  1. Identify chunks with 0 retrievals in 30 days
     -> These are dead weight. Don't delete, but flag.
  2. Identify chunks with quality_score < 0.3
     -> These hurt more than help. Deprioritize.
  3. Identify near-duplicate chunks (cosine > 0.92 between chunks)
     -> Merge or deduplicate. Keep the one with higher quality_score.
  4. Identify files with no chunks above 0.5 relevance to any recent query
     -> Surface to user: "You uploaded [file] but haven't used it. Still relevant?"

WEEKLY AUDIT:
  1. Compute per-file usefulness: avg quality_score of all chunks in file
     -> Rank files by actual utility to the user
  2. Identify observation drift: Tier 2 observations that contradict recent behavior
     -> Auto-archive stale observations
  3. Compute token budget utilization: how often does Tier 2 hit its budget cap?
     -> If >80% of queries hit cap: suggest larger model or smarter chunking
```

**Telemetry (logged to Sentry/Notion):**

```
Per-conversation metrics:
  - rag_chunks_injected: count
  - rag_avg_score: mean final_score of injected chunks
  - rag_hit_rate: % of queries where chunks scored above threshold
  - rag_budget_utilization: % of Tier 2 token budget used
  - response_referenced_rag: did the model actually use injected context? (heuristic)

Per-day rollups:
  - total_chunks_stored
  - total_chunks_retrieved
  - chunk_quality_distribution (histogram)
  - dead_chunks_count (0 retrievals in 30 days)
  - duplicate_chunk_pairs
```

### 3.5 Observation Storage (Learned Facts)

Observations are Tier 2 knowledge that TARX infers from conversations, not from uploaded files.

**Observation types:**

```
PREFERENCE:  "User prefers bullet points for task lists"
PATTERN:     "User asks about inventory every Monday morning"
FACT:        "User's Shopify store has 47 active products"
CORRECTION:  "User corrected: brand name is 'ALL THE HORSES' not 'All The Horses'"
GOAL:        "User is preparing for Q1 product launch in March"
STYLE:       "User responds well to direct pushback, dislikes hedging"
```

**Observation deduplication (merge-or-replace):**

```
Before storing new observation:
  1. Semantic search existing observations (cosine similarity)
  2. If match > 0.85: REPLACE (newer is more accurate)
     Example: "works at Shopify" -> "runs a Shopify store" (replace)
  3. If match 0.6-0.85: FLAG for potential merge
     Example: "likes direct feedback" + "dislikes hedging" (merge to single obs)
  4. If match < 0.6: STORE AS NEW
  5. Each observation has a confidence_score (incremented when reconfirmed)

Observations with confidence_score > 3: promoted to Tier 1 identity
  (confirmed facts become part of the user profile)
```

---

## 4. Sliding Window with Summarization (Tier 3)

### Why This Is the #1 Stability Factor

On a 4096-token context, Tier 3 (conversation history) gets ~1200 tokens. That's roughly 6-8 conversational turns. Beyond that, you either lose context or blow the window.

**Solution: Progressive summarization.**

```
Turns 1-4:   Full messages retained
Turns 5-8:   Full messages retained
Turn 9:      TRIGGER — history exceeds Tier 3 budget
             -> Summarize turns 1-4 into ~100 token summary
             -> Keep turns 5-8 as full messages
             -> New message fits

After summarization, context looks like:

  [Summary of turns 1-4: User asked about product
   descriptions. TARX provided 3 options. User
   chose option 2 with modifications.]

  Turn 5: [full message]
  Turn 6: [full message]
  Turn 7: [full message]
  Turn 8: [full message]
  Turn 9: [current message]
```

**Progressive compression cascade:**

```
As conversation grows:
  Stage 1: Summarize oldest quarter -> keep recent three-quarters full
  Stage 2: Summarize oldest half -> keep recent half full
  Stage 3: Summarize everything except last 3 turns
  Stage 4: Ultra-compressed summary + current exchange only

At Stage 4 (very long conversations):
  "We've been discussing product descriptions for your equestrian brand.
   You've approved descriptions for saddles and bridles. Currently working
   on the riding boots collection. You prefer concise copy with brand voice."
  + Last 3 turns in full
```

### Summarization Implementation

**Who does the summarization?** The local model itself. This is a lightweight inference call:

```
SUMMARIZATION PROMPT:
"Compress the following conversation into a brief summary.
Preserve: key decisions, user preferences, task state, unresolved questions.
Drop: pleasantries, repeated information, exploratory tangents.
Target: under 100 tokens.

[conversation turns to summarize]"
```

**When to trigger:** Monitor token count of Tier 3 after each message. When it exceeds budget by >10%, summarize the oldest unsummarized block.

**Cost:** One extra inference call per summarization. On local, this is free (just compute time). On mesh/cloud, this is an optimization trade: spend ~50 tokens on summarization to save ~400 tokens on every subsequent prompt.

### Conversation Persistence

```
On conversation end:
  1. Full conversation history -> SQLite (complete, for audit/replay)
  2. Conversation summary -> Tier 2 observation (for future reference)
  3. Key facts extracted -> Observation storage (for knowledge building)

On next conversation start:
  1. Load Tier 1 identity (instant)
  2. Query Tier 2 for relevant past conversations (semantic search)
  3. If user references past conversation: retrieve full history from SQLite
  4. Otherwise: past conversation summaries available via RAG
```

---

## 5. Conversation Lifecycle Hooks

### onConversationStart

```
1. Load Tier 1 (identity) from user profile -> SQLite
2. Detect compute path:
   - Local available? -> Use local budgets (generous)
   - Local unavailable? -> Check mesh -> Fall back to cloud
3. Set budget allocations based on compute path
4. Query Tier 2 (knowledge) via RAG:
   - Search recent observations (last 7 days, boost)
   - Search file embeddings relevant to user's current Space
   - Apply retrieval gating rules
5. Load Tier 3 (conversation history):
   - If continuing previous conversation: load from SQLite
   - If new conversation: empty, but inject last-session summary from Tier 2
6. Construct system prompt:
   [Tier 1: Identity + Persona]
   [Tier 2: Relevant RAG chunks]
   [Tier 3: Conversation context]
7. First inference ready
```

### onMessageReceived

```
1. Parse user message
2. Classify intent (question, task, file upload, feedback, correction)
3. If intent references stored knowledge:
   - Semantic search Tier 2 for relevant chunks
   - Apply retrieval gating rules (Section 3.3)
   - Inject qualifying chunks into prompt
4. If intent is file upload:
   - Process file -> chunk -> embed -> store (async, non-blocking)
   - Acknowledge upload immediately
   - "I'll have this indexed in a moment. What would you like to know about it?"
5. If intent is correction:
   - Store correction as high-confidence observation
   - Override contradicted observation immediately
6. Construct prompt with updated context
7. Route to appropriate compute path
8. Stream response
```

### onMessageComplete

```
1. Evaluate response:
   - Did we use RAG chunks? -> Update retrieval_count on those chunks
   - Was the response coherent? (heuristic: reasonable length, no repetition)

2. Extract learnable facts:
   - New Tier 1 fact? (name, preference change) -> Update user profile
   - New Tier 2 fact? (observation about user) -> Embed and store
   - Correction of existing fact? -> Replace with confidence boost

3. Update Tier 3:
   - Append user message + TARX response to conversation history
   - Check Tier 3 token count against budget
   - If over budget: trigger summarization of oldest block

4. Check degradation state:
   - Is Tier 2 budget consistently maxed? -> Log, suggest model upgrade
   - Is summarization triggering every turn? -> Conversation is very long, warn user
   - Is RAG hit rate low? -> User's query pattern doesn't match stored knowledge
```

### onConversationEnd

```
1. Generate conversation summary:
   - Key topics discussed
   - Decisions made
   - Tasks completed or pending
   - User satisfaction signals (engaged, frustrated, resolved)

2. Store summary as Tier 2 observation (embeddable, searchable)

3. Extract and store new observations:
   - Preferences learned this session
   - Facts confirmed or corrected
   - Patterns detected

4. Update user profile (Tier 1) if warranted:
   - Observations with confidence_score > 3 -> promote to identity
   - User explicitly changed a preference -> update immediately

5. Persist full conversation to SQLite:
   - All messages (user + TARX)
   - All tool call results
   - All RAG chunks injected
   - Session metadata (duration, token usage, compute path, satisfaction)

6. Run background maintenance:
   - Observation deduplication check
   - Chunk quality score updates
   - Dead chunk flagging (if scheduled)
```

---

## 6. Graceful Degradation Chain

Every tier must be independently droppable. Holly should never see an error because the embedding server hiccupped.

### Degradation Matrix

```
SCENARIO                          IMPACT           RESPONSE
Embedding server (11437) down     No Tier 2 RAG    Skip RAG, use Tier 1 + 3 only
                                                   Tell user: "Working from our
                                                   conversation only right now"
                                                   Log event -> auto-retry in 30s

SQLite read error                 No Tier 3        Start fresh conversation
                                                   Tier 1 + 2 survive (identity +
                                                   knowledge preserved)

llama-server (11435) slow         High latency     Progressive reduction:
  TTFT > 2s                                        -> Reduce RAG chunks (3->1)
  TTFT > 5s                                        -> Drop to system + current msg
  TTFT > 10s                                       -> Surface honest latency warning

llama-server (11435) down         No local         -> Attempt mesh routing
                                  inference        -> Fall back to cloud
                                                   -> If all fail: "I'm having trouble
                                                     thinking right now. Try again
                                                     in a moment."

Mesh peer unavailable             No mesh          Route to cloud or queue request
                                  routing          Never block on mesh availability

Cloud fallback error              No cloud         If local available: use local only
                                                   If nothing available: honest error

Summarization fails               Can't compress   Keep recent turns, hard-truncate
                                  history          oldest turns (lossy but functional)

Observation storage fails         Can't learn      Continue conversation normally
                                                   Log failure -> retry on next
                                                   conversation end
```

### Recovery Priority

```
1. Always preserve: Current user message + ability to respond
2. Best-effort: Tier 2 context (RAG chunks, observations)
3. Nice-to-have: Full conversation history (summary is acceptable)
4. Background: Observation storage, audit logging, telemetry
```

---

## 7. Temperature & Sampling by Context

Different contexts demand different sampling parameters. One temperature for everything is a stability problem and a quality problem.

### Sampling Profiles

```
PROFILE          TEMP    TOP_P   TOP_K   USE CASE
factual          0.1     0.9     40      RAG-grounded answers, data lookup
precise          0.2     0.9     40      Code generation, structured output
balanced         0.4     0.95    50      General conversation (default)
creative         0.7     0.95    60      Brainstorming, writing, exploration
pushback         0.3     0.9     40      Cognitive challenge mode
```

### Auto-Selection Logic

```
If query references RAG content -> factual
If query asks for code/structured data -> precise
If query is open-ended/exploratory -> creative
If TARX is pushing back on lazy thinking -> pushback
Otherwise -> balanced

Override: User can set preferred default in Tier 1 profile
```

---

## 8. Mesh & Cloud Context Privacy

### What NEVER leaves the device

```
- Tier 1 identity details (name, email, company, personal data)
- Raw file contents (only embeddings, and only when user opts in)
- Conversation history (stays in local SQLite)
- Observation storage (stays in local embeddings)
- Any data the user hasn't explicitly marked as shareable
```

### What CAN be sent to mesh (with opt-in)

```
- Anonymized query (stripped of PII)
- Behavioral instructions ("respond concisely, pushback OK")
- Compressed context summary (no personal identifiers)
- Embedding vectors (not raw text) for semantic routing
```

### What gets sent to cloud fallback

```
- Compressed Tier 1 (behavioral only, no PII unless user opts in)
- Query text (necessary for inference)
- Minimal context (last exchange + summary)
- All subject to user's privacy settings
```

### Privacy Levels (User-Configurable)

```
LEVEL 0 - FORTRESS (default):
  Everything stays local. No mesh, no cloud.
  Trade-off: Limited to local model capabilities.

LEVEL 1 - GUARDED:
  Cloud fallback allowed for complex queries.
  PII stripped before transmission.
  No mesh sharing.

LEVEL 2 - COLLABORATIVE:
  Mesh participation enabled (give and receive compute).
  Anonymized queries only.
  Embeddings shared for routing, not raw text.

LEVEL 3 - OPEN:
  Full cloud and mesh participation.
  Context sharing enabled for maximum quality.
  User explicitly opted in with clear disclosure.
```

---

## 9. Session Health Telemetry

### Per-Conversation Metrics (Logged to Sentry)

```
context_metrics:
  tier1_tokens: int            # Tier 1 budget used
  tier2_tokens: int            # Tier 2 budget used
  tier2_chunks_injected: int   # How many RAG chunks
  tier2_avg_score: float       # Mean relevance of injected chunks
  tier2_hit_rate: float        # % queries with above-threshold chunks
  tier3_tokens: int            # Tier 3 budget used
  tier3_summarizations: int    # How many times summarization triggered
  total_tokens_used: int       # Total context tokens
  budget_utilization: float    # % of total budget consumed
  compute_path: str            # 'local' | 'mesh' | 'cloud'

performance_metrics:
  ttft_ms: int                 # Time to first token
  total_latency_ms: int        # Full response time
  tokens_per_second: float     # Generation throughput

quality_metrics:
  rag_referenced: bool         # Did response reference RAG content?
  observations_stored: int     # New observations from this conversation
  corrections_made: int        # User corrections this conversation
  summarization_quality: float # Summary vs original similarity (spot-check)

degradation_events:
  tier2_skipped: bool          # RAG unavailable
  tier3_truncated: bool        # History hard-truncated
  compute_fallback: str        # 'none' | 'mesh->cloud' | 'local->cloud'
  latency_reduction: bool      # Context reduced due to latency
```

### Alerting Thresholds

```
WARNING:
  budget_utilization > 0.9 consistently    -> User needs bigger model
  tier2_hit_rate < 0.3 consistently        -> RAG content doesn't match usage
  tier3_summarizations > 5 per conversation -> Conversations too long for model
  ttft_ms > 2000 consistently              -> Performance degradation

CRITICAL:
  compute_fallback rate > 20%              -> Local model reliability issue
  tier2_skipped rate > 10%                 -> Embedding server stability
  observations_stored = 0 for 7 days       -> Learning pipeline broken
  corrections_made > 3 per conversation    -> Model quality issue
```

---

## 10. Agentic Flow Integration

### How Agents Use the Protocol

When TARX runs an agentic flow (multi-step task with tool calls), the context protocol adapts:

```
Agent flow context budget:
  Tier 1: Identity (same as conversation)
  Tier 2: Task-specific RAG (retrieved for the task, not general user context)
  Tier 3: Agent state (tool calls made, results received, next steps)

Key difference: Agent Tier 3 is TASK STATE, not conversation history.
```

**Agent context injection:**

```
SYSTEM: [Tier 1 identity + agent instructions]
CONTEXT: [Tier 2 task-relevant RAG chunks]
TASK STATE:
  Step 1: Called shopify_list_products -> returned 47 products
  Step 2: Called shopify_get_product(id=123) -> returned "Riding Boots"
  Step 3: CURRENT - Generate product description for "Riding Boots"
  Step 4: PENDING - Update Shopify listing with new description
USER: "Update my riding boots description to be more SEO-friendly"
```

**Agent observation storage:**

After an agentic flow completes:
```
Store observation: "User ran Shopify product description update agent.
  Updated 3 products (riding boots, saddle pad, bridle).
  Preferred style: concise with SEO keywords. Total time: 45s."

This observation is now Tier 2 knowledge - next time user asks about
product descriptions, TARX knows the history and preferences.
```

### MCP Tool Context

When TARX calls MCP tools, the results are Tier 3 (conversation-scoped):

```
Tool results are:
  - Injected into current prompt as context
  - NOT stored as Tier 2 (too granular, would pollute RAG)
  - Summarized in session summary at conversation end
  - Available for re-query if needed (MCP tools are idempotent)
```

---

## 11. Implementation Checklist

### Phase 1 - Foundation (Ship with V1)

- [ ] Tier 1 identity loading from user profile (SQLite)
- [ ] Tier 2 RAG with semantic search (existing, enhance with quality scoring)
- [ ] Tier 3 sliding window with summarization
- [ ] Adaptive budget calculation based on detected model context window
- [ ] Basic retrieval gating (cosine threshold + budget cap)
- [ ] Conversation persistence to SQLite
- [ ] Basic observation storage (new facts from conversations)
- [ ] Graceful degradation for embedding server down
- [ ] Temperature selection by query type

### Phase 2 - Intelligence (V1.1)

- [ ] Smart chunking (semantic boundaries, heading prefixes)
- [ ] Multi-signal retrieval scoring (recency, quality, type match)
- [ ] Observation deduplication and merging
- [ ] Observation -> Tier 1 promotion (high confidence facts)
- [ ] Conversation summary generation at session end
- [ ] RAG audit pipeline (daily: dead chunks, duplicates, quality)
- [ ] Per-conversation telemetry to Sentry
- [ ] Mesh context compression and privacy gating

### Phase 3 - Mastery (V1.2+)

- [ ] Quality feedback loop (retrieval usefulness tracking)
- [ ] Pattern detection ("asks about X every Monday")
- [ ] Proactive context surfacing ("You usually review inventory on Mondays")
- [ ] Cross-Space knowledge routing (query multiple Spaces)
- [ ] Chunk freshness management (stale content flagging)
- [ ] User-configurable decay rates
- [ ] Full telemetry dashboards
- [ ] A/B testing framework for chunking strategies

---

## 12. The Protocol in One Diagram

```
                      TARX Context Protocol

   Tier 1         Tier 2         Tier 3
  Identity       Knowledge        Convo

  Profile         RAG            History
  Persona         Observ.        Tasks
  Prefs           Patterns       Results
     |               |               |
     v               v               v
  +-----------------------------------------+
  |        Adaptive Budget Manager           |
  | Local: generous | Mesh: moderate | Cloud: lean
  +-----------------------------------------+
                    |
                    v
  +-----------------------------------------+
  |          Prompt Construction             |
  | [System + T1] [RAG + T2] [History + T3] |
  +-----------------------------------------+
                    |
                    v
  +-----------------------------------------+
  |         Inference Engine                 |
  | Local (11435) -> Mesh (11436) -> Cloud   |
  +-----------------------------------------+
                    |
                    v
  +-----------------------------------------+
  |        Post-Response Pipeline            |
  | Learn -> Store -> Summarize -> Log       |
  +-----------------------------------------+
```

---

## 13. Why This Wins

**vs. ChatGPT:** OpenAI stores everything in cloud. Their "memory" is a list of bullet points, not a semantic knowledge graph. They can't do local, can't do mesh, and every token costs them money. TARX's local-first protocol means richer context at zero marginal cost.

**vs. Claude:** Anthropic's memory is conversation-derived text snippets. No embeddings, no RAG over user files, no observation quality scoring. Claude's context window is massive but ephemeral - nothing persists beyond the conversation without explicit memory saves. TARX builds cumulative intelligence automatically.

**vs. Copilot/Cursor:** IDE-focused, no prosumer layer, no identity tier, no cross-domain knowledge. They optimize for code context, not human context. TARX optimizes for the person, not just the task.

**vs. Local-only tools (Ollama, LM Studio):** No protocol. No persistent memory. No observation learning. No quality management. Every conversation starts from zero. TARX is the first local-first system with production-grade context management.

The protocol IS the moat. Anyone can run a local model. Nobody else has this.

---

**Document prepared by:** TARX AI
**Protocol origin:** CC <> TARX protocol (CLAUDE.md + MEMORY.md + SESSION_LOG.md)
**Last updated:** February 20, 2026
**Version:** 1.0
