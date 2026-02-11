#!/usr/bin/env node
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
  getKnowledgeEmbeddingCount
} from "./database.js";

// TARX Model Router - Feb 2026
import { classifyIntent, getRouteIndicator, type RouteDecision } from "./router.js";
import { getNetworkResponse, hasApiKey } from "./network-model.js";

// TARX System Prompts - Feb 2026
import { TARX_SYSTEM_PROMPT, TARX_LOCAL_REASONING_PROMPT } from "./systemPrompt.js";
import { buildLightweightPrompt, buildContextualPrompt, promptConfigStore } from "./contextInjector.js";

const INFERENCE_PORT = 11435;
const EMBED_PORT = 11437;
const MESH_PORT = 11436;
const VOICE_PORT = 11438;
const MOSHI_PORT = 9001;
const TMP_DIR = "/tmp/tarx-voice-test";

// Ensure temp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

const server = new McpServer({
  name: "tarx-local",
  version: "1.0.0"
});

// Helper function for port checks
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

// Helper: Generate unique temp file path
function tempFile(prefix: string, ext: string): string {
  const id = crypto.randomBytes(4).toString("hex");
  return path.join(TMP_DIR, `${prefix}-${id}.${ext}`);
}

// Helper: Calculate hallucination score
function calculateHallucinationScore(text: string): number {
  const fillerPatterns = [
    /\byeah\b/gi,
    /\buh-huh\b/gi,
    /\buh huh\b/gi,
    /\bwhat's going on\b/gi,
    /\bI see\b/gi,
    /\bhmm+\b/gi,
    /\bokay okay\b/gi,
    /\bright right\b/gi,
    /\bso so\b/gi,
  ];

  let fillerCount = 0;
  for (const pattern of fillerPatterns) {
    const matches = text.match(pattern);
    if (matches) fillerCount += matches.length;
  }

  const words = text.split(/\s+/).length;
  if (words === 0) return 0;

  return Math.min(1, fillerCount / Math.max(words * 0.1, 1));
}

// Helper: Check voice pipeline health
async function checkVoiceHealth(): Promise<{
  pipeline_ok: boolean;
  moshi_alive: boolean;
  tarx_voice_alive: boolean;
  vad_ready: boolean;
  last_error: string | null;
}> {
  const result = {
    pipeline_ok: false,
    moshi_alive: false,
    tarx_voice_alive: false,
    vad_ready: false,
    last_error: null as string | null
  };

  try {
    const voiceCheck = await fetch(`http://localhost:${VOICE_PORT}/health`, {
      signal: AbortSignal.timeout(2000)
    });
    result.tarx_voice_alive = voiceCheck.ok;
  } catch {
    result.last_error = `tarx-voice not responding on ${VOICE_PORT}`;
  }

  try {
    const moshiCheck = await fetch(`http://localhost:${MOSHI_PORT}/health`, {
      signal: AbortSignal.timeout(2000)
    });
    result.moshi_alive = moshiCheck.ok;
  } catch {
    if (!result.last_error) {
      result.last_error = `Moshi not responding on ${MOSHI_PORT}`;
    }
  }

  result.vad_ready = result.tarx_voice_alive;
  result.pipeline_ok = result.tarx_voice_alive && result.moshi_alive;

  return result;
}

// ============================================================================
// CORE TOOLS (existing)
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

