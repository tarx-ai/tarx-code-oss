#!/usr/bin/env node
/**
 * TARX Core MCP Server v1.2.1 -- 29 tools
 *
 * Merged server combining:
 * - tarx-mcp-server (core inference, spaces, sessions, files/RAG, sidebar tools)
 * - tarx-claude-memory (memory tools: store, search, recall, list, forget, stats + session sync)
 *
 * Tool categories (29 total):
 *   Core: 2         | tarx_health, tarx_chat
 *   Spaces: 3       | tarx_list_spaces, tarx_create_space, tarx_get_space
 *   Sessions: 4     | tarx_list_sessions, tarx_create_session, tarx_get_chat_history, tarx_send_message
 *   Memory: 5       | tarx_memory_store, tarx_memory_search, tarx_memory_recall, tarx_memory_list, tarx_memory_delete
 *   Memory Sess: 1  | tarx_memory_thread_to_session
 *   Files: 3        | tarx_list_files, tarx_upload_file, tarx_get_file
 *   Smart: 2        | tarx_system_brief, tarx_project_context
 *   GTM Invites: 2  | tarx_validate_invite, tarx_redeem_invite
 *   GTM Profiles: 2 | tarx_get_profile, tarx_update_profile
 *   GTM Skills: 4   | tarx_list_skills, tarx_install_skill, tarx_uninstall_skill, tarx_get_active_skills
 *   GTM Metrics: 1  | tarx_weekly_report
 *
 * @package tarx-core
 * @version 1.2.0
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  storeConversationTurn,
  getDatabaseStats,
  listSpaces,
  createSpace,
  getSpace,
  listSessions,
  createSession,
  getSession,
  addMessage,
  getMessages,
  listFiles,
  uploadFile,
  getFileContent,
  generateFileEmbeddings,
  searchKnowledgeEmbeddings,
  getKnowledgeEmbeddingCount,
  collectTrainingData,
  // File organization (Phase 1)
  deleteFile,
  addWatch,
  // GTM: Invite codes
  validateInviteCode,
  redeemInviteCode,
  // GTM: User profiles
  getProfile,
  upsertProfile,
  // GTM: Skills
  listSkills,
  installSkill,
  uninstallSkill,
  getActiveSkills,
  // GTM: Weekly metrics
  getWeeklyMetrics
} from "./database.js";

// TARX Model Router - Feb 2026
import { classifyIntent, getRouteIndicator, type RouteDecision } from "./router.js";
import { getNetworkResponse, hasApiKey } from "./network-model.js";

// Memory database layer (merged from tarx-claude-memory)
import {
  storeMemory,
  searchMemories,
  getAllMemories,
  deleteMemory,
  getMemoryStats,
  threadMessage,
  getRecentMessages,
  threadToSession,
} from "./memory-database.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const INFERENCE_PORT = 11435;
const EMBED_PORT = 11437;
const MESH_PORT = 11436;
const HARNESS_PORT = 11439;

// System prompt for local reasoning model - prevents fake action execution
const TARX_LOCAL_REASONING_PROMPT = `You are TARX, a local AI reasoning engine on the user's machine.

RULES (follow these exactly):
1. NO CODE BLOCKS unless the user explicitly asks you to write code.
2. NO "Do you want me to proceed?" or "Would you like me to..." — just answer.
3. NO bullet lists or numbered steps unless asked for a list.
4. NO "Certainly!", "Great question!", "I'd be happy to help!"
5. NO "Let me know if you need anything else!"
6. Under 3 sentences for simple questions. Talk like a coworker, not a manual.
7. Be direct. No hedging ("I think", "perhaps", "maybe").
8. You can THINK, ANALYZE, EXPLAIN, PLAN, and SUGGEST.
9. You CANNOT execute commands, create files, or modify databases — route actions through the TARX bridge.
10. NEVER say "Done", "Created", "Executed" for actions you did not perform.
11. NEVER generate fake status reports or step-by-step execution narratives.

WHEN TO USE CODE: Only when the user says "write", "code", "implement", "fix this code", or shares a code snippet. Status questions, concepts, and chat get plain English.

WHEN ASKED TO PERFORM ACTIONS:
"To [do X], the steps would be: [brief plan]. Route through the TARX bridge to execute."`;

// ============================================================================
// SERVER SETUP
// ============================================================================

const server = new McpServer({
  name: "tarx-core",
  version: "1.0.0"
});

// ============================================================================
// HELPERS
// ============================================================================

/** Check if a service is alive on a given port */
async function checkPort(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(2000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Call the Workbench UI harness (sidebar control) */
async function callHarness(endpoint: string, method: string = "GET", body?: object): Promise<unknown> {
  const url = `http://127.0.0.1:${HARNESS_PORT}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Harness error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/** Active in-flight requests (for cancel support) */
const activeRequests = new Map<string, AbortController>();

// ============================================================================
// CORE TOOLS (7)
// ============================================================================

// Tool: Health check all TARX services
server.tool(
  "tarx_health",
  "Check health status of all TARX services (inference, embeddings, mesh)",
  {},
  async () => {
    // Fetch mesh status with peer count if available
    let meshStatus: { healthy: boolean; peers?: number; mode?: string } = { healthy: false };
    try {
      const meshHealthy = await checkPort(MESH_PORT);
      meshStatus.healthy = meshHealthy;
      if (meshHealthy) {
        const res = await fetch(`http://localhost:${MESH_PORT}/mesh/status`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json() as any;
          meshStatus.peers = data.peer_count ?? data.peers?.length ?? 0;
          meshStatus.mode = data.mode;
        }
      }
    } catch { /* ignore */ }

    const checks = {
      inference: { port: INFERENCE_PORT, healthy: await checkPort(INFERENCE_PORT) },
      embeddings: { port: EMBED_PORT, healthy: await checkPort(EMBED_PORT) },
      mesh: { port: MESH_PORT, ...meshStatus },
      timestamp: new Date().toISOString()
    };
    return {
      content: [{ type: "text", text: JSON.stringify(checks, null, 2) }]
    };
  }
);

