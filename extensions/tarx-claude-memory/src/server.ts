#!/usr/bin/env node
/**
 * TARX Memory - Claude Extension
 *
 * Consumer-facing MCP server for Claude Desktop.
 * Provides persistent local memory with semantic search.
 * All conversations are threaded into TARX chat history.
 *
 * @package tarx-claude-memory
 * @version 1.0.0
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  storeMemory,
  searchMemories,
  getAllMemories,
  deleteMemory,
  storeMessage,
  getRecentMessages,
  getStats,
  getOrCreateClaudeSpace,
  getCurrentSession,
  // New session sync functions
  createSession,
  threadToSession,
  getSessionHistory,
  getOrCreateDefaultSession
} from "./database.js";

const server = new McpServer({
  name: "TARX Memory",
  version: "1.0.0"
});

// ============================================================================
// MEMORY TOOLS
// ============================================================================

/**
 * Store a memory for future recall
 */
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

      // Also store as a message in chat history for threading
      storeMessage('system', `[Memory saved] ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);

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
            success: false,
            error: error instanceof Error ? error.message : "Failed to store memory"
          })
        }],
        isError: true
      };
    }
  }
);

/**
 * Search memories semantically
 */
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
            success: false,
            error: error instanceof Error ? error.message : "Search failed"
          })
        }],
        isError: true
      };
    }
  }
);

/**
 * Recall context for the current conversation
 */
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
      const recentMessages = getRecentMessages(10);

      // Format context for injection
      let context = "";

      if (memories.length > 0) {
        context += "**Relevant memories:**\n";
        memories.forEach((m, i) => {
          context += `${i + 1}. ${m.content}\n`;
        });
      }

      if (recentMessages.length > 0) {
        context += "\n**Recent conversation context:**\n";
        recentMessages.slice(0, 5).reverse().forEach(msg => {
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

/**
 * List all memories
 */
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
            success: false,
            error: error instanceof Error ? error.message : "Failed to list memories"
          })
        }],
        isError: true
      };
    }
  }
);

/**
 * Delete a memory
 */
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
            success: false,
            error: error instanceof Error ? error.message : "Failed to forget memory"
          })
        }],
        isError: true
      };
    }
  }
);

/**
 * Get memory stats
 */
server.tool(
  "memory_stats",
  "Get statistics about TARX memory usage",
  {},
  async () => {
    try {
      const stats = getStats();
      const session = getCurrentSession();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            stats: {
              totalMemories: stats.totalMemories,
              totalMessages: stats.totalMessages,
              totalSessions: stats.totalSessions,
              currentSessionId: session.sessionId,
              claudeSpace: stats.claudeSpace ? {
                id: stats.claudeSpace.id,
                name: stats.claudeSpace.name,
                messageCount: stats.claudeSpace.message_count
              } : null
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Failed to get stats"
          })
        }],
        isError: true
      };
    }
  }
);

// ============================================================================
// CONVERSATION THREADING
// ============================================================================

/**
 * Thread a user message into TARX chat history
 */
server.tool(
  "thread_message",
  "Thread the current message into TARX chat history for persistent storage",
  {
    role: z.enum(["user", "assistant"]).describe("Who sent the message"),
    content: z.string().describe("The message content")
  },
  async ({ role, content }) => {
    try {
      const { messageId, sessionId } = storeMessage(role, content);

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
            success: false,
            error: error instanceof Error ? error.message : "Failed to thread message"
          })
        }],
        isError: true
      };
    }
  }
);

// ============================================================================
// CLAUDE.AI SESSION SYNC TOOLS
// ============================================================================

/**
 * Create a dedicated session for a Claude.ai conversation
 */
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
      const result = createSession({ title, topic, metadata });

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
            success: false,
            error: error instanceof Error ? error.message : "Failed to create session"
          })
        }],
        isError: true
      };
    }
  }
);

/**
 * Thread a message to a specific session
 */
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
            success: false,
            error: error instanceof Error ? error.message : "Failed to thread message"
          })
        }],
        isError: true
      };
    }
  }
);

/**
 * Get full conversation history for a session
 */
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
            success: false,
            error: error instanceof Error ? error.message : "Failed to get session"
          })
        }],
        isError: true
      };
    }
  }
);

// ============================================================================
// RESOURCES
// ============================================================================

server.resource(
  "tarx://memory/stats",
  "TARX memory statistics and status",
  async () => {
    const stats = getStats();
    return {
      contents: [{
        uri: "tarx://memory/stats",
        mimeType: "application/json",
        text: JSON.stringify(stats, null, 2)
      }]
    };
  }
);

server.resource(
  "tarx://memory/recent",
  "Recent memories stored in TARX",
  async () => {
    const memories = getAllMemories(20);
    return {
      contents: [{
        uri: "tarx://memory/recent",
        mimeType: "application/json",
        text: JSON.stringify(memories, null, 2)
      }]
    };
  }
);

// ============================================================================
// STARTUP
// ============================================================================

async function main() {
  // Ensure Claude space exists on startup
  getOrCreateClaudeSpace();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("TARX Memory server started");
  console.error("Memory tools: memory_store, memory_search, memory_recall, memory_list, memory_forget, memory_stats");
  console.error("Threading tools: thread_message, memory_create_session, memory_thread_to_session, memory_get_session");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
