#!/usr/bin/env node
/**
 * TARX Orchestration MCP Server v2.0.0
 *
 * 34 tools for orchestrating Claude Code sessions and managing external models.
 *
 * Tool Categories:
 * - Session Monitoring (6 tools)
 * - Documentation Management (5 tools)
 * - Task & Milestone Management (6 tools)
 * - Context Synchronization (4 tools)
 * - Feedback & Input (4 tools)
 * - Model Management (8 tools)
 * - Status Report (1 tool)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { db, DB_PATH } from "./database.js";
import { encryptApiKey, decryptApiKey, generateId, now } from "./crypto.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// =============================================================================
// MCP SERVER SETUP
// =============================================================================

const server = new McpServer({
  name: "tarx-orchestration",
  version: "2.0.0",
});

// =============================================================================
// SECURITY: creator_only middleware + audit logging
// =============================================================================

const CREATOR_KEY = process.env.TARX_CREATOR_KEY;
const AUDIT_LOG_PATH = path.join(os.homedir(), "Library/Application Support/tarx/audit.jsonl");

function auditLog(toolName: string, params: unknown, result: { isError?: boolean } | null): void {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      server: "tarx-orchestration",
      tool: toolName,
      params: typeof params === "object" ? params : {},
      success: result ? !result.isError : true,
      creator_authenticated: !!CREATOR_KEY,
    };
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + "\n");
  } catch {
    // Audit logging should never crash the server
  }
}

type ToolHandler<T> = (params: T) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function creator_only<T>(toolName: string, handler: ToolHandler<T>): ToolHandler<T> {
  return async (params: T) => {
    if (!CREATOR_KEY) {
      const result = {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: "Orchestration tools require creator authentication. Set TARX_CREATOR_KEY environment variable.",
            tool: toolName,
          }),
        }],
        isError: true as const,
      };
      auditLog(toolName, params, result);
      return result;
    }
    const result = await handler(params);
    auditLog(toolName, params, result);
    return result;
  };
}

// Auto-wrap ALL tool handlers with creator_only + audit logging
const _originalTool = server.tool.bind(server);
server.tool = function (name: string, ...rest: unknown[]) {
  const handler = rest[rest.length - 1] as ToolHandler<unknown>;
  rest[rest.length - 1] = creator_only(name, handler);
  return (_originalTool as Function).call(server, name, ...rest);
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getSession(sessionId: string): Record<string, unknown> | null {
  return db.prepare("SELECT * FROM orch_sessions WHERE id = ?").get(sessionId) as Record<string, unknown> | null;
}

function logActivity(sessionId: string, activityType: string, details?: Record<string, unknown>): void {
  db.prepare(`
    INSERT INTO orch_session_activity (session_id, timestamp, activity_type, details)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, now(), activityType, JSON.stringify(details || {}));

  db.prepare("UPDATE orch_sessions SET last_activity = ? WHERE id = ?").run(now(), sessionId);
}

function resolveFilePath(workspacePath: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath);
}

// =============================================================================
// SESSION MONITORING TOOLS (6 tools)
// =============================================================================

// 1. Register session
server.tool(
  "tarx_orchestrate_register_session",
  "Register a Claude Code session for orchestration",
  {
    sessionId: z.string().describe("Unique session ID"),
    name: z.string().describe("Human-readable session name"),
    workspacePath: z.string().describe("Workspace path"),
  },
  async ({ sessionId, name, workspacePath }) => {
    try {
      db.prepare(`
        INSERT OR REPLACE INTO orch_sessions (id, name, workspace_path, status, last_activity, created_at)
        VALUES (?, ?, ?, 'active', ?, COALESCE((SELECT created_at FROM orch_sessions WHERE id = ?), ?))
      `).run(sessionId, name, workspacePath, now(), sessionId, now());

      logActivity(sessionId, "session_registered", { name, workspacePath });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ registered: true, sessionId, name }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 2. Get session state
server.tool(
  "tarx_orchestrate_session_state",
  "Get current state of a session including current file, task, and thinking notes",
  {
    sessionId: z.string().describe("Session ID to query"),
  },
  async ({ sessionId }) => {
    try {
      const session = getSession(sessionId);
      if (!session) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Session not found" }) }],
          isError: true,
        };
      }

      // Get file stack
      const files = db.prepare(`
        SELECT file_path, is_active FROM orch_session_files
        WHERE session_id = ? ORDER BY opened_at DESC LIMIT 10
      `).all(sessionId);

      // Get pending tasks
      const tasks = db.prepare(`
        SELECT id, title, status, priority FROM orch_tasks
        WHERE session_id = ? AND status != 'completed'
        ORDER BY priority DESC LIMIT 5
      `).all(sessionId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            session: {
              id: session.id,
              name: session.name,
              status: session.status,
              currentFile: session.current_file,
              currentTask: session.current_task,
              thinkingNotes: session.thinking_notes,
              lastCommand: session.last_command,
              lastOutput: session.last_output,
              errorState: session.error_state,
              lastActivity: session.last_activity,
            },
            fileStack: files,
            pendingTasks: tasks,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 3. Report activity
server.tool(
  "tarx_orchestrate_report_activity",
  "Report session activity (called by VS Code extension)",
  {
    sessionId: z.string().describe("Session ID"),
    activityType: z.string().describe("Activity type: file_open, file_edit, command_run, error, thinking"),
    details: z.record(z.string(), z.unknown()).optional().describe("Activity details"),
  },
  async ({ sessionId, activityType, details }) => {
    try {
      logActivity(sessionId, activityType, details);

      // Update session state based on activity type
      const updates: string[] = [];
      const values: unknown[] = [];

      if (details?.file && activityType === "file_open") {
        updates.push("current_file = ?");
        values.push(details.file);

        // Add to file stack
        db.prepare(`
          INSERT INTO orch_session_files (session_id, file_path, opened_at, is_active)
          VALUES (?, ?, ?, 1)
        `).run(sessionId, details.file, now());

        // Mark other files as not active
        db.prepare(`
          UPDATE orch_session_files SET is_active = 0
          WHERE session_id = ? AND file_path != ?
        `).run(sessionId, details.file);
      }

      if (details?.command && activityType === "command_run") {
        updates.push("last_command = ?");
        values.push(details.command);
        if (details.output) {
          updates.push("last_output = ?");
          values.push(String(details.output).slice(0, 1000));
        }
      }

      if (details?.thinking && activityType === "thinking") {
        updates.push("thinking_notes = ?");
        values.push(details.thinking);
      }

      if (details?.error) {
        updates.push("error_state = ?");
        values.push(details.error);
      }

      if (details?.task) {
        updates.push("current_task = ?");
        values.push(details.task);
      }

      if (updates.length > 0) {
        values.push(sessionId);
        db.prepare(`UPDATE orch_sessions SET ${updates.join(", ")} WHERE id = ?`).run(...values);
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ logged: true, activityType }) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 4. Get session activity
server.tool(
  "tarx_orchestrate_session_activity",
  "Get recent activity log for a session",
  {
    sessionId: z.string().describe("Session ID"),
    limit: z.number().optional().describe("Max entries (default: 20)"),
  },
  async ({ sessionId, limit = 20 }) => {
    try {
      const activities = db.prepare(`
        SELECT * FROM session_activity
        WHERE session_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(sessionId, limit) as Array<Record<string, unknown>>;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            activities: activities.map(a => ({
              ...a,
              details: JSON.parse(a.details as string || "{}"),
              time: new Date(a.timestamp as number).toISOString(),
            })),
            count: activities.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 5. List sessions
server.tool(
  "tarx_orchestrate_list_sessions",
  "List all orchestrated sessions",
  {
    status: z.enum(["active", "paused", "completed", "all"]).optional().describe("Filter by status"),
  },
  async ({ status }) => {
    try {
      const query = status && status !== "all"
        ? "SELECT * FROM orch_sessions WHERE status = ? ORDER BY last_activity DESC"
        : "SELECT * FROM orch_sessions ORDER BY last_activity DESC";

      const sessions = status && status !== "all"
        ? db.prepare(query).all(status)
        : db.prepare(query).all();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sessions: (sessions as Array<Record<string, unknown>>).map(s => ({
              ...s,
              lastActivity: new Date(s.last_activity as number).toISOString(),
            })),
            count: sessions.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 6. Pause/resume session
server.tool(
  "tarx_orchestrate_session_pause",
  "Pause or resume a session",
  {
    sessionId: z.string().describe("Session ID"),
    pause: z.boolean().describe("True to pause, false to resume"),
  },
  async ({ sessionId, pause }) => {
    try {
      const newStatus = pause ? "paused" : "active";
      db.prepare("UPDATE orch_sessions SET status = ?, last_activity = ? WHERE id = ?").run(newStatus, now(), sessionId);
      logActivity(sessionId, pause ? "session_paused" : "session_resumed");

      return {
        content: [{ type: "text", text: JSON.stringify({ sessionId, status: newStatus }) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// DOCUMENTATION MANAGEMENT TOOLS (5 tools)
// =============================================================================

// 7. Read file
server.tool(
  "tarx_orchestrate_read_file",
  "Read a file from session workspace",
  {
    sessionId: z.string().describe("Session ID"),
    filePath: z.string().describe("File path (relative or absolute)"),
  },
  async ({ sessionId, filePath }) => {
    try {
      const session = getSession(sessionId);
      if (!session) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Session not found" }) }],
          isError: true,
        };
      }

      const fullPath = resolveFilePath(session.workspace_path as string, filePath);

      if (!fs.existsSync(fullPath)) {
        return {
          content: [{ type: "text", text: JSON.stringify({ exists: false, error: "File not found", path: fullPath }) }],
        };
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      const stats = fs.statSync(fullPath);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            exists: true,
            content,
            lastModified: stats.mtimeMs,
            size: stats.size,
            path: fullPath,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 8. Update file
server.tool(
  "tarx_orchestrate_update_file",
  "Update a file in session workspace",
  {
    sessionId: z.string().describe("Session ID"),
    filePath: z.string().describe("File path"),
    content: z.string().describe("Content to write"),
    mode: z.enum(["overwrite", "append", "prepend"]).optional().describe("Write mode (default: overwrite)"),
  },
  async ({ sessionId, filePath, content, mode = "overwrite" }) => {
    try {
      const session = getSession(sessionId);
      if (!session) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Session not found" }) }],
          isError: true,
        };
      }

      const fullPath = resolveFilePath(session.workspace_path as string, filePath);
      let finalContent = content;

      if (mode === "append" && fs.existsSync(fullPath)) {
        const existing = fs.readFileSync(fullPath, "utf-8");
        finalContent = existing + "\n" + content;
      } else if (mode === "prepend" && fs.existsSync(fullPath)) {
        const existing = fs.readFileSync(fullPath, "utf-8");
        finalContent = content + "\n" + existing;
      }

      // Ensure directory exists
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, finalContent, "utf-8");

      // Track in managed docs
      const existing = db.prepare("SELECT id, update_count FROM orch_managed_docs WHERE file_path = ?").get(filePath) as Record<string, unknown> | undefined;

      if (existing) {
        db.prepare(`
          UPDATE orch_managed_docs SET session_id = ?, last_updated = ?, update_count = ? WHERE id = ?
        `).run(sessionId, now(), (existing.update_count as number) + 1, existing.id);
      } else {
        db.prepare(`
          INSERT INTO orch_managed_docs (session_id, file_path, doc_type, last_updated)
          VALUES (?, ?, 'CUSTOM', ?)
        `).run(sessionId, filePath, now());
      }

      logActivity(sessionId, "file_updated", { filePath, mode });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ updated: true, filePath: fullPath, mode }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 9. Create documentation
server.tool(
  "tarx_orchestrate_create_doc",
  "Create a documentation file",
  {
    sessionId: z.string().describe("Session ID"),
    docType: z.enum(["README", "CHANGELOG", "SESSION_LOG", "DECISION_LOG"]).describe("Document type"),
    fileName: z.string().describe("File name"),
    content: z.string().describe("Initial content"),
  },
  async ({ sessionId, docType, fileName, content }) => {
    try {
      const session = getSession(sessionId);
      if (!session) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Session not found" }) }],
          isError: true,
        };
      }

      const fullPath = resolveFilePath(session.workspace_path as string, fileName);

      // Ensure directory exists
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, content, "utf-8");

      db.prepare(`
        INSERT INTO orch_managed_docs (session_id, file_path, doc_type, last_updated)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, fileName, docType, now());

      logActivity(sessionId, "doc_created", { docType, fileName });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ created: true, filePath: fullPath, docType }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 10. List managed docs
server.tool(
  "tarx_orchestrate_list_docs",
  "List all managed documentation files",
  {
    sessionId: z.string().optional().describe("Filter by session ID"),
  },
  async ({ sessionId }) => {
    try {
      const query = sessionId
        ? "SELECT md.*, s.name as session_name FROM orch_managed_docs md JOIN orch_sessions s ON md.session_id = s.id WHERE md.session_id = ? ORDER BY md.last_updated DESC"
        : "SELECT md.*, s.name as session_name FROM orch_managed_docs md JOIN orch_sessions s ON md.session_id = s.id ORDER BY md.last_updated DESC";

      const docs = sessionId
        ? db.prepare(query).all(sessionId)
        : db.prepare(query).all();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            docs: (docs as Array<Record<string, unknown>>).map(d => ({
              ...d,
              lastUpdated: new Date(d.last_updated as number).toISOString(),
            })),
            count: docs.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 11. Doc history
server.tool(
  "tarx_orchestrate_doc_history",
  "Get update history for a documentation file",
  {
    filePath: z.string().describe("File path"),
    limit: z.number().optional().describe("Max entries (default: 10)"),
  },
  async ({ filePath, limit = 10 }) => {
    try {
      const doc = db.prepare("SELECT * FROM orch_managed_docs WHERE file_path = ?").get(filePath) as Record<string, unknown> | undefined;

      if (!doc) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Document not tracked" }) }],
        };
      }

      const history = db.prepare(`
        SELECT dh.*, s.name as session_name
        FROM orch_doc_history dh
        JOIN orch_sessions s ON dh.session_id = s.id
        WHERE dh.doc_id = ?
        ORDER BY dh.timestamp DESC
        LIMIT ?
      `).all(doc.id, limit);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            filePath,
            docType: doc.doc_type,
            updateCount: doc.update_count,
            history: (history as Array<Record<string, unknown>>).map(h => ({
              ...h,
              time: new Date(h.timestamp as number).toISOString(),
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TASK & MILESTONE MANAGEMENT TOOLS (6 tools)
// =============================================================================

// 12. Assign task
server.tool(
  "tarx_orchestrate_assign_task",
  "Assign a task to a session",
  {
    sessionId: z.string().describe("Session ID"),
    taskId: z.string().describe("Unique task ID"),
    title: z.string().describe("Task title"),
    description: z.string().optional().describe("Task description"),
    priority: z.enum(["critical", "high", "medium", "low"]).describe("Task priority"),
    milestoneId: z.string().optional().describe("Associated milestone ID"),
  },
  async ({ sessionId, taskId, title, description, priority, milestoneId }) => {
    try {
      db.prepare(`
        INSERT INTO orch_tasks (id, session_id, milestone_id, title, description, status, priority, assigned_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(taskId, sessionId, milestoneId || null, title, description || "", priority, now());

      logActivity(sessionId, "task_assigned", { taskId, title, priority });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ assigned: true, taskId, title, priority }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 13. Update task
server.tool(
  "tarx_orchestrate_task_update",
  "Update task status",
  {
    taskId: z.string().describe("Task ID"),
    status: z.enum(["pending", "in_progress", "blocked", "completed"]).describe("New status"),
    notes: z.string().optional().describe("Status notes"),
    blockedBy: z.string().optional().describe("What's blocking the task"),
  },
  async ({ taskId, status, notes, blockedBy }) => {
    try {
      const task = db.prepare("SELECT * FROM orch_tasks WHERE id = ?").get(taskId) as Record<string, unknown> | undefined;
      if (!task) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Task not found" }) }],
          isError: true,
        };
      }

      const updates: string[] = ["status = ?"];
      const values: unknown[] = [status];

      if (status === "in_progress" && !task.started_at) {
        updates.push("started_at = ?");
        values.push(now());
      }

      if (status === "completed") {
        updates.push("completed_at = ?");
        values.push(now());
        if (notes) {
          updates.push("result = ?");
          values.push(notes);
        }
      }

      if (status === "blocked" && blockedBy) {
        updates.push("blocked_by = ?");
        values.push(blockedBy);
      }

      values.push(taskId);
      db.prepare(`UPDATE orch_tasks SET ${updates.join(", ")} WHERE id = ?`).run(...values);

      logActivity(task.session_id as string, "task_updated", { taskId, status, notes });

      const updatedTask = db.prepare("SELECT * FROM orch_tasks WHERE id = ?").get(taskId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ updated: true, task: updatedTask }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 14. List tasks
server.tool(
  "tarx_orchestrate_task_list",
  "List tasks with optional filters",
  {
    sessionId: z.string().optional().describe("Filter by session"),
    status: z.string().optional().describe("Filter by status"),
    milestoneId: z.string().optional().describe("Filter by milestone"),
  },
  async ({ sessionId, status, milestoneId }) => {
    try {
      let query = "SELECT t.*, s.name as session_name FROM orch_tasks t JOIN orch_sessions s ON t.session_id = s.id WHERE 1=1";
      const params: unknown[] = [];

      if (sessionId) {
        query += " AND t.session_id = ?";
        params.push(sessionId);
      }
      if (status) {
        query += " AND t.status = ?";
        params.push(status);
      }
      if (milestoneId) {
        query += " AND t.milestone_id = ?";
        params.push(milestoneId);
      }

      query += " ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.assigned_at DESC";

      const tasks = db.prepare(query).all(...params);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ tasks, count: tasks.length }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 15. Create milestone
server.tool(
  "tarx_orchestrate_milestone_create",
  "Create a milestone for tracking progress",
  {
    milestoneId: z.string().describe("Unique milestone ID"),
    name: z.string().describe("Milestone name"),
    description: z.string().optional().describe("Description"),
    targetDate: z.number().optional().describe("Target completion timestamp"),
  },
  async ({ milestoneId, name, description, targetDate }) => {
    try {
      db.prepare(`
        INSERT INTO orch_milestones (id, name, description, target_date, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `).run(milestoneId, name, description || "", targetDate || null, now());

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ created: true, milestoneId, name }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 16. Update milestone
server.tool(
  "tarx_orchestrate_milestone_update",
  "Update milestone progress",
  {
    milestoneId: z.string().describe("Milestone ID"),
    progress: z.number().min(0).max(100).optional().describe("Progress percentage"),
    notes: z.string().optional().describe("Update notes"),
  },
  async ({ milestoneId, progress, notes }) => {
    try {
      const updates: string[] = [];
      const values: unknown[] = [];

      if (progress !== undefined) {
        updates.push("progress = ?");
        values.push(progress);

        if (progress >= 100) {
          updates.push("status = 'completed'");
          updates.push("completed_at = ?");
          values.push(now());
        } else if (progress > 0) {
          updates.push("status = 'in_progress'");
        }
      }

      if (updates.length > 0) {
        values.push(milestoneId);
        db.prepare(`UPDATE orch_milestones SET ${updates.join(", ")} WHERE id = ?`).run(...values);
      }

      const milestone = db.prepare("SELECT * FROM orch_milestones WHERE id = ?").get(milestoneId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ updated: true, milestone }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 17. List milestones
server.tool(
  "tarx_orchestrate_milestone_list",
  "List all milestones",
  {
    status: z.string().optional().describe("Filter by status"),
  },
  async ({ status }) => {
    try {
      const query = status
        ? "SELECT * FROM orch_milestones WHERE status = ? ORDER BY target_date ASC, created_at DESC"
        : "SELECT * FROM orch_milestones ORDER BY target_date ASC, created_at DESC";

      const milestones = status
        ? db.prepare(query).all(status)
        : db.prepare(query).all();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ milestones, count: milestones.length }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// CONTEXT SYNCHRONIZATION TOOLS (4 tools)
// =============================================================================

// 18. Push context
server.tool(
  "tarx_orchestrate_push_context",
  "Push context update to a session",
  {
    toSessionId: z.string().describe("Target session ID"),
    fromSessionId: z.string().optional().describe("Source session ID"),
    updateType: z.string().describe("Update type: finding, decision, blocker_resolved, milestone_complete"),
    message: z.string().describe("Update message"),
    priority: z.enum(["high", "normal"]).optional().describe("Priority (default: normal)"),
  },
  async ({ toSessionId, fromSessionId, updateType, message, priority = "normal" }) => {
    try {
      db.prepare(`
        INSERT INTO orch_context_updates (from_session_id, to_session_id, update_type, message, priority, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(fromSessionId || null, toSessionId, updateType, message, priority, now());

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ delivered: true, toSessionId, updateType }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 19. Broadcast
server.tool(
  "tarx_orchestrate_broadcast",
  "Broadcast message to all active sessions",
  {
    message: z.string().describe("Broadcast message"),
    priority: z.enum(["high", "normal"]).optional().describe("Priority"),
    excludeSessions: z.array(z.string()).optional().describe("Session IDs to exclude"),
  },
  async ({ message, priority = "normal", excludeSessions = [] }) => {
    try {
      const sessions = db.prepare("SELECT id FROM orch_sessions WHERE status = 'active'").all() as Array<{ id: string }>;

      const deliveredTo: string[] = [];
      for (const session of sessions) {
        if (!excludeSessions.includes(session.id)) {
          db.prepare(`
            INSERT INTO orch_context_updates (to_session_id, update_type, message, priority, timestamp)
            VALUES (?, 'broadcast', ?, ?, ?)
          `).run(session.id, message, priority, now());
          deliveredTo.push(session.id);
        }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ delivered: true, deliveredTo, count: deliveredTo.length }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 20. Get updates
server.tool(
  "tarx_orchestrate_get_updates",
  "Get pending context updates for a session",
  {
    sessionId: z.string().describe("Session ID"),
  },
  async ({ sessionId }) => {
    try {
      const updates = db.prepare(`
        SELECT cu.*, s.name as from_session_name
        FROM orch_context_updates cu
        LEFT JOIN orch_sessions s ON cu.from_session_id = s.id
        WHERE cu.to_session_id = ? AND cu.delivered = 0
        ORDER BY CASE cu.priority WHEN 'high' THEN 0 ELSE 1 END, cu.timestamp DESC
      `).all(sessionId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            updates: (updates as Array<Record<string, unknown>>).map(u => ({
              ...u,
              time: new Date(u.timestamp as number).toISOString(),
            })),
            count: updates.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 21. Mark delivered
server.tool(
  "tarx_orchestrate_mark_delivered",
  "Mark a context update as delivered",
  {
    updateId: z.number().describe("Update ID"),
  },
  async ({ updateId }) => {
    try {
      db.prepare("UPDATE orch_context_updates SET delivered = 1 WHERE id = ?").run(updateId);
      return {
        content: [{ type: "text", text: JSON.stringify({ marked: true, updateId }) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// FEEDBACK & INPUT TOOLS (4 tools)
// =============================================================================

// 22. Request feedback
server.tool(
  "tarx_orchestrate_request_feedback",
  "Request user feedback on a topic",
  {
    topic: z.string().describe("Feedback topic"),
    context: z.string().describe("Context for the request"),
    options: z.array(z.string()).optional().describe("Optional choices"),
    urgency: z.enum(["blocking", "high", "normal"]).describe("Urgency level"),
  },
  async ({ topic, context, options, urgency }) => {
    try {
      const requestId = generateId();

      db.prepare(`
        INSERT INTO orch_feedback_requests (id, topic, context, options, urgency, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `).run(requestId, topic, context, options ? JSON.stringify(options) : null, urgency, now());

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ requestId, topic, urgency, status: "pending" }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 23. Provide feedback
server.tool(
  "tarx_orchestrate_provide_feedback",
  "Provide feedback response (called by UI)",
  {
    requestId: z.string().describe("Request ID"),
    response: z.string().describe("Feedback response"),
  },
  async ({ requestId, response }) => {
    try {
      db.prepare(`
        UPDATE orch_feedback_requests
        SET response = ?, status = 'received', responded_at = ?
        WHERE id = ?
      `).run(response, now(), requestId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ received: true, requestId }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 24. Check feedback
server.tool(
  "tarx_orchestrate_check_feedback",
  "Check feedback request status",
  {
    requestId: z.string().describe("Request ID"),
  },
  async ({ requestId }) => {
    try {
      const request = db.prepare("SELECT * FROM orch_feedback_requests WHERE id = ?").get(requestId) as Record<string, unknown> | undefined;

      if (!request) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Request not found" }) }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ...request,
            options: request.options ? JSON.parse(request.options as string) : null,
            createdAt: new Date(request.created_at as number).toISOString(),
            respondedAt: request.responded_at ? new Date(request.responded_at as number).toISOString() : null,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 25. List feedback requests
server.tool(
  "tarx_orchestrate_list_feedback_requests",
  "List all feedback requests",
  {
    status: z.enum(["pending", "received", "all"]).optional().describe("Filter by status"),
  },
  async ({ status }) => {
    try {
      const query = status && status !== "all"
        ? "SELECT * FROM orch_feedback_requests WHERE status = ? ORDER BY created_at DESC"
        : "SELECT * FROM orch_feedback_requests ORDER BY created_at DESC";

      const requests = status && status !== "all"
        ? db.prepare(query).all(status)
        : db.prepare(query).all();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            requests: (requests as Array<Record<string, unknown>>).map(r => ({
              ...r,
              options: r.options ? JSON.parse(r.options as string) : null,
            })),
            count: requests.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// MODEL MANAGEMENT TOOLS (8 tools)
// =============================================================================

// 26. Add model
server.tool(
  "tarx_admin_model_add",
  "Add an external AI model (e.g., Claude API)",
  {
    name: z.string().describe("Display name for the model"),
    provider: z.string().describe("Provider name (e.g., anthropic, openai)"),
    api_endpoint: z.string().describe("API endpoint URL"),
    model_id: z.string().describe("Model ID (e.g., claude-sonnet-4-20250514)"),
    api_key: z.string().describe("API key (will be encrypted)"),
    capabilities: z.array(z.string()).optional().describe("Model capabilities"),
    cost_per_1k_tokens: z.number().optional().describe("Cost per 1K tokens"),
    max_tokens: z.number().optional().describe("Max tokens supported"),
  },
  async ({ name, provider, api_endpoint, model_id, api_key, capabilities, cost_per_1k_tokens, max_tokens }) => {
    try {
      const modelDbId = generateId();
      const { encrypted, hash } = encryptApiKey(api_key);

      db.prepare(`
        INSERT INTO orch_external_models (id, name, provider, api_endpoint, model_id, capabilities, cost_per_1k_tokens, max_tokens, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(modelDbId, name, provider, api_endpoint, model_id, JSON.stringify(capabilities || []), cost_per_1k_tokens || 0, max_tokens || 0, now(), now());

      db.prepare(`
        INSERT INTO orch_model_api_keys (id, model_id, encrypted_key, key_hash, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(generateId(), modelDbId, encrypted, hash, now());

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            added: true,
            model_id: modelDbId,
            name,
            provider,
            model_id_api: model_id,
            status: "active",
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 27. List models
server.tool(
  "tarx_admin_model_list",
  "List all configured external models",
  {
    include_disabled: z.boolean().optional().describe("Include disabled models"),
  },
  async ({ include_disabled = false }) => {
    try {
      const query = include_disabled
        ? "SELECT * FROM orch_external_models ORDER BY name"
        : "SELECT * FROM orch_external_models WHERE enabled = 1 ORDER BY name";

      const models = db.prepare(query).all() as Array<Record<string, unknown>>;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            models: models.map(m => ({
              ...m,
              capabilities: JSON.parse(m.capabilities as string || "[]"),
            })),
            count: models.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 28. Update model
server.tool(
  "tarx_admin_model_update",
  "Update model configuration",
  {
    model_id: z.string().describe("Model database ID"),
    updates: z.record(z.string(), z.unknown()).describe("Fields to update"),
  },
  async ({ model_id, updates }) => {
    try {
      const allowedFields = ["name", "api_endpoint", "model_id", "capabilities", "cost_per_1k_tokens", "max_tokens", "enabled"];
      const filteredUpdates: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          filteredUpdates[key] = key === "capabilities" ? JSON.stringify(value) : value;
        }
      }

      if (Object.keys(filteredUpdates).length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "No valid fields to update" }) }],
          isError: true,
        };
      }

      const sets = Object.keys(filteredUpdates).map(k => `${k} = ?`).join(", ");
      const values = [...Object.values(filteredUpdates), now(), model_id];

      db.prepare(`UPDATE orch_external_models SET ${sets}, updated_at = ? WHERE id = ?`).run(...values);

      const model = db.prepare("SELECT * FROM orch_external_models WHERE id = ?").get(model_id);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ updated: true, model }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 29. Delete model
server.tool(
  "tarx_admin_model_delete",
  "Delete an external model",
  {
    model_id: z.string().describe("Model database ID"),
    confirm: z.boolean().describe("Confirmation required"),
  },
  async ({ model_id, confirm }) => {
    try {
      if (!confirm) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Confirmation required: set confirm=true" }) }],
          isError: true,
        };
      }

      db.prepare("DELETE FROM orch_model_api_keys WHERE model_id = ?").run(model_id);
      db.prepare("DELETE FROM orch_external_models WHERE id = ?").run(model_id);

      return {
        content: [{ type: "text", text: JSON.stringify({ deleted: true, model_id }) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 30. Add routing rule
server.tool(
  "tarx_admin_routing_add",
  "Add a query routing rule",
  {
    name: z.string().describe("Rule name"),
    priority: z.number().describe("Priority (higher = evaluated first)"),
    condition: z.record(z.string(), z.unknown()).describe("Routing condition"),
    target_model_id: z.string().describe("Target model ID"),
    fallback_model_id: z.string().optional().describe("Fallback model ID"),
  },
  async ({ name, priority, condition, target_model_id, fallback_model_id }) => {
    try {
      const ruleId = generateId();

      db.prepare(`
        INSERT INTO orch_routing_rules (id, name, priority, condition, target_model_id, fallback_model_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(ruleId, name, priority, JSON.stringify(condition), target_model_id, fallback_model_id || null, now());

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ rule_id: ruleId, name, priority, active: true }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 31. List routing rules
server.tool(
  "tarx_admin_routing_list",
  "List all routing rules",
  {
    enabled_only: z.boolean().optional().describe("Only show enabled rules"),
  },
  async ({ enabled_only = true }) => {
    try {
      const query = enabled_only
        ? "SELECT r.*, m1.name as target_model_name, m2.name as fallback_model_name FROM orch_routing_rules r LEFT JOIN external_models m1 ON r.target_model_id = m1.id LEFT JOIN external_models m2 ON r.fallback_model_id = m2.id WHERE r.enabled = 1 ORDER BY r.priority DESC"
        : "SELECT r.*, m1.name as target_model_name, m2.name as fallback_model_name FROM orch_routing_rules r LEFT JOIN external_models m1 ON r.target_model_id = m1.id LEFT JOIN external_models m2 ON r.fallback_model_id = m2.id ORDER BY r.priority DESC";

      const rules = db.prepare(query).all() as Array<Record<string, unknown>>;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            rules: rules.map(r => ({
              ...r,
              condition: JSON.parse(r.condition as string),
            })),
            count: rules.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 32. Model usage stats
server.tool(
  "tarx_admin_model_usage",
  "Get model usage statistics",
  {
    model_id: z.string().optional().describe("Filter by model ID"),
    time_range: z.object({
      start: z.number().optional(),
      end: z.number().optional(),
    }).optional().describe("Time range filter"),
  },
  async ({ model_id, time_range }) => {
    try {
      let query = "SELECT * FROM orch_model_usage WHERE 1=1";
      const params: unknown[] = [];

      if (model_id) {
        query += " AND model_id = ?";
        params.push(model_id);
      }
      if (time_range?.start) {
        query += " AND timestamp >= ?";
        params.push(time_range.start);
      }
      if (time_range?.end) {
        query += " AND timestamp <= ?";
        params.push(time_range.end);
      }

      query += " ORDER BY timestamp DESC LIMIT 1000";

      const usage = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

      const stats = {
        total_queries: usage.length,
        total_tokens: usage.reduce((sum, u) => sum + ((u.tokens_used as number) || 0), 0),
        total_cost: usage.reduce((sum, u) => sum + ((u.cost as number) || 0), 0),
        avg_latency_ms: usage.length > 0 ? usage.reduce((sum, u) => sum + ((u.latency_ms as number) || 0), 0) / usage.length : 0,
        success_rate: usage.length > 0 ? usage.filter(u => u.success).length / usage.length : 0,
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ stats, recent_usage: usage.slice(0, 20) }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// 33. Test model
server.tool(
  "tarx_admin_model_test",
  "Test model API connection",
  {
    model_id: z.string().describe("Model database ID"),
    test_query: z.string().optional().describe("Test query (default: 'Hello')"),
  },
  async ({ model_id, test_query = "Hello" }) => {
    try {
      const model = db.prepare("SELECT * FROM orch_external_models WHERE id = ?").get(model_id) as Record<string, unknown> | undefined;
      const keyData = db.prepare("SELECT encrypted_key FROM orch_model_api_keys WHERE model_id = ?").get(model_id) as { encrypted_key: string } | undefined;

      if (!model || !keyData) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Model not found" }) }],
          isError: true,
        };
      }

      const apiKey = decryptApiKey(keyData.encrypted_key);
      const startTime = now();

      // Build request based on provider
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      let body: Record<string, unknown>;

      if (model.provider === "anthropic") {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
        body = {
          model: model.model_id,
          max_tokens: 50,
          messages: [{ role: "user", content: test_query }],
        };
      } else if (model.provider === "openai") {
        headers["Authorization"] = `Bearer ${apiKey}`;
        body = {
          model: model.model_id,
          max_tokens: 50,
          messages: [{ role: "user", content: test_query }],
        };
      } else {
        headers["Authorization"] = `Bearer ${apiKey}`;
        body = {
          model: model.model_id,
          max_tokens: 50,
          messages: [{ role: "user", content: test_query }],
        };
      }

      const response = await fetch(model.api_endpoint as string, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const latency = now() - startTime;
      const data = await response.json() as Record<string, unknown>;

      // Log usage
      const usageId = generateId();
      db.prepare(`
        INSERT INTO orch_model_usage (id, model_id, tokens_used, latency_ms, success, error_message, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(usageId, model_id, 0, latency, response.ok ? 1 : 0, response.ok ? null : JSON.stringify(data), now());

      // Update last used
      db.prepare("UPDATE orch_model_api_keys SET last_used_at = ? WHERE model_id = ?").run(now(), model_id);

      let responseText = "";
      if (model.provider === "anthropic" && data.content) {
        responseText = ((data.content as Array<{ text: string }>)[0])?.text || "";
      } else if (data.choices) {
        responseText = ((data.choices as Array<{ message: { content: string } }>)[0])?.message?.content || "";
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: response.ok,
            latency_ms: latency,
            status: response.status,
            response: responseText || JSON.stringify(data).slice(0, 500),
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// STATUS REPORT TOOL (1 tool)
// =============================================================================

// 34. Status report
server.tool(
  "tarx_orchestrate_status_report",
  "Generate comprehensive orchestration status report",
  {
    include_all: z.boolean().optional().describe("Include completed items"),
  },
  async ({ include_all = false }) => {
    try {
      // Sessions
      const sessions = db.prepare("SELECT * FROM orch_sessions ORDER BY last_activity DESC").all() as Array<Record<string, unknown>>;
      const activeSessions = sessions.filter(s => s.status === "active");

      // Milestones
      const milestones = db.prepare("SELECT * FROM orch_milestones ORDER BY target_date ASC").all() as Array<Record<string, unknown>>;

      // Tasks
      const taskQuery = include_all
        ? "SELECT t.*, s.name as session_name FROM orch_tasks t JOIN orch_sessions s ON t.session_id = s.id ORDER BY t.priority DESC"
        : "SELECT t.*, s.name as session_name FROM orch_tasks t JOIN orch_sessions s ON t.session_id = s.id WHERE t.status != 'completed' ORDER BY t.priority DESC";
      const tasks = db.prepare(taskQuery).all() as Array<Record<string, unknown>>;

      // Pending feedback
      const feedback = db.prepare("SELECT * FROM orch_feedback_requests WHERE status = 'pending' ORDER BY urgency DESC").all() as Array<Record<string, unknown>>;

      // Blockers
      const blockers = db.prepare("SELECT b.*, s.name as session_name FROM orch_blockers b JOIN orch_sessions s ON b.session_id = s.id WHERE b.status = 'active' ORDER BY b.severity DESC").all() as Array<Record<string, unknown>>;

      // Calculate progress
      const allTasks = db.prepare("SELECT status FROM orch_tasks").all() as Array<{ status: string }>;
      const completedTasks = allTasks.filter(t => t.status === "completed").length;
      const overallProgress = allTasks.length > 0 ? Math.round((completedTasks / allTasks.length) * 100) : 0;

      // Model stats
      const modelStats = db.prepare(`
        SELECT
          COUNT(*) as total_queries,
          SUM(cost) as total_cost,
          AVG(latency_ms) as avg_latency
        FROM orch_model_usage
        WHERE timestamp > ?
      `).get(now() - 24 * 60 * 60 * 1000) as Record<string, unknown>;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            generatedAt: new Date().toISOString(),
            overallProgress,
            summary: {
              activeSessions: activeSessions.length,
              totalSessions: sessions.length,
              totalTasks: allTasks.length,
              completedTasks,
              pendingFeedback: feedback.length,
              activeBlockers: blockers.length,
            },
            sessions: activeSessions.map(s => ({
              id: s.id,
              name: s.name,
              currentTask: s.current_task,
              lastActivity: new Date(s.last_activity as number).toISOString(),
            })),
            milestones: milestones.map(m => ({
              id: m.id,
              name: m.name,
              progress: m.progress,
              status: m.status,
            })),
            tasks: tasks.slice(0, 20),
            pendingFeedback: feedback,
            activeBlockers: blockers,
            userInputNeeded: feedback.length > 0 || blockers.some(b => b.needs_user_input),
            modelStats: {
              totalQueries: modelStats.total_queries || 0,
              totalCost: modelStats.total_cost || 0,
              avgLatency: Math.round((modelStats.avg_latency as number) || 0),
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TARX Orchestration MCP Server v2.0.0 started");
  console.error("  - 34 tools available");
  console.error(`  - Database: ${DB_PATH}`);
  console.error(`  - Creator auth: ${CREATOR_KEY ? "ENABLED" : "DISABLED (set TARX_CREATOR_KEY to enable)"}`);
  console.error(`  - Audit log: ${AUDIT_LOG_PATH}`);
}

main().catch(console.error);