// Cache for space IDs to avoid repeated database queries
let cachedSpaceIds: string[] | null = null;
let cacheTimestamp: number = 0;
const SPACE_CACHE_TTL_MS = 60000; // 1 minute

function getAvailableSpaceIds(): string[] {
  const now = Date.now();
  if (cachedSpaceIds && (now - cacheTimestamp) < SPACE_CACHE_TTL_MS) {
    return cachedSpaceIds;
  }

  const spaces = listSpaces();
  cachedSpaceIds = spaces.map(s => s.id);
  cacheTimestamp = now;
  return cachedSpaceIds;
}

// Tool: Chat with TARX (routes between Local and Network models)

server.tool(
  "tarx_chat",
  "Send a prompt to TARX - routes to Local (Qwen) or Network (Claude) based on intent",
  {
    prompt: z.string().describe("The prompt to send"),
    maxTokens: z.number().optional().describe("Maximum tokens in response (default: 300)"),
    stream: z.boolean().optional().describe("Whether to stream response (default: false)"),
    forceRoute: z.enum(["local", "network"]).optional().describe("Force a specific route (optional)"),
    spaceId: z.string().optional().describe("Space ID for RAG context lookup (optional - searches all spaces if not provided)"),
    useRAG: z.boolean().optional().describe("Enable/disable RAG injection (default: true)")
  },
  async ({ prompt, maxTokens = 300, stream = false, forceRoute, spaceId, useRAG = true }) => {
    const start = Date.now();
    let ragChunksUsed = 0;
    let enhancedPrompt = prompt;
    let ragSourceSpaces: string[] = [];

    // RAG Context Injection - AUTO-ENABLED by default
    if (useRAG) {
      try {
        let ragResults: Array<{ content: string; title: string; similarity: number; sourceId: string | null; spaceId?: string }> = [];

        if (spaceId) {
          // Single-space RAG (original behavior)
          ragResults = await searchKnowledgeEmbeddings(spaceId, prompt, 10);
          ragSourceSpaces = [spaceId];
          console.error(`[TARX RAG] Searching single space: ${spaceId}`);
        } else {
          // Federated RAG - search across ALL spaces
          const allSpaceIds = getAvailableSpaceIds();
          console.error(`[TARX RAG] Federated search across ${allSpaceIds.length} spaces`);

          // Search each space and merge results
          const federatedResults: Array<{ content: string; title: string; similarity: number; sourceId: string | null; spaceId: string }> = [];
          for (const sid of allSpaceIds) {
            try {
              const spaceResults = await searchKnowledgeEmbeddings(sid, prompt, 5);
              for (const result of spaceResults) {
                federatedResults.push({ ...result, spaceId: sid });
              }
            } catch (err) {
              console.error(`[TARX RAG] Failed to search space ${sid}:`, err);
            }
          }

          // Sort all results by similarity and take top N
          ragResults = federatedResults
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 10);

          ragSourceSpaces = [...new Set(ragResults.map(r => r.spaceId!))];
          console.error(`[TARX RAG] Federated search found ${ragResults.length} chunks across ${ragSourceSpaces.length} spaces`);
        }

        // Filter by similarity threshold and inject into prompt
        const relevantChunks = ragResults.filter(r => r.similarity >= 0.5);

        if (relevantChunks.length > 0) {
          const contextBlocks = relevantChunks.map(chunk =>
            `[Source: ${chunk.title}]\n${chunk.content}`
          ).join('\n\n---\n\n');

          enhancedPrompt = `<relevant_context>\n${contextBlocks}\n</relevant_context>\n\n${prompt}`;
          ragChunksUsed = relevantChunks.length;
          console.error(`[TARX RAG] Injected ${ragChunksUsed} chunks (similarity >= 0.5)`);
        }
      } catch (ragError) {
        console.error("[TARX RAG] Error searching knowledge:", ragError);
        // Continue with original prompt if RAG fails
      }
    }

    // Route classification (use original prompt for intent detection)
    let routeDecision: RouteDecision;
    if (forceRoute) {
      routeDecision = {
        route: forceRoute,
        confidence: 1.0,
        reason: `Forced ${forceRoute} route`
      };
    } else {
      routeDecision = classifyIntent(prompt);
    }

    const indicator = getRouteIndicator(routeDecision.route);
    console.error(`[TARX Router] ${indicator.emoji} ${routeDecision.route} (${routeDecision.confidence.toFixed(2)}) - ${routeDecision.reason}`);

    try {
      let content: string;
      let model: string;
      let tokens: { prompt_tokens?: number; completion_tokens?: number } | undefined;

      // NETWORK ROUTE - Use Claude API
      if (routeDecision.route === 'network') {
        if (!hasApiKey()) {
          // Fall back to local if no API key
          console.error("[TARX Router] No API key, falling back to local");
          routeDecision = { route: 'local', confidence: 1.0, reason: 'No API key - fallback' };
        } else {
          content = await getNetworkResponse(enhancedPrompt);
          model = "claude-sonnet";

          const latency = Date.now() - start;

          // Store conversation in database
          let dbResult = null;
          try {
            dbResult = storeConversationTurn(prompt, content, {
              model: "claude-sonnet",
              latency_ms: latency
            });

            // Collect training data
            collectTrainingData({
              instruction: prompt,
              response: content,
              context: ragChunksUsed > 0 ? enhancedPrompt : undefined,
              modelUsed: "claude-sonnet",
              route: 'network',
              ragChunksUsed: ragChunksUsed,
              ragContext: ragChunksUsed > 0 ? `Federated search across ${ragSourceSpaces.length} spaces` : undefined,
              latencyMs: latency,
              sessionId: dbResult.sessionId,
              userMessageId: dbResult.userMessageId,
              assistantMessageId: dbResult.assistantMessageId
            });
          } catch (dbError) {
            console.error("Failed to store conversation:", dbError);
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                response: content,
                latency_ms: latency,
                route: routeDecision.route,
                routeReason: routeDecision.reason,
                model: "claude-sonnet",
                rag_enabled: useRAG,
                rag_chunks_used: ragChunksUsed,
                rag_mode: spaceId ? "single-space" : "federated",
                rag_spaces_searched: ragSourceSpaces.length,
                stored: dbResult ? {
                  sessionId: dbResult.sessionId,
                  userMessageId: dbResult.userMessageId,
                  assistantMessageId: dbResult.assistantMessageId
                } : null
              }, null, 2)
            }]
          };
        }
      }

      // LOCAL ROUTE - Use Qwen via llama-server
      const response = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "local",
          messages: [
            { role: "system", content: TARX_LOCAL_REASONING_PROMPT },
            { role: "user", content: enhancedPrompt }
          ],
          max_tokens: maxTokens,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Inference server returned ${response.status}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
        model?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const msg = data.choices?.[0]?.message;
      content = msg?.content || msg?.reasoning_content || "No response";
      model = data.model || "qwen-8b";
      tokens = data.usage;

      const latency = Date.now() - start;

      // Store conversation in database
      let dbResult = null;
      try {
        dbResult = storeConversationTurn(prompt, content, {
          model: model,
          promptTokens: tokens?.prompt_tokens,
          responseTokens: tokens?.completion_tokens,
          latency_ms: latency
        });

        // Collect training data
        collectTrainingData({
          instruction: prompt,
          response: content,
          context: ragChunksUsed > 0 ? enhancedPrompt : undefined,
          modelUsed: model,
          route: 'local',
          ragChunksUsed: ragChunksUsed,
          ragContext: ragChunksUsed > 0 ? `Federated search across ${ragSourceSpaces.length} spaces` : undefined,
          tokensPrompt: tokens?.prompt_tokens,
          tokensCompletion: tokens?.completion_tokens,
          latencyMs: latency,
          sessionId: dbResult.sessionId,
          userMessageId: dbResult.userMessageId,
          assistantMessageId: dbResult.assistantMessageId
        });
      } catch (dbError) {
        console.error("Failed to store conversation:", dbError);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            response: content,
            latency_ms: latency,
            route: routeDecision.route,
            routeReason: routeDecision.reason,
            model: model,
            tokens: tokens,
            rag_enabled: useRAG,
            rag_chunks_used: ragChunksUsed,
            rag_mode: spaceId ? "single-space" : "federated",
            rag_spaces_searched: ragSourceSpaces.length,
            stored: dbResult ? {
              sessionId: dbResult.sessionId,
              userMessageId: dbResult.userMessageId,
              assistantMessageId: dbResult.assistantMessageId
            } : null
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
            route: routeDecision.route,
            latency_ms: Date.now() - start
          })
        }],
        isError: true
      };
    }
  }
);