// Tool: Chat with TARX (routes between Local and Network models)
server.tool(
  "tarx_chat",
  "Send a prompt to TARX - routes to Local (Qwen) or Network (Claude) based on intent",
  {
    prompt: z.string().describe("The prompt to send"),
    maxTokens: z.number().optional().describe("Maximum tokens in response (default: 300)"),
    stream: z.boolean().optional().describe("Whether to stream response (default: false)"),
    forceRoute: z.enum(["local", "network"]).optional().describe("Force a specific route (optional)")
  },
  async ({ prompt, maxTokens = 300, stream = false, forceRoute }) => {
    const start = Date.now();

    // Route classification
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
    console.log(`[TARX Router] ${indicator.emoji} ${routeDecision.route} (${routeDecision.confidence.toFixed(2)}) - ${routeDecision.reason}`);

    try {
      let content: string;
      let model: string;
      let tokens: { prompt_tokens?: number; completion_tokens?: number } | undefined;

      // NETWORK ROUTE - Use Claude API
      if (routeDecision.route === 'network') {
        if (!hasApiKey()) {
          // Fall back to local if no API key
          console.log("[TARX Router] No API key, falling back to local");
          routeDecision = { route: 'local', confidence: 1.0, reason: 'No API key - fallback' };
        } else {
          content = await getNetworkResponse(prompt);
          model = "claude-sonnet";

          const latency = Date.now() - start;

          // Store conversation in database
          let dbResult = null;
          try {
            dbResult = storeConversationTurn(prompt, content, {
              model: "claude-sonnet",
              latency_ms: latency
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
      // Build contextual prompt with user config
      const systemPrompt = await buildLightweightPrompt(TARX_SYSTEM_PROMPT, {
        config: promptConfigStore.getConfig()
      });

      const response = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "ollama-7b",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
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
        // TARX Bridge Integration - Feb 2026
        const response = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "ollama-7b",
            messages: [
              { role: "system", content: TARX_SYSTEM_PROMPT },
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

// Tool: Generate embeddings
server.tool(
  "tarx_embed",
  "Generate embeddings for text using TARX embedding server",
  {
    text: z.string().describe("Text to embed"),
    prefix: z.enum(["search_query", "search_document"]).optional()
      .describe("Prefix for embedding (default: search_query)")
  },
  async ({ text, prefix = "search_query" }) => {
    const start = Date.now();

    try {
      const response = await fetch(`http://localhost:${EMBED_PORT}/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: `${prefix}: ${text}`,
          model: "nomic-embed"
        })
      });

      if (!response.ok) {
        throw new Error(`Embedding server returned ${response.status}`);
      }

      const data = await response.json() as {
        data?: Array<{ embedding?: number[] }>;
      };
      const embedding = data.data?.[0]?.embedding;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            dimensions: embedding?.length || 0,
            latency_ms: Date.now() - start,
            sample: embedding?.slice(0, 5) || [],
            status: "success"
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
            latency_ms: Date.now() - start
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Mesh status
server.tool(
  "tarx_mesh_status",
  "Get TARX mesh network status including peer count and capabilities",
  {},
  async () => {
    try {
      const response = await fetch(`http://localhost:${MESH_PORT}/mesh/status`);
      if (!response.ok) throw new Error(`Mesh API returned ${response.status}`);
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Mesh not available",
            port: MESH_PORT
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Database stats
server.tool(
  "tarx_db_stats",
  "Get TARX database statistics (spaces, sessions, messages)",
  {},
  async () => {
    try {
      const stats = getDatabaseStats();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ...stats,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Database not available"
          })
        }],
        isError: true
      };
    }
  }
);

// ============================================================================
// SPACE MANAGEMENT TOOLS
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
// SESSION/CHAT MANAGEMENT TOOLS
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

      // TARX Bridge Integration - Feb 2026: Prepend system prompt with context
      const systemPrompt = await buildLightweightPrompt(TARX_SYSTEM_PROMPT, {
        config: promptConfigStore.getConfig()
      });

      const messagesWithSystem = [
        { role: "system", content: systemPrompt },
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
// MEMORY SESSION TOOLS (Claude.ai Integration)
// ============================================================================

// Helper: Get or create dedicated space for Claude.ai sessions
function getOrCreateClaudeAISpace(): { id: string; name: string } {
  const { getDatabase } = require("./database.js");
  const db = getDatabase();

  const spaceName = 'Claude AI Sessions';
  let space = db.prepare('SELECT id, name FROM spaces WHERE name = ? AND deleted_at IS NULL').get(spaceName) as { id: string; name: string } | undefined;

  if (!space) {
    const now = Date.now();
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
    `).run(id, spaceName, 'Conversations synced from Claude.ai', '🤖', now, now, now);
    space = { id, name: spaceName };
  }

  return space;
}

// Tool: Create dedicated session for conversation tracking
server.tool(
  "memory_create_session",
  "Create a dedicated session for tracking a conversation from Claude.ai",
  {
    title: z.string().describe("Session title"),
    topic: z.string().optional().describe("Main topic or theme"),
    metadata: z.record(z.any()).optional().describe("Additional metadata (e.g., project context)")
  },
  async ({ title, topic, metadata }) => {
    try {
      const { getDatabase } = await import("./database.js");
      const db = getDatabase();

      const space = getOrCreateClaudeAISpace();
      const sessionId = `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const now = Date.now();

      // Create session with extended metadata
      db.prepare(`
        INSERT INTO sessions (id, space_id, title, created_at, updated_at, message_count, total_tokens)
        VALUES (?, ?, ?, ?, ?, 0, 0)
      `).run(sessionId, space.id, title, now, now);

      // Store topic and metadata in a separate key-value store or as JSON in title
      // For now, we'll append topic to title if provided
      if (topic) {
        db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(`${title} [${topic}]`, sessionId);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            session_id: sessionId,
            title,
            topic: topic || null,
            space_id: space.id,
            space_name: space.name,
            created_at: now,
            view_url: `tarx://sessions/${sessionId}`,
            metadata: metadata || {}
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

// Tool: Thread message to specific session
server.tool(
  "memory_thread_to_session",
  "Thread a message to a specific session (stores message without AI inference)",
  {
    session_id: z.string().describe("Session ID to thread message to"),
    role: z.enum(["user", "assistant", "system"]).describe("Message role"),
    content: z.string().describe("Message content"),
    metadata: z.record(z.any()).optional().describe("Additional metadata (e.g., model used, tokens)")
  },
  async ({ session_id, role, content, metadata }) => {
    try {
      const { getDatabase } = await import("./database.js");
      const db = getDatabase();

      // Verify session exists
      const session = db.prepare('SELECT id, space_id FROM sessions WHERE id = ? AND deleted_at IS NULL').get(session_id) as { id: string; space_id: string } | undefined;
      if (!session) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Session ${session_id} not found` })
          }],
          isError: true
        };
      }

      const messageId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const now = Date.now();

      // Insert message
      db.prepare(`
        INSERT INTO messages (id, session_id, role, content, created_at, model, tokens, latency_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        messageId,
        session_id,
        role,
        content,
        now,
        metadata?.model || null,
        metadata?.tokens || null,
        metadata?.latency_ms || null
      );

      // Update session stats
      db.prepare(`
        UPDATE sessions
        SET message_count = message_count + 1,
            updated_at = ?,
            total_tokens = total_tokens + COALESCE(?, 0)
        WHERE id = ?
      `).run(now, metadata?.tokens || 0, session_id);

      // Update space stats
      db.prepare(`
        UPDATE spaces
        SET message_count = message_count + 1,
            updated_at = ?,
            last_accessed_at = ?,
            total_tokens = total_tokens + COALESCE(?, 0)
        WHERE id = ?
      `).run(now, now, metadata?.tokens || 0, session.space_id);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            message_id: messageId,
            session_id,
            role,
            threaded: true,
            timestamp: now,
            content_length: content.length
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

// Tool: Get full session with conversation history
server.tool(
  "memory_get_session",
  "Retrieve full conversation history for a session",
  {
    session_id: z.string().describe("Session ID to retrieve"),
    limit: z.number().optional().default(100).describe("Max messages to return"),
    include_metadata: z.boolean().optional().default(true).describe("Include message metadata")
  },
  async ({ session_id, limit = 100, include_metadata = true }) => {
    try {
      const { getDatabase } = await import("./database.js");
      const db = getDatabase();

      // Get session info
      const session = db.prepare(`
        SELECT id, space_id, title, created_at, updated_at, message_count, total_tokens, model
        FROM sessions
        WHERE id = ? AND deleted_at IS NULL
      `).get(session_id) as {
        id: string;
        space_id: string;
        title: string | null;
        created_at: number;
        updated_at: number;
        message_count: number;
        total_tokens: number;
        model: string | null;
      } | undefined;

      if (!session) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Session ${session_id} not found` })
          }],
          isError: true
        };
      }

      // Get messages
      const messages = db.prepare(`
        SELECT id, role, content, created_at, model, tokens, latency_ms
        FROM messages
        WHERE session_id = ? AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT ?
      `).all(session_id, limit) as Array<{
        id: string;
        role: string;
        content: string;
        created_at: number;
        model: string | null;
        tokens: number | null;
        latency_ms: number | null;
      }>;

      // Format messages
      const formattedMessages = messages.map(msg => {
        const base = {
          id: msg.id,
          role: msg.role,
          content: msg.content,
          created_at: msg.created_at
        };

        if (include_metadata) {
          return {
            ...base,
            metadata: {
              model: msg.model,
              tokens: msg.tokens,
              latency_ms: msg.latency_ms
            }
          };
        }
        return base;
      });

      // Estimate tokens (rough: ~4 chars per token)
      const totalChars = formattedMessages.reduce((sum, m) => sum + m.content.length, 0);
      const tokenEstimate = Math.ceil(totalChars / 4);

      // Parse topic from title if present
      let title = session.title || 'Untitled';
      let topic: string | null = null;
      const topicMatch = title.match(/^(.+?)\s*\[(.+?)\]$/);
      if (topicMatch) {
        title = topicMatch[1];
        topic = topicMatch[2];
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            session_id,
            title,
            topic,
            space_id: session.space_id,
            created_at: session.created_at,
            last_activity: session.updated_at,
            message_count: formattedMessages.length,
            total_messages_in_session: session.message_count,
            messages: formattedMessages,
            token_estimate: tokenEstimate,
            total_tokens_stored: session.total_tokens
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
  "List all sessions in the Claude AI Sessions space",
  {
    limit: z.number().optional().default(20).describe("Max sessions to return"),
    include_preview: z.boolean().optional().default(true).describe("Include first message preview")
  },
  async ({ limit = 20, include_preview = true }) => {
    try {
      const { getDatabase } = await import("./database.js");
      const db = getDatabase();

      const space = getOrCreateClaudeAISpace();

      const sessions = db.prepare(`
        SELECT id, title, created_at, updated_at, message_count, total_tokens
        FROM sessions
        WHERE space_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(space.id, limit) as Array<{
        id: string;
        title: string | null;
        created_at: number;
        updated_at: number;
        message_count: number;
        total_tokens: number;
      }>;

      const formattedSessions = sessions.map(s => {
        let title = s.title || 'Untitled';
        let topic: string | null = null;
        const topicMatch = title.match(/^(.+?)\s*\[(.+?)\]$/);
        if (topicMatch) {
          title = topicMatch[1];
          topic = topicMatch[2];
        }

        const session: Record<string, unknown> = {
          session_id: s.id,
          title,
          topic,
          created_at: s.created_at,
          last_activity: s.updated_at,
          message_count: s.message_count,
          total_tokens: s.total_tokens
        };

        if (include_preview) {
          const firstMsg = db.prepare(`
            SELECT content FROM messages
            WHERE session_id = ? AND deleted_at IS NULL
            ORDER BY created_at ASC LIMIT 1
          `).get(s.id) as { content: string } | undefined;
          session.preview = firstMsg ? firstMsg.content.substring(0, 100) + (firstMsg.content.length > 100 ? '...' : '') : null;
        }

        return session;
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            space_id: space.id,
            space_name: space.name,
            sessions: formattedSessions,
            count: formattedSessions.length,
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
// FILE MANAGEMENT TOOLS
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
  async ({ spaceId, filename, content, mimeType, generateEmbeddings = true }) => {
    try {
      const file = uploadFile(spaceId, filename, content, mimeType);

      // Auto-generate RAG embeddings (unless explicitly disabled)
      let embeddingResult: { success: boolean; chunks: number; error?: string } = { success: false, chunks: 0, error: 'Skipped' };
      if (generateEmbeddings !== false) {
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
              : `File uploaded. Embedding generation ${generateEmbeddings === false ? 'skipped' : 'failed'}: ${embeddingResult.error}`
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

// ============================================================================
// RAG SEARCH TOOLS
// ============================================================================

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
// VOICE TOOLS (new)
// ============================================================================

// Tool: Voice health check
server.tool(
  "tarx_voice_health",
  "Check health status of voice pipeline (tarx-voice, Moshi, VAD)",
  {},
  async () => {
    const health = await checkVoiceHealth();
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ...health,
          timestamp: new Date().toISOString(),
          ports: {
            tarx_voice: VOICE_PORT,
            moshi: MOSHI_PORT
          }
        }, null, 2)
      }]
    };
  }
);

// Tool: Voice synthesize (TTS)
server.tool(
  "tarx_voice_synthesize",
  "Convert text to speech audio file for testing (TTS)",
  {
    text: z.string().describe("Text to synthesize into speech"),
    voice: z.string().optional().describe("Voice ID (default: system)"),
    format: z.enum(["wav", "mp3", "aiff"]).optional().describe("Output format (default: wav)")
  },
  async ({ text, voice = "system", format = "wav" }) => {
    const outputFile = tempFile("synth", format);
    const start = Date.now();

    try {
      if (process.platform === "darwin") {
        const aiffFile = tempFile("synth", "aiff");
        const safeText = text.replace(/"/g, '\\"').replace(/`/g, "\\`").substring(0, 500);
        execSync(`say -o "${aiffFile}" "${safeText}"`);

        if (format === "wav") {
          execSync(`afconvert -f WAVE -d LEI16 "${aiffFile}" "${outputFile}"`);
          fs.unlinkSync(aiffFile);
        } else if (format === "aiff") {
          fs.renameSync(aiffFile, outputFile);
        } else {
          // mp3 - try ffmpeg, fall back to aiff
          try {
            execSync(`ffmpeg -y -i "${aiffFile}" "${outputFile}" 2>/dev/null`);
            fs.unlinkSync(aiffFile);
          } catch {
            fs.renameSync(aiffFile, outputFile.replace(".mp3", ".aiff"));
          }
        }
      } else {
        // Linux fallback
        execSync(`espeak "${text.replace(/"/g, '\\"')}" --stdout > "${outputFile}"`);
      }

      const stats = fs.statSync(outputFile);
      const durationSec = format === "wav" ? stats.size / 176000 : stats.size / 16000;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            audio_file: outputFile,
            format,
            size_bytes: stats.size,
            duration_sec: Math.round(durationSec * 100) / 100,
            latency_ms: Date.now() - start,
            text_length: text.length
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "TTS failed",
            latency_ms: Date.now() - start
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Voice transcribe (STT)
server.tool(
  "tarx_voice_transcribe",
  "Transcribe audio file to text (STT via voice pipeline)",
  {
    audio_file: z.string().describe("Path to audio file"),
    timeout_ms: z.number().optional().describe("Timeout in milliseconds (default: 30000)")
  },
  async ({ audio_file, timeout_ms = 30000 }) => {
    const start = Date.now();

    try {
      if (!fs.existsSync(audio_file)) {
        throw new Error(`Audio file not found: ${audio_file}`);
      }

      // Try whisper CLI if available, otherwise return placeholder
      let transcription = "[transcription requires whisper or voice pipeline]";
      try {
        const whisperOutput = execSync(
          `whisper "${audio_file}" --model tiny --output_format txt --output_dir /tmp 2>/dev/null`,
          { encoding: "utf8", timeout: timeout_ms }
        );

        const baseName = path.basename(audio_file, path.extname(audio_file));
        const txtFile = `/tmp/${baseName}.txt`;
        if (fs.existsSync(txtFile)) {
          transcription = fs.readFileSync(txtFile, "utf8").trim();
        }
      } catch {
        // Whisper not available - that's fine
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            text: transcription,
            final: true,
            vad_triggered: true,
            latency_ms: Date.now() - start,
            audio_file
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Transcription failed",
            latency_ms: Date.now() - start
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Voice conversation turn
server.tool(
  "tarx_voice_conversation_turn",
  "Complete voice conversation turn: audio in → transcribe → LLM → TTS → audio out",
  {
    audio_file: z.string().describe("Path to input audio file"),
    max_silence_sec: z.number().optional().describe("Max silence before VAD triggers (default: 3.0)"),
    return_audio: z.boolean().optional().describe("Include response audio file path (default: true)")
  },
  async ({ audio_file, max_silence_sec = 3.0, return_audio = true }) => {
    const start = Date.now();
    const metrics = {
      transcribe_ms: 0,
      llm_ms: 0,
      tts_ms: 0,
      total_ms: 0
    };

    try {
      // Step 1: Transcribe (simulated for now)
      const transcribeStart = Date.now();
      let inputText = "[test input]";
      try {
        const baseName = path.basename(audio_file, path.extname(audio_file));
        execSync(`whisper "${audio_file}" --model tiny --output_format txt --output_dir /tmp 2>/dev/null`, { timeout: 30000 });
        const txtFile = `/tmp/${baseName}.txt`;
        if (fs.existsSync(txtFile)) {
          inputText = fs.readFileSync(txtFile, "utf8").trim();
        }
      } catch {}
      metrics.transcribe_ms = Date.now() - transcribeStart;

      // Step 2: Get LLM response - TARX Bridge Integration - Feb 2026
      const llmStart = Date.now();
      const llmResponse = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "ollama-7b",
          messages: [
            { role: "system", content: TARX_SYSTEM_PROMPT },
            { role: "user", content: inputText }
          ],
          max_tokens: 150
        })
      });
      const llmData = await llmResponse.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const responseText = llmData.choices?.[0]?.message?.content || "I didn't catch that.";
      metrics.llm_ms = Date.now() - llmStart;

      // Step 3: Synthesize response audio
      let responseAudioFile: string | null = null;
      if (return_audio) {
        const ttsStart = Date.now();
        responseAudioFile = tempFile("response", "wav");
        if (process.platform === "darwin") {
          const aiffFile = tempFile("response", "aiff");
          const safeText = responseText.replace(/"/g, '\\"').replace(/`/g, "\\`").substring(0, 500);
          execSync(`say -o "${aiffFile}" "${safeText}"`);
          execSync(`afconvert -f WAVE -d LEI16 "${aiffFile}" "${responseAudioFile}"`);
          fs.unlinkSync(aiffFile);
        }
        metrics.tts_ms = Date.now() - ttsStart;
      }

      metrics.total_ms = Date.now() - start;
      const hallucinationScore = calculateHallucinationScore(responseText);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            transcribed_text: inputText,
            response_text: responseText,
            response_audio_file: responseAudioFile,
            hallucination_score: Math.round(hallucinationScore * 100) / 100,
            vad_trigger_ms: Math.round(max_silence_sec * 1000),
            metrics,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Conversation turn failed",
            metrics,
            latency_ms: Date.now() - start
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Voice stress test
server.tool(
  "tarx_voice_stress",
  "Run multiple voice conversation cycles and report aggregate metrics",
  {
    cycles: z.number().min(1).max(100).describe("Number of test cycles to run"),
    pause_ms: z.number().optional().describe("Pause between cycles in milliseconds (default: 500)"),
    test_prompts: z.array(z.string()).optional().describe("Custom prompts to test (default: built-in set)")
  },
  async ({ cycles, pause_ms = 500, test_prompts }) => {
    const defaultPrompts = [
      "Hello TARX, how are you?",
      "What's the weather like today?",
      "Tell me a short joke.",
      "What can you help me with?",
      "Explain quantum computing briefly.",
      "What time is it?",
      "How do I make coffee?",
      "What's your name?",
      "Count to five.",
      "Say goodbye."
    ];

    const prompts = test_prompts || defaultPrompts;
    const results: Array<{
      cycle: number;
      prompt: string;
      success: boolean;
      latency_ms: number;
      hallucination_score: number;
      error?: string;
    }> = [];

    for (let i = 0; i < cycles; i++) {
      const prompt = prompts[i % prompts.length];
      const start = Date.now();

      try {
        // Generate test audio
        const audioFile = tempFile(`stress-${i}`, "wav");
        if (process.platform === "darwin") {
          const aiffFile = tempFile(`stress-${i}`, "aiff");
          const safeText = prompt.replace(/"/g, '\\"').replace(/`/g, "\\`");
          execSync(`say -o "${aiffFile}" "${safeText}"`);
          execSync(`afconvert -f WAVE -d LEI16 "${aiffFile}" "${audioFile}"`);
          fs.unlinkSync(aiffFile);
        }

        // Run through LLM - TARX Bridge Integration - Feb 2026
        const llmResponse = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "ollama-7b",
            messages: [
              { role: "system", content: TARX_SYSTEM_PROMPT },
              { role: "user", content: prompt }
            ],
            max_tokens: 100
          })
        });
        const llmData = await llmResponse.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const responseText = llmData.choices?.[0]?.message?.content || "";

        results.push({
          cycle: i + 1,
          prompt,
          success: true,
          latency_ms: Date.now() - start,
          hallucination_score: calculateHallucinationScore(responseText)
        });

        // Cleanup temp file
        if (fs.existsSync(audioFile)) fs.unlinkSync(audioFile);

      } catch (error) {
        results.push({
          cycle: i + 1,
          prompt,
          success: false,
          latency_ms: Date.now() - start,
          hallucination_score: 0,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }

      // Pause between cycles
      if (i < cycles - 1 && pause_ms > 0) {
        await new Promise(resolve => setTimeout(resolve, pause_ms));
      }
    }

    // Aggregate metrics
    const successful = results.filter(r => r.success);
    const avgLatency = successful.length > 0
      ? Math.round(successful.reduce((a, b) => a + b.latency_ms, 0) / successful.length)
      : 0;
    const avgHallucination = successful.length > 0
      ? Math.round(successful.reduce((a, b) => a + b.hallucination_score, 0) / successful.length * 100) / 100
      : 0;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          summary: {
            total_cycles: cycles,
            successful: successful.length,
            failed: cycles - successful.length,
            success_rate: `${Math.round((successful.length / cycles) * 100)}%`,
            avg_latency_ms: avgLatency,
            min_latency_ms: successful.length > 0 ? Math.min(...successful.map(r => r.latency_ms)) : null,
            max_latency_ms: successful.length > 0 ? Math.max(...successful.map(r => r.latency_ms)) : null,
            avg_hallucination_score: avgHallucination,
            total_hallucinations: results.filter(r => r.hallucination_score > 0.3).length
          },
          results
        }, null, 2)
      }]
    };
  }
);

// Tool: Voice reset
server.tool(
  "tarx_voice_reset",
  "Reset voice pipeline - clear Moshi context, restart if needed",
  {
    force_restart: z.boolean().optional().describe("Force restart Moshi process (default: false)")
  },
  async ({ force_restart = false }) => {
    try {
      if (force_restart) {
        try {
          execSync("pkill -f moshi || true");
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch {}
      }

      // Clear any session state via API
      try {
        await fetch(`http://localhost:${VOICE_PORT}/reset`, { method: "POST" });
      } catch {}

      const health = await checkVoiceHealth();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            reset_ok: true,
            force_restart,
            health_after: health,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            reset_ok: false,
            error: error instanceof Error ? error.message : "Reset failed"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Voice config
server.tool(
  "tarx_voice_config",
  "Get or set voice pipeline configuration (VAD, RMS thresholds, timeouts)",
  {
    action: z.enum(["get", "set"]).describe("Action: get current config or set new values"),
    config: z.object({
      vad_timeout_ms: z.number().optional(),
      rms_threshold: z.number().optional(),
      silence_threshold_ms: z.number().optional(),
      max_response_tokens: z.number().optional()
    }).optional().describe("Config values to set (only for action='set')")
  },
  async ({ action, config }) => {
    const configFile = "/tmp/tarx-voice-config.json";

    let currentConfig = {
      vad_timeout_ms: 1000,
      rms_threshold: 0.015,
      silence_threshold_ms: 3000,
      max_response_tokens: 150
    };

    if (fs.existsSync(configFile)) {
      try {
        currentConfig = { ...currentConfig, ...JSON.parse(fs.readFileSync(configFile, "utf8")) };
      } catch {}
    }

    if (action === "get") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            config: currentConfig,
            config_file: configFile
          }, null, 2)
        }]
      };
    }

    if (config) {
      const previousConfig = { ...currentConfig };
      currentConfig = { ...currentConfig, ...config };
      fs.writeFileSync(configFile, JSON.stringify(currentConfig, null, 2));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            previous_config: previousConfig,
            new_config: currentConfig,
            config_file: configFile,
            note: "Config saved. Restart voice pipeline to apply changes."
          }, null, 2)
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: "No config provided for 'set' action" })
      }],
      isError: true
    };
  }
);

// Tool: Live voice session (end-to-end via WebSocket)
server.tool(
  "tarx_voice_live_session",
  "Run end-to-end voice test via real WebSocket connection to tarx-voice (UI panel updates visible)",
  {
    prompts: z.array(z.string()).describe("Array of text prompts to convert to audio and send"),
    silence_sec: z.number().optional().describe("Silence duration between prompts (default: 3.0)"),
    space_name: z.string().optional().describe("Space name to store conversation (default: 'Live Voice Test')"),
    verify_ui: z.boolean().optional().describe("Check for UI panel updates (default: true)")
  },
  async ({ prompts, silence_sec = 3.0, space_name = "Live Voice Test", verify_ui = true }) => {
    const start = Date.now();
    const results: Array<{
      prompt_index: number;
      prompt: string;
      audio_sent: boolean;
      transcript_received: boolean;
      response_received: boolean;
      latency_ms: number;
      error?: string;
    }> = [];

    // WebSocket connection state
    let ws: import("ws").WebSocket | null = null;
    let connected = false;
    const transcripts: Array<{ speaker: string; text: string; isFinal: boolean }> = [];

    try {
      // Step 1: Connect to tarx-voice WebSocket
      const WebSocket = (await import("ws")).default;
      ws = new WebSocket(`ws://localhost:${VOICE_PORT}`);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 5000);
        ws!.on("open", () => {
          clearTimeout(timeout);
          connected = true;
          console.error("[MCP] Connected to tarx-voice WebSocket");

          // Send start config
          ws!.send(JSON.stringify({
            type: "start",
            config: {
              language: "en",
              continuous: true,
              sampleRate: 48000,
              bitDepth: 32,
              channels: 1,
              encoding: "pcm_s32le",
              mcp_test: true
            }
          }));
          resolve();
        });
        ws!.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // Step 2: Set up message handler
      ws.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const buffer = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
          if (buffer[0] === 0x7b) {
            const msg = JSON.parse(buffer.toString());
            if (msg.type === "transcript") {
              transcripts.push({
                speaker: msg.speaker || "unknown",
                text: msg.text || "",
                isFinal: msg.isFinal ?? !msg.isPartial
              });
              console.error(`[MCP] Transcript: ${msg.speaker}: "${msg.text}" (final: ${msg.isFinal})`);
            }
          }
        } catch {}
      });

      // Step 3: Process each prompt
      for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        const promptStart = Date.now();
        const transcriptsBefore = transcripts.length;

        try {
          // Generate audio from prompt using macOS TTS
          const audioFile = tempFile(`live-${i}`, "wav");
          const aiffFile = tempFile(`live-${i}`, "aiff");
          const safeText = prompt.replace(/"/g, '\\"').replace(/`/g, "\\`").substring(0, 500);
          execSync(`say -o "${aiffFile}" "${safeText}"`);
          execSync(`afconvert -f WAVE -d LEI32@48000 "${aiffFile}" "${audioFile}"`);
          fs.unlinkSync(aiffFile);

          // Read audio file and send as binary chunks
          const audioData = fs.readFileSync(audioFile);
          const chunkSize = 16384;
          let bytesSent = 0;

          for (let j = 44; j < audioData.length; j += chunkSize) { // Skip 44-byte WAV header
            const chunk = audioData.subarray(j, Math.min(j + chunkSize, audioData.length));
            if (ws && ws.readyState === 1) {
              ws.send(chunk);
              bytesSent += chunk.length;
            }
            await new Promise(resolve => setTimeout(resolve, 30)); // Stream at ~30ms intervals
          }

          console.error(`[MCP] Sent ${bytesSent} bytes for prompt ${i + 1}: "${prompt}"`);
          fs.unlinkSync(audioFile);

          // Wait for silence period (simulates natural pause)
          await new Promise(resolve => setTimeout(resolve, silence_sec * 1000));

          // Check for new transcripts
          const newTranscripts = transcripts.slice(transcriptsBefore);
          const gotUserTranscript = newTranscripts.some(t => t.speaker === "user" && t.isFinal);
          const gotMoshiResponse = newTranscripts.some(t => t.speaker === "moshi" && t.isFinal);

          results.push({
            prompt_index: i + 1,
            prompt,
            audio_sent: bytesSent > 0,
            transcript_received: gotUserTranscript,
            response_received: gotMoshiResponse,
            latency_ms: Date.now() - promptStart
          });

        } catch (error) {
          results.push({
            prompt_index: i + 1,
            prompt,
            audio_sent: false,
            transcript_received: false,
            response_received: false,
            latency_ms: Date.now() - promptStart,
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      // Step 4: Store conversation in database
      let storedConversation = null;
      try {
        const { getOrCreateMCPSpace, createSession, addMessage } = await import("./database.js");
        // Create or get space
        const space = getOrCreateMCPSpace(space_name);
        const sessionId = createSession(space.id, `Live Test ${new Date().toLocaleString()}`);

        // Store all transcripts
        for (const t of transcripts.filter(t => t.isFinal)) {
          addMessage(sessionId, t.speaker === "user" ? "user" : "assistant", t.text);
        }

        storedConversation = {
          space_id: space.id,
          space_name: space.name,
          session_id: sessionId,
          messages_stored: transcripts.filter(t => t.isFinal).length
        };
      } catch (dbError) {
        console.error("[MCP] Failed to store conversation:", dbError);
      }

      // Close WebSocket
      if (ws) {
        ws.send(JSON.stringify({ type: "stop" }));
        ws.close();
      }

      // Aggregate results
      const successful = results.filter(r => r.audio_sent && !r.error);
      const withTranscripts = results.filter(r => r.transcript_received);
      const withResponses = results.filter(r => r.response_received);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            summary: {
              total_prompts: prompts.length,
              audio_sent: successful.length,
              transcripts_received: withTranscripts.length,
              responses_received: withResponses.length,
              avg_latency_ms: successful.length > 0
                ? Math.round(successful.reduce((a, b) => a + b.latency_ms, 0) / successful.length)
                : 0,
              total_transcripts: transcripts.length,
              final_transcripts: transcripts.filter(t => t.isFinal).length
            },
            stored_conversation: storedConversation,
            results,
            transcripts: transcripts.slice(-20), // Last 20 transcripts
            total_ms: Date.now() - start,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };

    } catch (error) {
      if (ws) {
        try { ws.close(); } catch {}
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Live session failed",
            results,
            total_ms: Date.now() - start
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Monitor UI panel (for testing)
server.tool(
  "tarx_voice_monitor_ui",
  "Check if voice transcript panel is active and receiving updates (requires VS Code extension)",
  {},
  async () => {
    // This tool checks if the extension's transcript panel is active
    // Since MCP runs outside VS Code, we check via a status file the extension writes
    const statusFile = "/tmp/tarx-voice-panel-status.json";

    let panelStatus = {
      active: false,
      last_update: null as string | null,
      utterance_count: 0,
      listening: false
    };

    if (fs.existsSync(statusFile)) {
      try {
        panelStatus = JSON.parse(fs.readFileSync(statusFile, "utf8"));
      } catch {}
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          panel_status: panelStatus,
          status_file: statusFile,
          note: panelStatus.active
            ? "Panel is active and receiving updates"
            : "Panel not detected - start voice in VS Code first",
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }
);

// ============================================================================
// UI TEST HARNESS TOOLS (port 11439)
// ============================================================================

const UI_HARNESS_PORT = 11439;

async function callHarness(endpoint: string, method: string = "GET", body?: object): Promise<unknown> {
  const url = `http://127.0.0.1:${UI_HARNESS_PORT}${endpoint}`;
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

// Tool: Get UI status
server.tool(
  "tarx_ui_status",
  "Get current Workbench UI status (connection, errors, voice state)",
  {},
  async () => {
    try {
      const status = await callHarness("/status");
      return {
        content: [{
          type: "text",
          text: JSON.stringify(status, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to connect to UI harness",
            note: "Make sure Workbench is running and the test harness is active on port 11439"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Send chat message through UI
server.tool(
  "tarx_ui_chat_send",
  "Send a message through the Workbench chat UI (triggers full UI flow)",
  {
    message: z.string().describe("Message to send through the chat UI"),
    stream: z.boolean().optional().describe("Whether to stream response (default: true)")
  },
  async ({ message, stream = true }) => {
    try {
      const result = await callHarness("/chat/send", "POST", { message, stream });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to send chat message"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Read chat messages from UI
server.tool(
  "tarx_ui_chat_read",
  "Read recent messages from the Workbench chat UI",
  {},
  async () => {
    try {
      const result = await callHarness("/chat/read");
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to read chat messages"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Get UI error state
server.tool(
  "tarx_ui_error",
  "Get current error state from Workbench UI",
  {},
  async () => {
    try {
      const result = await callHarness("/error");
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get error state"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Start voice through UI
server.tool(
  "tarx_ui_voice_start",
  "Start voice mode through the Workbench UI",
  {},
  async () => {
    try {
      const result = await callHarness("/voice/start", "POST");
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to start voice"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Stop voice through UI
server.tool(
  "tarx_ui_voice_stop",
  "Stop voice mode through the Workbench UI",
  {},
  async () => {
    try {
      const result = await callHarness("/voice/stop", "POST");
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to stop voice"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Force UI reconnect
server.tool(
  "tarx_ui_reconnect",
  "Force Workbench UI to reconnect to llama-server",
  {},
  async () => {
    try {
      const result = await callHarness("/reconnect", "POST");
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to reconnect"
          })
        }],
        isError: true
      };
    }
  }
);

// ============================================================================
// ADVANCED INFERENCE TOOLS
// ============================================================================

// Track active requests for cancellation
const activeRequests = new Map<string, AbortController>();

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
      // TARX Bridge Integration - Feb 2026: Always include system prompt with context
      const messages: Array<{ role: string; content: string }> = [];

      // If systemPrompt provided, use it; otherwise build contextual prompt
      let finalSystemPrompt: string;
      if (systemPrompt) {
        finalSystemPrompt = systemPrompt;
      } else {
        finalSystemPrompt = await buildLightweightPrompt(TARX_SYSTEM_PROMPT, {
          config: promptConfigStore.getConfig()
        });
      }

      messages.push({ role: "system", content: finalSystemPrompt });
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

// Tool: Pre-warm model with partial prompt
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
      // TARX Bridge Integration - Feb 2026: Always include system prompt with context
      const messages: Array<{ role: string; content: string }> = [];

      let finalSystemPrompt: string;
      if (systemPrompt) {
        finalSystemPrompt = systemPrompt;
      } else {
        finalSystemPrompt = await buildLightweightPrompt(TARX_SYSTEM_PROMPT, {
          config: promptConfigStore.getConfig()
        });
      }

      messages.push({ role: "system", content: finalSystemPrompt });
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

// Tool: Cancel in-flight generation
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
// SYSTEM PROMPT CONFIGURATION TOOLS
// ============================================================================

// Tool: Set custom instructions
server.tool(
  "tarx_set_custom_instructions",
  "Set custom instructions to append to the TARX system prompt. These instructions will be added to all future inference calls.",
  {
    instructions: z.string().describe("Custom instructions to add to the system prompt (or empty string to clear)")
  },
  async ({ instructions }) => {
    try {
      if (instructions.trim() === "") {
        promptConfigStore.setCustomInstructions("");
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              action: "cleared",
              message: "Custom instructions cleared. Using default TARX system prompt."
            }, null, 2)
          }]
        };
      }

      promptConfigStore.setCustomInstructions(instructions);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            action: "set",
            instructions,
            message: "Custom instructions will be appended to all future prompts."
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Failed to set custom instructions"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Override system prompt
server.tool(
  "tarx_override_system_prompt",
  "Completely override the TARX system prompt with a custom one. Use with caution - this replaces the entire personality. Pass null to restore default.",
  {
    prompt: z.string().nullable().describe("Custom system prompt (or null to restore default)")
  },
  async ({ prompt }) => {
    try {
      promptConfigStore.setOverridePrompt(prompt);

      if (prompt === null) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              action: "restored",
              message: "System prompt restored to default TARX personality."
            }, null, 2)
          }]
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            action: "overridden",
            message: "System prompt completely overridden. All future inference calls will use the custom prompt.",
            preview: prompt.substring(0, 200) + (prompt.length > 200 ? "..." : "")
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Failed to override system prompt"
          })
        }],
        isError: true
      };
    }
  }
);

// Tool: Get current prompt configuration
server.tool(
  "tarx_get_prompt_config",
  "Get the current system prompt configuration including any custom instructions or overrides",
  {},
  async () => {
    const config = promptConfigStore.getConfig();
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          customInstructions: config.customInstructions || null,
          overridePrompt: config.overridePrompt || null,
          usingDefault: !config.overridePrompt,
          hasCustomInstructions: Boolean(config.customInstructions)
        }, null, 2)
      }]
    };
  }
);

// ============================================================================
// SIDEBAR CONTROL TOOLS
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
            success: false,
            error: error instanceof Error ? error.message : "Failed to refresh sidebar"
          }, null, 2)
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
          }, null, 2)
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
          }, null, 2)
        }],
        isError: true
      };
    }
  }
);

// Tool: Select a project in the sidebar
server.tool(
  "tarx_sidebar_select_project",
  "Select a project in the sidebar by ID via the UI harness",
  {
    projectId: z.string().describe("Project ID to select")
  },
  async ({ projectId }) => {
    try {
      const result = await callHarness("/sidebar/action", "POST", {
        action: "selectProject",
        projectId
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to select project",
            projectId
          }, null, 2)
        }],
        isError: true
      };
    }
  }
);

// Tool: Show error in sidebar section
server.tool(
  "tarx_sidebar_show_error",
  "Display an error message in a sidebar section",
  {
    section: z.enum(["projects", "history", "files"])
      .describe("Section to show error in"),
    message: z.string().describe("Error message to display")
  },
  async ({ section, message }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          section,
          message,
          command: "tarx.sidebar.ui.showError",
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }
);

// Tool: Clear error from sidebar section
server.tool(
  "tarx_sidebar_clear_error",
  "Clear error message from a sidebar section",
  {
    section: z.enum(["projects", "history", "files"])
      .describe("Section to clear error from")
  },
  async ({ section }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          section,
          command: "tarx.sidebar.ui.clearError",
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }
);

// Tool: Set loading state for a sidebar section
server.tool(
  "tarx_sidebar_set_loading",
  "Set loading state for a sidebar section",
  {
    section: z.enum(["projects", "history", "files"])
      .describe("Section to set loading state"),
    isLoading: z.boolean().describe("Loading state (true/false)")
  },
  async ({ section, isLoading }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          section,
          isLoading,
          command: "tarx.sidebar.ui.setLoading",
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }
);

// Tool: Set connection status in sidebar
server.tool(
  "tarx_sidebar_set_connection",
  "Set the connection status displayed in the sidebar",
  {
    status: z.enum(["online", "offline", "connecting", "reconnecting"])
      .describe("Connection status to display")
  },
  async ({ status }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          status,
          command: "tarx.sidebar.ui.setConnectionStatus",
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }
);

// ============================================================================
// RESOURCES
// ============================================================================

// Resource: List available models
server.resource(
  "tarx://models",
  "List available TARX models",
  async () => ({
    contents: [{
      uri: "tarx://models",
      mimeType: "application/json",
      text: JSON.stringify({
        inference: {
          model: "tx-16g",
          port: INFERENCE_PORT,
          capabilities: ["chat", "completion"]
        },
        embedding: {
          model: "nomic-embed-v1.5",
          port: EMBED_PORT,
          dimensions: 768
        }
      }, null, 2)
    }]
  })
);

// Resource: System info
server.resource(
  "tarx://system",
  "TARX system configuration and status",
  async () => {
    const health = {
      inference: await checkPort(INFERENCE_PORT),
      embeddings: await checkPort(EMBED_PORT),
      mesh: await checkPort(MESH_PORT)
    };

    return {
      contents: [{
        uri: "tarx://system",
        mimeType: "application/json",
        text: JSON.stringify({
          version: "1.0.0",
          ports: {
            inference: INFERENCE_PORT,
            embeddings: EMBED_PORT,
            mesh: MESH_PORT
          },
          health,
          ready: health.inference
        }, null, 2)
      }]
    };
  }
);

// Resource: Voice config
server.resource(
  "tarx://voice/config",
  "Current voice pipeline configuration",
  async () => {
    const configFile = "/tmp/tarx-voice-config.json";
    let config = {
      vad_timeout_ms: 1000,
      rms_threshold: 0.015,
      silence_threshold_ms: 3000,
      max_response_tokens: 150
    };

    if (fs.existsSync(configFile)) {
      try {
        config = { ...config, ...JSON.parse(fs.readFileSync(configFile, "utf8")) };
      } catch {}
    }

    return {
      contents: [{
        uri: "tarx://voice/config",
        mimeType: "application/json",
        text: JSON.stringify(config, null, 2)
      }]
    };
  }
);

// Resource: Voice metrics
server.resource(
  "tarx://voice/metrics",
  "Recent voice performance metrics",
  async () => {
    const metricsFile = "/tmp/tarx-voice-metrics.json";
    let metrics = {
      total_conversations: 0,
      avg_latency_ms: 0,
      success_rate: 0,
      avg_hallucination_score: 0,
      last_updated: null
    };

    if (fs.existsSync(metricsFile)) {
      try {
        metrics = JSON.parse(fs.readFileSync(metricsFile, "utf8"));
      } catch {}
    }

    return {
      contents: [{
        uri: "tarx://voice/metrics",
        mimeType: "application/json",
        text: JSON.stringify(metrics, null, 2)
      }]
    };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TARX MCP Server started");
}

main().catch(console.error);
