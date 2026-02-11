#!/usr/bin/env node
/**
 * TARX Core MCP Server v1.0.0
 *
 * Merged server combining:
 * - tarx-mcp-server (core inference, spaces, sessions, files/RAG, sidebar tools)
 * - tarx-claude-memory (memory tools: store, search, recall, list, forget, stats + session sync)
 *
 * Tool categories (41 total):
 *   Core: 7         | tarx_health, tarx_chat, tarx_stress_test, tarx_reason_stream, tarx_prewarm, tarx_cancel, tarx_list_active
 *   Spaces: 3       | tarx_list_spaces, tarx_create_space, tarx_get_space
 *   Sessions: 4     | tarx_list_sessions, tarx_create_session, tarx_get_chat_history, tarx_send_message
 *   Memory: 8       | memory_store, memory_store_observation, memory_search, memory_search_index, memory_recall, memory_list, memory_forget, memory_stats
 *   Memory Sess: 4  | memory_create_session, memory_thread_to_session, memory_get_session, memory_list_sessions
 *   Thread: 1       | thread_message
 *   Files/RAG: 5    | tarx_list_files, tarx_upload_file, tarx_get_file, tarx_search_knowledge, tarx_knowledge_stats
 *   Training: 3     | tarx_export_training_data, tarx_rate_response, tarx_training_stats
 *   Sidebar: 3      | tarx_sidebar_refresh, tarx_sidebar_navigate, tarx_sidebar_get_state
 *   Smart: 3        | tarx_system_brief, tarx_project_context, tarx_session_context
 *
 * @package tarx-core
 * @version 1.0.0
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
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
  exportTrainingData,
  rateTrainingResponse,
  getTrainingDataStats,
  // File organization (Phase 1)
  deleteFile,
  scanDirectory,
  addWatch,
  removeWatch,
  listWatches,
  rescan,
  getFilesGrouped,
  getFileContentById
} from "./database.js";

// TARX Model Router - Feb 2026
import { classifyIntent, getRouteIndicator, type RouteDecision } from "./router.js";
import { getNetworkResponse, hasApiKey } from "./network-model.js";

// Memory database layer (merged from tarx-claude-memory)
import {
  storeMemory,
  storeObservation,
  searchMemories,
  searchMemoriesIndex,
  getAllMemories,
  deleteMemory,
  getMemoryStats,
  threadMessage,
  getRecentMessages,
  createMemorySession,
  threadToSession,
  getSessionHistory,
  listMemorySessions
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
    const checks = {
      inference: { port: INFERENCE_PORT, healthy: await checkPort(INFERENCE_PORT) },
      embeddings: { port: EMBED_PORT, healthy: await checkPort(EMBED_PORT) },
      mesh: { port: MESH_PORT, healthy: await checkPort(MESH_PORT) },
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
          model: "ollama-7b",
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

// Tool: Stress test

server.tool(
  "tarx_stress_test",
  "Run multiple chat requests to test TARX stability and performance",
  {
    count: z.number().min(1).max(50).describe("Number of requests to run"),
    prompt: z.string().optional().describe("Prompt to use (default: 'Hello, respond briefly')"),
    maxTokens: z.number().optional().describe("Max tokens per request (default: 50)")
  },
  async ({ count, prompt = "Hello, respond briefly", maxTokens = 50 }) => {
    const results: Array<{iteration: number; success: boolean; latency_ms: number; error?: string}> = [];

    for (let i = 0; i < count; i++) {
      const start = Date.now();
      try {
        const response = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "ollama-7b",
            messages: [
              { role: "system", content: TARX_LOCAL_REASONING_PROMPT },
              { role: "user", content: `${prompt} (test ${i + 1})` }
            ],
            max_tokens: maxTokens
          })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await response.json();

        results.push({ iteration: i + 1, success: true, latency_ms: Date.now() - start });
      } catch (error) {
        results.push({
          iteration: i + 1,
          success: false,
          latency_ms: Date.now() - start,
          error: error instanceof Error ? error.message : "Unknown"
        });
      }
    }

    const successful = results.filter(r => r.success);
    const avgLatency = successful.length > 0
      ? Math.round(successful.reduce((a, b) => a + b.latency_ms, 0) / successful.length)
      : 0;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          summary: {
            total: count,
            successful: successful.length,
            failed: count - successful.length,
            success_rate: `${Math.round((successful.length / count) * 100)}%`,
            avg_latency_ms: avgLatency,
            min_latency_ms: successful.length > 0 ? Math.min(...successful.map(r => r.latency_ms)) : null,
            max_latency_ms: successful.length > 0 ? Math.max(...successful.map(r => r.latency_ms)) : null
          },
          results
        }, null, 2)
      }]
    };
  }
);

// Tool: Stream reasoning separately from answer

server.tool(
  "tarx_reason_stream",
  "Stream a prompt to TARX LLM with separate reasoning and answer token callbacks. Returns reasoning and answer as separate fields.",
  {
    prompt: z.string().describe("The prompt to send to the LLM"),
    systemPrompt: z.string().optional().describe("Optional system prompt"),
    maxTokens: z.number().optional().describe("Maximum tokens in response (default: 500)")
  },
  async ({ prompt, systemPrompt, maxTokens = 500 }) => {
    const start = Date.now();
    const requestId = crypto.randomBytes(8).toString("hex");
    const controller = new AbortController();
    activeRequests.set(requestId, controller);

    const reasoningTokens: string[] = [];
    const answerTokens: string[] = [];

    try {
      const messages: Array<{ role: string; content: string }> = [];
      messages.push({ role: "system", content: systemPrompt || TARX_LOCAL_REASONING_PROMPT });
      messages.push({ role: "user", content: prompt });

      const response = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "ollama-7b",
          messages,
          max_tokens: maxTokens,
          stream: true
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Inference server returned ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;

              // Separate reasoning from answer content
              if (delta?.reasoning_content) {
                reasoningTokens.push(delta.reasoning_content);
              }
              if (delta?.content) {
                answerTokens.push(delta.content);
              }
            } catch {}
          }
        }
      }

      activeRequests.delete(requestId);
      const latency = Date.now() - start;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            requestId,
            reasoning: reasoningTokens.join(""),
            answer: answerTokens.join("") || reasoningTokens.join(""), // Fallback if no separate answer
            reasoning_token_count: reasoningTokens.length,
            answer_token_count: answerTokens.length,
            latency_ms: latency,
            status: "complete"
          }, null, 2)
        }]
      };
    } catch (error) {
      activeRequests.delete(requestId);
      const isAborted = (error as Error).name === "AbortError";

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            requestId,
            reasoning: reasoningTokens.join(""),
            answer: answerTokens.join(""),
            error: isAborted ? "cancelled" : (error instanceof Error ? error.message : "Unknown error"),
            latency_ms: Date.now() - start,
            status: isAborted ? "cancelled" : "error"
          })
        }],
        isError: !isAborted
      };
    }
  }
);

// Tool: Pre-warm model cache with partial prompt

server.tool(
  "tarx_prewarm",
  "Pre-warm the model cache with a partial prompt while user is typing. Reduces latency for the full request.",
  {
    partialPrompt: z.string().describe("The partial prompt to warm the cache with"),
    systemPrompt: z.string().optional().describe("Optional system prompt to include in warm-up")
  },
  async ({ partialPrompt, systemPrompt }) => {
    const start = Date.now();

    try {
      const messages: Array<{ role: string; content: string }> = [];
      messages.push({ role: "system", content: systemPrompt || TARX_LOCAL_REASONING_PROMPT });
      messages.push({ role: "user", content: partialPrompt });

      // Send a request with max_tokens=1 to warm the prompt cache without generating
      const response = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "ollama-7b",
          messages,
          max_tokens: 1, // Minimal generation, just cache the prompt
          stream: false
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`Inference server returned ${response.status}`);
      }

      const data = await response.json() as {
        usage?: { prompt_tokens?: number };
        timings?: { prompt_ms?: number; cache_n?: number };
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            warmed: true,
            context_loaded: true,
            prompt_tokens: data.usage?.prompt_tokens || 0,
            prompt_ms: data.timings?.prompt_ms || (Date.now() - start),
            cache_tokens: data.timings?.cache_n || 0,
            latency_ms: Date.now() - start,
            partial_prompt_length: partialPrompt.length
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            warmed: false,
            context_loaded: false,
            error: error instanceof Error ? error.message : "Pre-warm failed",
            latency_ms: Date.now() - start
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Cancel an in-flight generation request
server.tool(
  "tarx_cancel",
  "Cancel an in-flight generation request by its request ID",
  {
    requestId: z.string().describe("The request ID to cancel (returned from tarx_reason_stream)")
  },
  async ({ requestId }) => {
    const controller = activeRequests.get(requestId);

    if (!controller) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            cancelled: false,
            error: "Request not found or already completed",
            requestId
          })
        }],
        isError: true
      };
    }

    controller.abort();
    activeRequests.delete(requestId);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          cancelled: true,
          requestId,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }
);

// Tool: List active requests
server.tool(
  "tarx_list_active",
  "List all active/in-flight generation requests",
  {},
  async () => {
    const active = Array.from(activeRequests.keys());
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          active_requests: active,
          count: active.length,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
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
          model: "ollama-7b",
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
  "memory_store",
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

server.tool(
  "memory_store_observation",
  "Store a structured observation in TARX memory. Use this for rich, categorized memories with title, narrative, facts, concepts, and file references.",
  {
    title: z.string().describe("Short descriptive title for the observation"),
    observationType: z.enum(['bugfix', 'feature', 'decision', 'discovery', 'change', 'pattern', 'context'])
      .describe("Category: bugfix, feature, decision, discovery, change, pattern, or context"),
    narrative: z.string().describe("What happened, why, and what was learned"),
    facts: z.array(z.string()).optional().describe("Key facts extracted from this observation"),
    concepts: z.array(z.string()).optional().describe("Abstract concepts or patterns identified"),
    filesRead: z.array(z.string()).optional().describe("Files that were read/analyzed"),
    filesModified: z.array(z.string()).optional().describe("Files that were created or modified"),
    importance: z.number().min(0).max(1).optional().describe("Importance score 0-1 (default: 0.6)")
  },
  async (args) => {
    try {
      const observation = storeObservation(args);

      threadMessage('system', `[Observation: ${args.observationType}] ${args.title}`);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            observationId: observation.id,
            title: observation.title,
            type: observation.observation_type,
            factsCount: observation.facts.length,
            conceptsCount: observation.concepts.length,
            filesModifiedCount: observation.files_modified.length,
            importance: observation.importance,
            message: "Structured observation stored successfully"
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to store observation"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Search memories semantically

server.tool(
  "memory_search",
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

server.tool(
  "memory_search_index",
  "Lightweight memory search returning only IDs, titles, and short snippets (~50 tokens/result vs ~500 for full). Use this FIRST to scan, then fetch full content with memory_search for relevant entries.",
  {
    query: z.string().describe("What to search for"),
    limit: z.number().min(1).max(50).optional().describe("Maximum results (default: 20)")
  },
  async ({ query, limit = 20 }) => {
    try {
      const entries = searchMemoriesIndex(query, limit);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            mode: "index",
            count: entries.length,
            tokenEstimate: entries.length * 50,
            hint: "Use memory_search with specific IDs/terms to fetch full content for relevant entries",
            entries: entries.map(e => ({
              id: e.id,
              title: e.title || '(untitled)',
              type: e.observation_type || 'raw',
              importance: e.importance,
              snippet: e.snippet,
              createdAt: new Date(e.created_at).toISOString()
            }))
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Index search failed"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Recall context for the current conversation

server.tool(
  "memory_recall",
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
  "memory_list",
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
  "memory_forget",
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

// Tool: Get memory stats
server.tool(
  "memory_stats",
  "Get statistics about TARX memory usage",
  {},
  async () => {
    try {
      const stats = getMemoryStats();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            stats: {
              totalMemories: stats.totalMemories,
              totalMessages: stats.totalMessages,
              totalSessions: stats.totalSessions
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get stats"
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

server.tool(
  "memory_create_session",
  "Create a new session in TARX for Claude.ai conversation. Use this to start a new conversation thread that will be persisted and visible in TARX Desktop.",
  {
    title: z.string().describe("Session title"),
    topic: z.string().optional().describe("Main topic or theme"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Additional metadata (tags, context, etc.)")
  },
  async ({ title, topic, metadata }) => {
    try {
      const result = createMemorySession({ title, topic, metadata });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            session_id: result.session_id,
            title: result.title,
            space_id: result.space_id,
            created_at: result.created_at,
            view_url: result.view_url,
            message: `Session "${title}" created successfully`
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

// Tool: Thread a message to a specific session

server.tool(
  "memory_thread_to_session",
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

server.tool(
  "memory_get_session",
  "Get full conversation history for a TARX session. Use this to retrieve all messages from a previous conversation.",
  {
    session_id: z.string().describe("Session ID to retrieve"),
    limit: z.number().min(1).max(1000).optional().describe("Max messages to return (default: 100)"),
    include_metadata: z.boolean().optional().describe("Include message metadata (default: true)")
  },
  async ({ session_id, limit, include_metadata }) => {
    try {
      const result = getSessionHistory({ session_id, limit, include_metadata });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            session_id: result.session_id,
            title: result.title,
            topic: result.topic,
            created_at: result.created_at,
            last_activity: result.last_activity,
            messages: result.messages,
            total_messages: result.total_messages,
            token_estimate: result.token_estimate,
            view_url: result.view_url
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get session"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: List all Claude.ai sessions
server.tool(
  "memory_list_sessions",
  "List all sessions synced from Claude.ai conversations",
  {},
  async () => {
    try {
      const sessions = listMemorySessions();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            sessions: sessions.map(s => ({
              session_id: s.id,
              title: s.title,
              topic: s.topic,
              message_count: s.message_count,
              created_at: s.created_at,
              last_activity: s.last_activity
            })),
            count: sessions.length,
            timestamp: new Date().toISOString()
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

// ============================================================================
// THREAD TOOL (1)
// ============================================================================

// Tool: Thread a message into TARX chat history
server.tool(
  "thread_message",
  "Thread the current message into TARX chat history for persistent storage",
  {
    role: z.enum(["user", "assistant"]).describe("Who sent the message"),
    content: z.string().describe("The message content")
  },
  async ({ role, content }) => {
    try {
      const { messageId, sessionId } = threadMessage(role, content);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            messageId,
            sessionId,
            message: "Message threaded to TARX"
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

server.tool(
  "tarx_search_knowledge",
  "Search the RAG knowledge base for relevant content using semantic search",
  {
    spaceId: z.string().describe("ID of the space to search"),
    query: z.string().describe("Search query (natural language)"),
    limit: z.number().optional().describe("Max results to return (default: 5)")
  },
  async ({ spaceId, query, limit = 5 }) => {
    try {
      const results = await searchKnowledgeEmbeddings(spaceId, query, limit);

      if (results.length === 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              message: "No matching knowledge found",
              query,
              spaceId,
              embeddings_count: getKnowledgeEmbeddingCount(spaceId)
            }, null, 2)
          }]
        };
      }

      // Format results with similarity scores
      const formattedResults = results.map((r, i) => ({
        rank: i + 1,
        title: r.title,
        similarity: Math.round(r.similarity * 100) / 100,
        content: r.content.slice(0, 500) + (r.content.length > 500 ? '...' : ''),
        sourceId: r.sourceId
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query,
            spaceId,
            results: formattedResults,
            total_embeddings: getKnowledgeEmbeddingCount(spaceId)
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

// Tool: Get knowledge base stats
server.tool(
  "tarx_knowledge_stats",
  "Get statistics about the knowledge base embeddings for a space",
  {
    spaceId: z.string().describe("ID of the space to check")
  },
  async ({ spaceId }) => {
    try {
      const count = getKnowledgeEmbeddingCount(spaceId);
      const files = listFiles(spaceId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            spaceId,
            embedding_count: count,
            file_count: files.length,
            files: files.map(f => ({
              id: f.id,
              filename: f.filename,
              size: f.size_bytes
            }))
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get stats"
          })
        }],
        isError: true
      };
    }
  }
);

// ============================================================================
// TRAINING DATA TOOLS (3 tools)
// ============================================================================

// Tool: Export training data for fine-tuning
server.tool(
  "tarx_export_training_data",
  "Export training data in JSONL format for fine-tuning. Supports filters for date range, quality signal, and minimum tokens.",
  {
    format: z.enum(["json", "jsonl"]).optional().describe("Output format (default: jsonl)"),
    minTokens: z.number().optional().describe("Minimum total tokens (prompt + completion)"),
    qualitySignal: z.enum(["thumbs_up", "thumbs_down", "none"]).optional().describe("Filter by quality rating"),
    startDate: z.number().optional().describe("Start timestamp (ms since epoch)"),
    endDate: z.number().optional().describe("End timestamp (ms since epoch)"),
    limit: z.number().optional().describe("Maximum number of records to export"),
    outputFile: z.string().optional().describe("Optional file path to write the output")
  },
  async ({ format = "jsonl", minTokens, qualitySignal, startDate, endDate, limit, outputFile }) => {
    try {
      const records = exportTrainingData({
        minTokens,
        qualitySignal,
        startDate,
        endDate,
        limit
      });

      let output: string;
      if (format === "jsonl") {
        // JSONL format: one JSON object per line (standard for fine-tuning)
        output = records.map(record => {
          const trainingExample = {
            messages: [
              { role: "user", content: record.instruction },
              { role: "assistant", content: record.response }
            ],
            metadata: {
              model: record.model_used,
              route: record.route,
              rag_chunks: record.rag_chunks_used,
              quality: record.quality_signal,
              tokens: {
                prompt: record.tokens_prompt,
                completion: record.tokens_completion
              },
              latency_ms: record.latency_ms,
              created_at: record.created_at
            }
          };
          return JSON.stringify(trainingExample);
        }).join('\n');
      } else {
        // JSON format: array of records
        output = JSON.stringify(records, null, 2);
      }

      // Write to file if requested
      if (outputFile) {
        const fs = await import('fs');
        fs.writeFileSync(outputFile, output, 'utf8');
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            format,
            record_count: records.length,
            output_file: outputFile || null,
            preview: format === "jsonl" ? output.split('\n').slice(0, 3).join('\n') + '\n...' : output.substring(0, 500) + '...',
            data: outputFile ? null : output
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to export training data"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Rate a response for training data quality
server.tool(
  "tarx_rate_response",
  "Rate a message response for training data quality. Use this to mark good/bad responses for fine-tuning dataset curation.",
  {
    messageId: z.string().describe("The assistant message ID to rate"),
    rating: z.enum(["thumbs_up", "thumbs_down", "none"]).describe("Quality rating")
  },
  async ({ messageId, rating }) => {
    try {
      const success = rateTrainingResponse(messageId, rating);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success,
            messageId,
            rating,
            message: success ? "Rating applied successfully" : "Message not found in training data"
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to rate response"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Get training data statistics
server.tool(
  "tarx_training_stats",
  "Get statistics about collected training data including total records, quality breakdown, and model distribution.",
  {},
  async () => {
    try {
      const stats = getTrainingDataStats();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            total_records: stats.totalRecords,
            quality_breakdown: {
              thumbs_up: stats.thumbsUp,
              thumbs_down: stats.thumbsDown,
              unrated: stats.totalRecords - stats.thumbsUp - stats.thumbsDown
            },
            avg_tokens_per_record: stats.avgTokens,
            model_breakdown: stats.modelBreakdown
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get training stats"
          })
        }],
        isError: true
      };
    }
  }
);

// ============================================================================
// SIDEBAR CONTROL TOOLS (3 core)
// ============================================================================

// Tool: Refresh sidebar UI sections

server.tool(
  "tarx_sidebar_refresh",
  "Refresh sidebar UI sections and return updated state. Use this after creating/deleting data to update the sidebar.",
  {
    section: z.enum(["projects", "history", "files", "all"]).optional()
      .describe("Section to refresh (default: all)")
  },
  async ({ section = "all" }) => {
    try {
      // Get fresh state from harness (which triggers re-fetch from commands)
      const state = await callHarness("/sidebar/state");
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            refreshed: section,
            state,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to refresh sidebar"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Navigate sidebar to a specific view
server.tool(
  "tarx_sidebar_navigate",
  "Navigate the sidebar to a specific view (chat, projects, history, files)",
  {
    view: z.enum(["chat", "projects", "history", "files"])
      .describe("View to navigate to")
  },
  async ({ view }) => {
    try {
      // Map view names to sidebar actions
      const actionMap: Record<string, string> = {
        chat: "openChat",
        projects: "openChat", // Projects are in sidebar, chat opens the panel
        history: "openChat",
        files: "openChat"
      };

      const result = await callHarness("/sidebar/action", "POST", {
        action: actionMap[view] || "openChat"
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            navigatedTo: view,
            result,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to navigate",
            view
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Get current sidebar state
server.tool(
  "tarx_sidebar_get_state",
  "Get current sidebar UI state including projects, history, files, and connection status from the running Workbench UI",
  {},
  async () => {
    try {
      // Call the harness to get actual sidebar state
      const state = await callHarness("/sidebar/state");
      return {
        content: [{
          type: "text",
          text: JSON.stringify(state, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get sidebar state",
            note: "Make sure Workbench is running with the test harness active on port 11439"
          })
        }],
        isError: true
      };
    }
  }
);

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
      const [inference, embeddings, mesh] = await Promise.all([
        checkPort(INFERENCE_PORT),
        checkPort(EMBED_PORT),
        checkPort(MESH_PORT)
      ]);

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
      if (!mesh) activeErrors.push(`Mesh network offline (port ${MESH_PORT})`);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            inference: { port: INFERENCE_PORT, healthy: inference },
            embeddings: { port: EMBED_PORT, healthy: embeddings },
            mesh: { port: MESH_PORT, healthy: mesh },
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

// Tool: Session context - auto-context injection for Claude Code hooks
server.tool(
  "tarx_session_context",
  "Get optimized session context for auto-injection at session start. Combines system health, recent memories, and active project context into a single lightweight payload. Designed for Claude Code hooks (SessionStart).",
  {
    topic: z.string().optional().describe("Optional topic to focus memory recall on"),
    includeHealth: z.boolean().optional().describe("Include system health check (default: true)")
  },
  async ({ topic, includeHealth = true }) => {
    try {
      // Parallel: health check + memory recall + recent messages
      const [healthResult, memories, recentMsgs, memStats] = await Promise.all([
        includeHealth ? Promise.all([
          checkPort(INFERENCE_PORT),
          checkPort(EMBED_PORT),
          checkPort(MESH_PORT)
        ]) : Promise.resolve(null),
        Promise.resolve(topic ? searchMemoriesIndex(topic, 10) : searchMemoriesIndex('', 5)),
        Promise.resolve(getRecentMessages(5)),
        Promise.resolve(getMemoryStats())
      ]);

      const context: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        memory_stats: memStats
      };

      // Health summary (compact)
      if (healthResult) {
        const [inf, emb, mesh] = healthResult;
        context.health = {
          inference: inf, embeddings: emb, mesh,
          issues: [
            !inf && 'inference offline',
            !emb && 'embeddings offline',
            !mesh && 'mesh offline'
          ].filter(Boolean)
        };
      }

      // Memory index (lightweight)
      if (memories.length > 0) {
        context.relevant_memories = memories.map(m => ({
          id: m.id,
          title: m.title || '(untitled)',
          type: m.observation_type || 'raw',
          snippet: m.snippet
        }));
      }

      // Recent conversation (compact)
      if (recentMsgs.length > 0) {
        context.recent_conversation = recentMsgs.slice(0, 3).reverse().map(msg => ({
          role: msg.role,
          preview: msg.content.substring(0, 120) + (msg.content.length > 120 ? '...' : '')
        }));
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(context, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to build session context"
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

server.tool(
  "tarx_delete_file",
  "Delete a file from the TARX file index. Removes embeddings and disk copy (for uploaded files). Reference files only lose their index entry.",
  {
    fileId: z.string().describe("The file ID to delete")
  },
  async ({ fileId }) => {
    const result = deleteFile(fileId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ deleted: result, fileId }) }]
    };
  }
);

server.tool(
  "tarx_scan_directory",
  "Scan a local directory and index all files as references (no copies). Text files under 1MB get embedded for semantic search. Skips node_modules, .git, etc.",
  {
    path: z.string().describe("Absolute path to directory to scan"),
    depth: z.number().optional().default(3).describe("Max recursion depth (default 3)"),
    includePatterns: z.array(z.string()).optional().default([]).describe("Glob patterns to include (empty = all)"),
    excludePatterns: z.array(z.string()).optional().default([]).describe("Glob patterns to exclude")
  },
  async ({ path: dirPath, depth, includePatterns, excludePatterns }) => {
    if (!fs.existsSync(dirPath)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: `Directory not found: ${dirPath}` }) }],
        isError: true
      };
    }
    const result = await scanDirectory(dirPath, depth, includePatterns, excludePatterns);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ ...result, path: dirPath }) }]
    };
  }
);

server.tool(
  "tarx_add_watch",
  "Register a directory for periodic scanning. Files from watched directories can be re-scanned to detect changes.",
  {
    path: z.string().describe("Absolute path to watch"),
    label: z.string().optional().describe("Friendly label (default: directory name)"),
    depth: z.number().optional().default(3).describe("Max scan depth"),
    includePatterns: z.array(z.string()).optional().default([]).describe("Glob include patterns"),
    excludePatterns: z.array(z.string()).optional().default([]).describe("Glob exclude patterns")
  },
  async ({ path: dirPath, label, depth, includePatterns, excludePatterns }) => {
    if (!fs.existsSync(dirPath)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: `Directory not found: ${dirPath}` }) }],
        isError: true
      };
    }
    const watch = addWatch(dirPath, label, depth, includePatterns, excludePatterns);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ created: true, watch }) }]
    };
  }
);

server.tool(
  "tarx_remove_watch",
  "Remove a watched directory and soft-delete all files scanned from it.",
  {
    watchId: z.string().describe("The watch ID to remove")
  },
  async ({ watchId }) => {
    const result = removeWatch(watchId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ removed: result, watchId }) }]
    };
  }
);

server.tool(
  "tarx_rescan",
  "Re-scan watched directories to detect new, modified, and deleted files. Optionally target a specific watch.",
  {
    watchId: z.string().optional().describe("Specific watch to rescan (default: all)")
  },
  async ({ watchId }) => {
    const watches = listWatches();
    if (watches.length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "No watched directories configured. Use tarx_add_watch first." }) }]
      };
    }
    const result = await rescan(watchId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ ...result, watches: watches.length }) }]
    };
  }
);

// ============================================================================
// STARTUP
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TARX Core MCP Server v1.1.0 started");
  console.error("  Merged: tarx-local + tarx-claude-memory + claude-mem patterns");
  console.error("  Tools: 46 (core:7, spaces:3, sessions:4, memory:8, memory-sessions:4, thread:1, files:10, training:3, sidebar:3, smart:3)");
}

main().catch(console.error);