// ============================================================================
// SPACE MANAGEMENT TOOLS (3)
// ============================================================================

// Tool: List spaces
server.tool(
  "tarx_list_spaces",
  "List all spaces in TARX app",
  {},
  async () => {
    try {
      const spaces = listSpaces();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            spaces,
            count: spaces.length,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to list spaces"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Create space
server.tool(
  "tarx_create_space",
  "Create a new space in TARX app",
  {
    name: z.string().describe("Name of the space"),
    description: z.string().optional().describe("Description of the space"),
    emoji: z.string().optional().describe("Emoji icon for the space")
  },
  async ({ name, description, emoji }) => {
    try {
      const space = createSpace(name, description, emoji);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            space,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to create space"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Get space details
server.tool(
  "tarx_get_space",
  "Get details of a specific space",
  {
    spaceId: z.string().describe("ID of the space to get")
  },
  async ({ spaceId }) => {
    try {
      const space = getSpace(spaceId);
      if (!space) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: "Space not found" })
          }],
          isError: true
        };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ space }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get space"
          })
        }],
        isError: true
      };
    }
  }
);

// ============================================================================
// SESSION/CHAT MANAGEMENT TOOLS (4)
// ============================================================================

// Tool: List sessions in space
server.tool(
  "tarx_list_sessions",
  "List all sessions/chats in a space",
  {
    spaceId: z.string().describe("ID of the space")
  },
  async ({ spaceId }) => {
    try {
      const sessions = listSessions(spaceId);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            spaceId,
            sessions,
            count: sessions.length
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to list sessions"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Create session in space
server.tool(
  "tarx_create_session",
  "Create a new session/chat in a space",
  {
    spaceId: z.string().describe("ID of the space"),
    title: z.string().optional().describe("Title for the session")
  },
  async ({ spaceId, title }) => {
    try {
      const sessionId = createSession(spaceId, title);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            sessionId,
            spaceId,
            title: title || `Session ${new Date().toLocaleString()}`
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to create session"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Get chat history

server.tool(
  "tarx_get_chat_history",
  "Get full conversation history for a session",
  {
    sessionId: z.string().describe("ID of the session"),
    limit: z.number().optional().describe("Max number of messages to return")
  },
  async ({ sessionId, limit }) => {
    try {
      const messages = getMessages(sessionId, limit);
      const session = getSession(sessionId);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sessionId,
            session,
            messages,
            count: messages.length
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get chat history"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Send message to session

server.tool(
  "tarx_send_message",
  "Send message to a specific session, get AI response, and store both in database",
  {
    sessionId: z.string().describe("ID of the session to send message to"),
    message: z.string().describe("The message to send"),
    maxTokens: z.number().optional().describe("Maximum tokens in response (default: 300)")
  },
  async ({ sessionId, message, maxTokens = 300 }) => {
    const start = Date.now();

    try {
      // Store user message
      const userMsgId = addMessage(sessionId, "user", message);

      // Load conversation history for context
      const history = getMessages(sessionId);
      const conversationMessages = history.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Prepend system prompt to prevent fake actions
      const messagesWithSystem = [
        { role: "system", content: TARX_LOCAL_REASONING_PROMPT },
        ...conversationMessages
      ];

      // Get AI response with full conversation history
      const response = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "local",
          messages: messagesWithSystem,
          max_tokens: maxTokens,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Inference server returned ${response.status}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const aiResponse = data.choices?.[0]?.message?.content || "No response";
      const latency = Date.now() - start;

      // Store AI response
      const aiMsgId = addMessage(sessionId, "assistant", aiResponse, {
        model: "tarx-local",
        tokens: data.usage?.completion_tokens,
        latency_ms: latency
      });

      // Collect training data
      try {
        collectTrainingData({
          instruction: message,
          response: aiResponse,
          modelUsed: "tarx-local",
          route: 'local',
          tokensPrompt: data.usage?.prompt_tokens,
          tokensCompletion: data.usage?.completion_tokens,
          latencyMs: latency,
          sessionId: sessionId,
          userMessageId: userMsgId,
          assistantMessageId: aiMsgId
        });
      } catch (trainError) {
        console.error("Failed to collect training data:", trainError);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            sessionId,
            userMessageId: userMsgId,
            assistantMessageId: aiMsgId,
            response: aiResponse,
            latency_ms: latency,
            tokens: data.usage
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to send message",
            latency_ms: Date.now() - start
          })
        }],
        isError: true
      };
    }
  }
);

// ============================================================================
// MEMORY TOOLS (8) - merged from tarx-claude-memory + claude-mem patterns
// ============================================================================

// Tool: Store a memory

server.tool(
  "tarx_memory_store",
  "Store information in TARX memory for future recall. Use this to save important context, decisions, preferences, or facts you want to remember.",
  {
    content: z.string().describe("The information to remember"),
    importance: z.number().min(0).max(1).optional().describe("Importance score 0-1 (default: 0.5)")
  },
  async ({ content, importance }) => {
    try {
      const memory = storeMemory(content, { importance });

      // Also thread a system note into chat history
      threadMessage('system', `[Memory saved] ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            memoryId: memory.id,
            message: "Memory stored successfully",
            importance: memory.importance
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to store memory"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Store a structured observation (claude-mem inspired)


// Tool: Search memories semantically

server.tool(
  "tarx_memory_search",
  "Search TARX memory for relevant information. Returns memories that match your query.",
  {
    query: z.string().describe("What to search for"),
    limit: z.number().min(1).max(50).optional().describe("Maximum results (default: 10)")
  },
  async ({ query, limit = 10 }) => {
    try {
      const memories = searchMemories(query, limit);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            count: memories.length,
            memories: memories.map(m => ({
              id: m.id,
              content: m.content,
              importance: m.importance,
              accessCount: m.access_count,
              createdAt: new Date(m.created_at).toISOString()
            }))
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Search failed"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Progressive disclosure search - index mode (lightweight, ~50 tokens/result)


// Tool: Recall context for the current conversation

server.tool(
  "tarx_memory_recall",
  "Recall relevant context from TARX memory based on the current topic. Use this at the start of conversations to load relevant history.",
  {
    topic: z.string().describe("The current topic or context to recall memories for"),
    limit: z.number().min(1).max(20).optional().describe("Maximum memories to recall (default: 5)")
  },
  async ({ topic, limit = 5 }) => {
    try {
      const memories = searchMemories(topic, limit);
      const recentMsgs = getRecentMessages(10);

      // Format context for injection
      let context = "";

      if (memories.length > 0) {
        context += "**Relevant memories:**\n";
        memories.forEach((m, i) => {
          context += `${i + 1}. ${m.content}\n`;
        });
      }

      if (recentMsgs.length > 0) {
        context += "\n**Recent conversation context:**\n";
        recentMsgs.slice(0, 5).reverse().forEach(msg => {
          context += `[${msg.role}]: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}\n`;
        });
      }

      return {
        content: [{
          type: "text",
          text: context || "No relevant memories found for this topic."
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error recalling memories: ${error instanceof Error ? error.message : "Unknown error"}`
        }],
        isError: true
      };
    }
  }
);

// Tool: List all memories

server.tool(
  "tarx_memory_list",
  "List all stored memories in TARX, optionally filtered by recency",
  {
    limit: z.number().min(1).max(100).optional().describe("Maximum memories to list (default: 20)")
  },
  async ({ limit = 20 }) => {
    try {
      const memories = getAllMemories(limit);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            count: memories.length,
            memories: memories.map(m => ({
              id: m.id,
              content: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : ''),
              importance: m.importance,
              accessCount: m.access_count,
              createdAt: new Date(m.created_at).toISOString()
            }))
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to list memories"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Delete a memory
server.tool(
  "tarx_memory_delete",
  "Remove a specific memory from TARX storage",
  {
    memoryId: z.string().describe("The ID of the memory to forget")
  },
  async ({ memoryId }) => {
    try {
      const deleted = deleteMemory(memoryId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: deleted,
            message: deleted ? "Memory forgotten" : "Memory not found"
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to forget memory"
          })
        }],
        isError: true
      };
    }
  }
);


// ============================================================================
// MEMORY SESSION TOOLS (4) - Claude.ai session sync, deduplicated
// ============================================================================

// Tool: Create a dedicated session for conversation tracking


// Tool: Thread a message to a specific session

server.tool(
  "tarx_memory_thread_to_session",
  "Thread a message to a specific TARX session. Use this to add messages to an existing conversation that will be persisted.",
  {
    session_id: z.string().describe("Session ID to thread to"),
    role: z.enum(["user", "assistant"]).describe("Who sent the message"),
    content: z.string().describe("Message content"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Additional metadata (attachments, code blocks, etc.)")
  },
  async ({ session_id, role, content, metadata }) => {
    try {
      const result = threadToSession({ session_id, role, content, metadata });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            message_id: result.message_id,
            session_id: result.session_id,
            threaded: result.threaded,
            timestamp: result.timestamp,
            message: "Message threaded to session"
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to thread message"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Get full conversation history for a session


// ============================================================================
// THREAD TOOL (1)
// ============================================================================


// ============================================================================
// FILE MANAGEMENT TOOLS (5)
// ============================================================================

// Tool: List files
server.tool(
  "tarx_list_files",
  "List files, optionally filtered by space",
  {
    spaceId: z.string().optional().describe("Optional space ID to filter files")
  },
  async ({ spaceId }) => {
    try {
      const files = listFiles(spaceId);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            files,
            count: files.length,
            spaceId: spaceId || "all"
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to list files"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Upload file (with automatic RAG embedding generation)

server.tool(
  "tarx_upload_file",
  "Upload a file to a space and automatically generate RAG embeddings",
  {
    spaceId: z.string().describe("ID of the space to upload to"),
    filename: z.string().describe("Name of the file"),
    content: z.string().describe("Content of the file"),
    mimeType: z.string().optional().describe("MIME type (default: text/plain)"),
    generateEmbeddings: z.boolean().optional().describe("Auto-generate RAG embeddings (default: true)")
  },
  async ({ spaceId, filename, content, mimeType, generateEmbeddings: genEmbeddings = true }) => {
    try {
      const file = uploadFile(spaceId, filename, content, mimeType);

      // Auto-generate RAG embeddings (unless explicitly disabled)
      let embeddingResult: { success: boolean; chunks: number; error?: string } = { success: false, chunks: 0, error: 'Skipped' };
      if (genEmbeddings !== false) {
        embeddingResult = await generateFileEmbeddings(spaceId, file.id, filename, content);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            file,
            embeddings: {
              generated: embeddingResult.success,
              chunks: embeddingResult.chunks,
              error: embeddingResult.error
            },
            message: embeddingResult.success
              ? `File uploaded and ${embeddingResult.chunks} RAG embeddings generated.`
              : `File uploaded. Embedding generation ${genEmbeddings === false ? 'skipped' : 'failed'}: ${embeddingResult.error}`
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to upload file"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Get file content
server.tool(
  "tarx_get_file",
  "Get the content of a file by ID",
  {
    fileId: z.string().describe("ID of the file to retrieve")
  },
  async ({ fileId }) => {
    try {
      const content = getFileContent(fileId);
      if (content === null) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: "File not found" })
          }],
          isError: true
        };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            fileId,
            content,
            size: content.length
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get file"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Search knowledge base (RAG)


// ============================================================================
// TRAINING DATA TOOLS (3 tools)
// ============================================================================


// ============================================================================
// SIDEBAR CONTROL TOOLS (3 core)
// ============================================================================

// Tool: Refresh sidebar UI sections


// ============================================================================
// SMART ENDPOINTS (3)
// ============================================================================

// Tool: System brief - single call returning combined system status
server.tool(
  "tarx_system_brief",
  "Get a comprehensive system status brief in a single call: inference, embeddings, mesh, database stats, memory stats, and any active errors",
  {},
  async () => {
    try {
      const [inference, embeddings, meshHealthy] = await Promise.all([
        checkPort(INFERENCE_PORT),
        checkPort(EMBED_PORT),
        checkPort(MESH_PORT)
      ]);

      // Fetch mesh peer count if running
      let meshPeers = 0;
      let meshMode: string | undefined;
      if (meshHealthy) {
        try {
          const res = await fetch(`http://localhost:${MESH_PORT}/mesh/status`, { signal: AbortSignal.timeout(3000) });
          if (res.ok) {
            const data = await res.json() as any;
            meshPeers = data.peer_count ?? data.peers?.length ?? 0;
            meshMode = data.mode;
          }
        } catch { /* ignore */ }
      }

      let dbStats = null;
      try {
        dbStats = getDatabaseStats();
      } catch { /* database may not be initialized */ }

      let memStats = null;
      try {
        memStats = getMemoryStats();
      } catch { /* memory database may not be initialized */ }

      const activeErrors: string[] = [];
      if (!inference) activeErrors.push(`Inference server offline (port ${INFERENCE_PORT})`);
      if (!embeddings) activeErrors.push(`Embedding server offline (port ${EMBED_PORT})`);
      if (!meshHealthy) activeErrors.push(`Mesh network offline (port ${MESH_PORT})`);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            inference: { port: INFERENCE_PORT, healthy: inference },
            embeddings: { port: EMBED_PORT, healthy: embeddings },
            mesh: { port: MESH_PORT, healthy: meshHealthy, peers: meshPeers, mode: meshMode },
            db_stats: dbStats,
            memory_stats: memStats,
            active_errors: activeErrors,
            active_requests: activeRequests.size,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get system brief"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Project context - single call returning full space context
server.tool(
  "tarx_project_context",
  "Get full project context for a space in a single call: space details, sessions, recent messages, files, and knowledge stats",
  {
    spaceId: z.string().describe("ID of the space to get context for")
  },
  async ({ spaceId }) => {
    try {
      const space = getSpace(spaceId);
      if (!space) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: "Space not found", spaceId })
          }],
          isError: true
        };
      }

      const sessions = listSessions(spaceId);
      const files = listFiles(spaceId);
      const embeddingCount = getKnowledgeEmbeddingCount(spaceId);

      // Get recent messages from last 3 sessions
      const recentMessages: Array<{ sessionId: string; sessionTitle: string; messages: unknown[] }> = [];
      const recentSessions = sessions.slice(0, 3);
      for (const session of recentSessions) {
        try {
          const msgs = getMessages(session.id, 5);
          recentMessages.push({
            sessionId: session.id,
            sessionTitle: session.title || 'Untitled',
            messages: msgs.map(m => ({
              role: m.role,
              content: m.content.substring(0, 200) + (m.content.length > 200 ? '...' : ''),
              created_at: m.created_at
            }))
          });
        } catch { /* skip sessions with read errors */ }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            space,
            sessions: {
              total: sessions.length,
              list: sessions.map(s => ({
                id: s.id,
                title: s.title,
                message_count: s.message_count,
                updated_at: s.updated_at
              }))
            },
            recent_messages: recentMessages,
            files: {
              total: files.length,
              list: files.map(f => ({
                id: f.id,
                filename: f.filename,
                size: f.size_bytes
              }))
            },
            knowledge_stats: {
              embedding_count: embeddingCount,
              file_count: files.length
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get project context",
            spaceId
          })
        }],
        isError: true
      };
    }
  }
);


// ============================================================================
// FILE ORGANIZATION (Phase 1)
// ============================================================================


// ============================================================================
// GTM TOOLS — Invite Codes, Profiles, Skills, Weekly Report
// ============================================================================

// Tool: Validate an invite code
server.tool(
  "tarx_validate_invite",
  "Validate a TARX invite code and return tier info",
  {
    code: z.string().describe("Invite code to validate (format: TARX-WORD-DIGITS)")
  },
  async ({ code }) => {
    try {
      const result = validateInviteCode(code.toUpperCase().trim());
      return {
        content: [{ type: "text", text: JSON.stringify(result) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : "Validation failed" }) }],
        isError: true
      };
    }
  }
);

// Tool: Redeem an invite code
server.tool(
  "tarx_redeem_invite",
  "Redeem a validated invite code",
  {
    code: z.string().describe("Invite code to redeem"),
    userId: z.string().optional().describe("User ID (default: 'default')")
  },
  async ({ code, userId }) => {
    try {
      const success = redeemInviteCode(code.toUpperCase().trim(), userId || 'default');
      return {
        content: [{ type: "text", text: JSON.stringify({ success }) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : "Redeem failed" }) }],
        isError: true
      };
    }
  }
);

// Tool: Get user profile
server.tool(
  "tarx_get_profile",
  "Get user profile (name, email, tier, preferences)",
  {
    userId: z.string().optional().describe("User ID (default: 'default')")
  },
  async ({ userId }) => {
    try {
      const profile = getProfile(userId || 'default');
      return {
        content: [{ type: "text", text: JSON.stringify(profile || { id: 'default', display_name: null, tier: 'beta' }) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : "Profile fetch failed" }) }],
        isError: true
      };
    }
  }
);

// Tool: Update user profile
server.tool(
  "tarx_update_profile",
  "Create or update user profile",
  {
    display_name: z.string().optional().describe("Display name"),
    email: z.string().optional().describe("Email address"),
    tier: z.string().optional().describe("User tier (beta/pro/enterprise)"),
    invite_code: z.string().optional().describe("Invite code used"),
    preferences: z.string().optional().describe("JSON preferences string")
  },
  async (params) => {
    try {
      const profile = upsertProfile(params);
      return {
        content: [{ type: "text", text: JSON.stringify(profile) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : "Profile update failed" }) }],
        isError: true
      };
    }
  }
);

// Tool: List skills
server.tool(
  "tarx_list_skills",
  "List available skills, optionally filtered by category or search query",
  {
    category: z.string().optional().describe("Filter by category (Code, Data, DevOps, Writing, Research, Productivity)"),
    search: z.string().optional().describe("Search query for skill name/description")
  },
  async ({ category, search }) => {
    try {
      const skills = listSkills(category, search);
      return {
        content: [{ type: "text", text: JSON.stringify({ count: skills.length, skills: skills.map(s => ({ id: s.id, name: s.name, description: s.description, category: s.category, tier: s.tier, install_count: s.install_count })) }, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : "List failed" }) }],
        isError: true
      };
    }
  }
);

// Tool: Install a skill
server.tool(
  "tarx_install_skill",
  "Install a skill for the user (adds to active skills for system prompt injection)",
  {
    skillId: z.string().describe("Skill ID to install")
  },
  async ({ skillId }) => {
    try {
      const success = installSkill(skillId);
      return {
        content: [{ type: "text", text: JSON.stringify({ success, skillId }) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : "Install failed" }) }],
        isError: true
      };
    }
  }
);

// Tool: Uninstall a skill
server.tool(
  "tarx_uninstall_skill",
  "Remove a skill from user's active skills",
  {
    skillId: z.string().describe("Skill ID to uninstall")
  },
  async ({ skillId }) => {
    try {
      const success = uninstallSkill(skillId);
      return {
        content: [{ type: "text", text: JSON.stringify({ success, skillId }) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : "Uninstall failed" }) }],
        isError: true
      };
    }
  }
);

// Tool: Get active skills with full context
server.tool(
  "tarx_get_active_skills",
  "Get user's active skills with full system prompt context",
  {
    userId: z.string().optional().describe("User ID (default: 'default')")
  },
  async ({ userId }) => {
    try {
      const skills = getActiveSkills(userId || 'default');
      const context = skills.map(s =>
        `### ${s.name} (${s.category})\n${s.system_prompt}`
      ).join('\n\n');

      return {
        content: [{ type: "text", text: JSON.stringify({ count: skills.length, skills: skills.map(s => ({ id: s.id, name: s.name, category: s.category })), context }, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : "Failed to get active skills" }) }],
        isError: true
      };
    }
  }
);

// Tool: Weekly report
server.tool(
  "tarx_weekly_report",
  "Generate weekly usage metrics report",
  {
    week_offset: z.number().optional().describe("0 = current week, -1 = last week, etc.")
  },
  async ({ week_offset }) => {
    try {
      const offset = week_offset || 0;
      const now = Date.now();
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const endDate = now + (offset * weekMs);
      const startDate = endDate - weekMs;

      const metrics = getWeeklyMetrics(startDate, endDate);
      const estTimeSaved = Math.round(metrics.messages_sent * 0.5); // ~30 sec per message

      return {
        content: [{ type: "text", text: JSON.stringify({
          ...metrics,
          estimated_minutes_saved: estTimeSaved,
          period: {
            start: new Date(startDate).toISOString().split('T')[0],
            end: new Date(endDate).toISOString().split('T')[0]
          }
        }, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : "Report generation failed" }) }],
        isError: true
      };
    }
  }
);

// ============================================================================
// STARTUP
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TARX Core MCP Server v1.2.0 started");
  console.error("  Merged: tarx-local + tarx-claude-memory + claude-mem patterns");
  console.error("  Tools: 30 (core:3, spaces:3, sessions:4, memory:6, files:3, smart:2, gtm:9)");
}

main().catch(console.error);
