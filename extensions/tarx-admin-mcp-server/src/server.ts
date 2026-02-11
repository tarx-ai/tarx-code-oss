#!/usr/bin/env node
/**
 * TARX Admin MCP Server
 *
 * Developer/Admin tools for TARX infrastructure monitoring.
 * NOT shipped to users - for internal use only.
 *
 * Required environment variables:
 * - SENTRY_AUTH_TOKEN: Sentry API token with project:read and event:read scopes
 * - SENTRY_ORG: Sentry organization slug (default: tarx-fo)
 *
 * Available projects:
 * - node: Extension host errors (spawn ENOENT, Channel closed, Canceled, etc.)
 * - workbench: VS Code workbench errors
 * - mesh: Infrastructure/networking errors
 *
 * Note: The events endpoint works with basic tokens; issues endpoint requires
 * additional permissions. Use tarx_admin_sentry_events for error investigation.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as SessionManager from "./session-manager.js";
import * as Tether from "./tether.js";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as os from "os";

import * as fs from "fs";

// Configuration from environment
const SENTRY_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG || "tarx-fo";
const SENTRY_API_BASE = "https://sentry.io/api/0";
const CREATOR_KEY = process.env.TARX_CREATOR_KEY;

// All known projects in the org
const ALL_PROJECTS = ["mesh", "node", "workbench"];

if (!SENTRY_TOKEN) {
  console.error("ERROR: SENTRY_AUTH_TOKEN environment variable required");
  console.error("This is an admin-only MCP server. Configure it with your Sentry token.");
  process.exit(1);
}

// =============================================================================
// SECURITY: creator_only middleware + audit logging
// =============================================================================

const AUDIT_LOG_PATH = path.join(os.homedir(), "Library/Application Support/tarx/audit.jsonl");

/**
 * Append an audit log entry for every MCP tool call.
 */
function auditLog(toolName: string, params: unknown, result: { isError?: boolean } | null): void {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
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

/**
 * creator_only middleware wrapper.
 * When TARX_CREATOR_KEY is set, all admin tool calls are gated.
 * V1: Presence check only (key must be set in env).
 * Future: Compare against a stored hash or verify a signed token.
 */
type ToolHandler<T> = (params: T) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function creator_only<T>(toolName: string, handler: ToolHandler<T>): ToolHandler<T> {
  return async (params: T) => {
    // Gate: if TARX_CREATOR_KEY is not set, refuse admin tool calls
    if (!CREATOR_KEY) {
      const result = {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: "Admin tools require creator authentication. Set TARX_CREATOR_KEY environment variable.",
            tool: toolName,
          }),
        }],
        isError: true as const,
      };
      auditLog(toolName, params, result);
      return result;
    }

    // Execute the actual handler
    const result = await handler(params);
    auditLog(toolName, params, result);
    return result;
  };
}

// =============================================================================
// SENTRY CLIENT
// =============================================================================

interface SentryProject {
  id: string;
  slug: string;
  name: string;
  platform: string;
  dateCreated: string;
}

interface SentryEvent {
  eventID: string;
  title: string;
  message?: string;
  level: string;
  platform: string;
  dateCreated: string;
  dateReceived: string;
  user?: { id?: string; email?: string; username?: string };
  tags: Array<{ key: string; value: string }>;
  context?: Record<string, unknown>;
  entries?: Array<{ type: string; data: unknown }>;
  project?: string;
}

interface SentryBreadcrumb {
  type: string;
  category: string;
  message?: string;
  data?: Record<string, unknown>;
  level: string;
  timestamp: string;
}

interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  level: string;
  status: string;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  project?: { slug: string; name: string };
}

async function sentryFetch<T>(endpoint: string): Promise<T> {
  const url = `${SENTRY_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${SENTRY_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sentry API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

// List all projects in the org
async function listProjects(): Promise<SentryProject[]> {
  return sentryFetch<SentryProject[]>(`/organizations/${SENTRY_ORG}/projects/`);
}

// Get events from a specific project
async function getProjectEvents(project: string, minutes: number = 60): Promise<SentryEvent[]> {
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const events = await sentryFetch<SentryEvent[]>(
    `/projects/${SENTRY_ORG}/${project}/events/?query=timestamp:>${since}&limit=50`
  );
  return events.map(e => ({ ...e, project }));
}

// Get events from ALL projects
async function getAllProjectsEvents(minutes: number = 60): Promise<SentryEvent[]> {
  const allEvents: SentryEvent[] = [];
  for (const project of ALL_PROJECTS) {
    try {
      const events = await getProjectEvents(project, minutes);
      allEvents.push(...events);
    } catch (e) {
      // Skip projects that fail
      console.error(`Failed to fetch events from ${project}:`, e);
    }
  }
  // Sort by date descending
  return allEvents.sort((a, b) =>
    new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()
  );
}

// Get issues from a specific project
async function getProjectIssues(project: string, status: string = "unresolved"): Promise<SentryIssue[]> {
  const issues = await sentryFetch<SentryIssue[]>(
    `/projects/${SENTRY_ORG}/${project}/issues/?query=is:${status}&limit=25`
  );
  return issues.map(i => ({ ...i, project: { slug: project, name: project } }));
}

// Get issues from ALL projects (iterate over each project)
async function getAllProjectsIssues(status: string = "unresolved"): Promise<SentryIssue[]> {
  const allIssues: SentryIssue[] = [];
  for (const project of ALL_PROJECTS) {
    try {
      const issues = await getProjectIssues(project, status);
      allIssues.push(...issues);
    } catch (e) {
      // Skip projects that fail
      console.error(`Failed to fetch issues from ${project}:`, e);
    }
  }
  // Sort by lastSeen descending
  return allIssues.sort((a, b) =>
    new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
  );
}

async function getSentryEventDetails(project: string, eventId: string): Promise<SentryEvent> {
  return sentryFetch<SentryEvent>(
    `/projects/${SENTRY_ORG}/${project}/events/${eventId}/`
  );
}

async function searchProjectEvents(project: string, query: string): Promise<SentryEvent[]> {
  const events = await sentryFetch<SentryEvent[]>(
    `/projects/${SENTRY_ORG}/${project}/events/?query=${encodeURIComponent(query)}&limit=25`
  );
  return events.map(e => ({ ...e, project }));
}

async function getSentryIssueEvents(issueId: string): Promise<SentryEvent[]> {
  return sentryFetch<SentryEvent[]>(`/issues/${issueId}/events/?limit=25`);
}

function extractBreadcrumbs(event: SentryEvent): SentryBreadcrumb[] {
  const entry = event.entries?.find((e) => e.type === "breadcrumbs");
  if (!entry) return [];
  const data = entry.data as { values?: SentryBreadcrumb[] };
  return data.values || [];
}

function extractUserActions(breadcrumbs: SentryBreadcrumb[]): SentryBreadcrumb[] {
  return breadcrumbs.filter(
    (b) =>
      b.category === "ui.click" ||
      b.category === "ui.input" ||
      b.category === "navigation" ||
      b.type === "user"
  );
}

function buildSessionTrace(breadcrumbs: SentryBreadcrumb[]): string[] {
  return breadcrumbs.map((b) => {
    const time = new Date(b.timestamp).toISOString().split("T")[1].split(".")[0];
    const msg = b.message || (b.data as Record<string, string>)?.message || b.category;
    return `[${time}] ${b.category}: ${msg}`;
  });
}

// =============================================================================
// MCP SERVER
// =============================================================================

const server = new McpServer({
  name: "tarx-admin",
  version: "2.2.0",
});

// Auto-wrap ALL tool handlers with creator_only + audit logging.
// This intercepts server.tool() so every registration is gated automatically.
const _originalTool = server.tool.bind(server);
// @ts-expect-error - overloaded method, runtime-safe
server.tool = function (name: string, ...rest: unknown[]) {
  const handler = rest[rest.length - 1] as ToolHandler<unknown>;
  rest[rest.length - 1] = creator_only(name, handler);
  return (_originalTool as Function).call(server, name, ...rest);
};

// Tool: List all Sentry projects
server.tool(
  "tarx_admin_sentry_projects",
  "List all Sentry projects in the organization",
  {},
  async () => {
    try {
      const projects = await listProjects();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            org: SENTRY_ORG,
            projects: projects.map(p => ({
              slug: p.slug,
              name: p.name,
              platform: p.platform,
              dateCreated: p.dateCreated,
            })),
            count: projects.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to list projects",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Get recent Sentry events (supports all projects)
// This is the PRIMARY tool for error investigation - the issues endpoint requires elevated permissions
server.tool(
  "tarx_admin_sentry_events",
  "Get recent Sentry events. Use project='node' for extension errors (spawn ENOENT, Channel closed, Canceled). Use 'all' to query all projects.",
  {
    project: z.string().optional().describe("Project: 'node' (extension errors), 'workbench', 'mesh', or 'all'. Default: node"),
    minutes: z.number().optional().describe("Look back N minutes (default: 60)"),
  },
  async ({ project = "node", minutes = 60 }) => {
    try {
      let events: SentryEvent[];

      if (project === "all") {
        events = await getAllProjectsEvents(minutes);
      } else {
        events = await getProjectEvents(project, minutes);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            events: events.map((e) => ({
              eventID: e.eventID,
              title: e.title,
              level: e.level,
              dateCreated: e.dateCreated,
              platform: e.platform,
              project: e.project,
              user: e.user,
            })),
            count: events.length,
            lookback_minutes: minutes,
            org: SENTRY_ORG,
            project: project,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to fetch events",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Get Sentry issues (supports all projects)
server.tool(
  "tarx_admin_sentry_issues",
  "Get current Sentry issues. Use project='all' to query all projects.",
  {
    project: z.string().optional().describe("Project slug (mesh, node, workbench) or 'all' for all projects. Default: all"),
    status: z.enum(["unresolved", "resolved", "ignored"]).optional()
      .describe("Issue status filter (default: unresolved)"),
  },
  async ({ project = "all", status = "unresolved" }) => {
    try {
      let issues: SentryIssue[];

      if (project === "all") {
        issues = await getAllProjectsIssues(status);
      } else {
        issues = await getProjectIssues(project, status);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            issues: issues.map((i) => ({
              id: i.id,
              shortId: i.shortId,
              title: i.title,
              culprit: i.culprit,
              level: i.level,
              status: i.status,
              count: i.count,
              userCount: i.userCount,
              firstSeen: i.firstSeen,
              lastSeen: i.lastSeen,
              project: i.project?.slug || project,
            })),
            count: issues.length,
            filter: status,
            org: SENTRY_ORG,
            project: project,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to fetch issues",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Search Sentry events
server.tool(
  "tarx_admin_sentry_search",
  "Search Sentry events with query",
  {
    query: z.string().describe("Sentry search query (e.g., 'level:error', 'user.email:test@example.com')"),
    project: z.string().optional().describe("Project slug (mesh, node, workbench). Default: node"),
  },
  async ({ query, project = "node" }) => {
    try {
      const events = await searchProjectEvents(project, query);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query,
            project,
            events: events.map((e) => ({
              eventID: e.eventID,
              title: e.title,
              level: e.level,
              dateCreated: e.dateCreated,
              platform: e.platform,
            })),
            count: events.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Search failed",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Get event details with breadcrumbs
server.tool(
  "tarx_admin_sentry_event_details",
  "Get full event details including breadcrumbs",
  {
    eventId: z.string().describe("Sentry event ID"),
    project: z.string().optional().describe("Project slug (mesh, node, workbench). Default: node"),
  },
  async ({ eventId, project = "node" }) => {
    try {
      const event = await getSentryEventDetails(project, eventId);
      const breadcrumbs = extractBreadcrumbs(event);
      const userActions = extractUserActions(breadcrumbs);
      const trace = buildSessionTrace(breadcrumbs);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            eventId,
            project,
            title: event.title,
            level: event.level,
            message: event.message,
            dateCreated: event.dateCreated,
            platform: event.platform,
            user: event.user,
            tags: event.tags,
            context: event.context,
            breadcrumbCount: breadcrumbs.length,
            userActionCount: userActions.length,
            sessionTrace: trace,
            userActions: userActions.map((a) => ({
              category: a.category,
              message: a.message,
              timestamp: a.timestamp,
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to fetch event details",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Get events for an issue
server.tool(
  "tarx_admin_sentry_issue_events",
  "Get events for a specific issue",
  {
    issueId: z.string().describe("Sentry issue ID"),
  },
  async ({ issueId }) => {
    try {
      const events = await getSentryIssueEvents(issueId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            issueId,
            events: events.map((e) => ({
              eventID: e.eventID,
              title: e.title,
              level: e.level,
              dateCreated: e.dateCreated,
              user: e.user,
            })),
            count: events.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to fetch issue events",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Session trace reconstruction
server.tool(
  "tarx_admin_sentry_trace",
  "Reconstruct user session trace leading to an event",
  {
    eventId: z.string().describe("Sentry event ID to trace"),
    project: z.string().optional().describe("Project slug (mesh, node, workbench). Default: node"),
  },
  async ({ eventId, project = "node" }) => {
    try {
      const event = await getSentryEventDetails(project, eventId);
      const breadcrumbs = extractBreadcrumbs(event);
      const userActions = extractUserActions(breadcrumbs);
      const trace = buildSessionTrace(breadcrumbs);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            eventId,
            project,
            eventTitle: event.title,
            eventLevel: event.level,
            eventTime: event.dateCreated,
            reconstruction: {
              startTime: breadcrumbs[0]?.timestamp,
              endTime: breadcrumbs[breadcrumbs.length - 1]?.timestamp,
              totalBreadcrumbs: breadcrumbs.length,
              totalUserActions: userActions.length,
            },
            sessionTrace: trace,
            userActionsSummary: userActions.map(
              (a) => `${a.category}: ${a.message || "action"}`
            ),
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to build trace",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Admin status
server.tool(
  "tarx_admin_status",
  "Get admin MCP server status and configuration",
  {},
  async () => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          server: "tarx-admin-mcp",
          version: "2.2.0",
          sentry: {
            org: SENTRY_ORG,
            projects: ALL_PROJECTS,
            configured: !!SENTRY_TOKEN,
          },
          tools: {
            sentry: [
              "tarx_admin_sentry_projects",
              "tarx_admin_sentry_events",
              "tarx_admin_sentry_issues",
              "tarx_admin_sentry_search",
              "tarx_admin_sentry_event_details",
              "tarx_admin_sentry_issue_events",
              "tarx_admin_sentry_trace",
            ],
            sessions: [
              "tarx_admin_session_create",
              "tarx_admin_session_assign_task",
              "tarx_admin_session_get_progress",
              "tarx_admin_session_mark_complete",
              "tarx_admin_session_list_all",
            ],
            claudeCode: [
              "tarx_admin_start_code_session",
              "tarx_admin_list_code_sessions",
              "tarx_admin_get_session_output",
              "tarx_admin_send_to_session",
              "tarx_admin_stop_code_session",
              "tarx_admin_clear_code_sessions",
            ],
            tether: [
              "tarx_dispatch_work",
              "tarx_check_work",
              "tarx_work_history",
            ],
            files: [
              "tarx_admin_file_lock",
              "tarx_admin_file_unlock",
              "tarx_admin_file_conflicts",
            ],
            handoffs: [
              "tarx_admin_dependency_set",
              "tarx_admin_handoff_create",
              "tarx_admin_handoff_accept",
              "tarx_admin_milestone_track",
            ],
            monitoring: [
              "tarx_admin_dashboard",
              "tarx_admin_session_log",
              "tarx_admin_performance_metrics",
            ],
          },
          note: "Use project='all' to query all projects, or specify: mesh, node, workbench",
        }, null, 2),
      }],
    };
  }
);

// =============================================================================
// SESSION MANAGEMENT TOOLS
// =============================================================================

// Tool: Create a new session
server.tool(
  "tarx_admin_session_create",
  "Create a new Claude Code session for orchestration. Returns session ID for tracking.",
  {
    name: z.string().describe("Human-readable session name (e.g., 'frontend-fixes', 'api-refactor')"),
    workingDirectory: z.string().describe("The working directory for this session"),
    metadata: z.record(z.unknown()).optional().describe("Optional metadata (e.g., { owner: 'team-a', priority: 'high' })"),
  },
  async ({ name, workingDirectory, metadata = {} }) => {
    try {
      const session = SessionManager.createSession(name, workingDirectory, metadata);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            session: {
              id: session.id,
              name: session.name,
              status: session.status,
              workingDirectory: session.workingDirectory,
              createdAt: new Date(session.createdAt).toISOString(),
            },
            message: `Session "${name}" created with ID: ${session.id}`,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to create session",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Assign task to session
server.tool(
  "tarx_admin_session_assign_task",
  "Assign a task to a session. Supports priority and dependency tracking.",
  {
    sessionId: z.string().describe("The session ID to assign the task to"),
    description: z.string().describe("Task description"),
    priority: z.number().optional().describe("Task priority (higher = more urgent, default: 0)"),
    dependencies: z.array(z.string()).optional().describe("Array of task IDs this task depends on"),
  },
  async ({ sessionId, description, priority = 0, dependencies = [] }) => {
    try {
      const session = SessionManager.getSession(sessionId);
      if (!session) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Session ${sessionId} not found` }),
          }],
          isError: true,
        };
      }

      const task = SessionManager.assignTask(sessionId, description, priority, dependencies);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            task: {
              id: task.id,
              sessionId: task.sessionId,
              description: task.description,
              status: task.status,
              priority: task.priority,
              dependencies: task.dependencies,
            },
            message: `Task assigned to session "${session.name}"`,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to assign task",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Get session progress
server.tool(
  "tarx_admin_session_get_progress",
  "Get detailed progress for a session including all tasks and their status.",
  {
    sessionId: z.string().describe("The session ID to check"),
  },
  async ({ sessionId }) => {
    try {
      const session = SessionManager.getSession(sessionId);
      if (!session) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Session ${sessionId} not found` }),
          }],
          isError: true,
        };
      }

      const progress = SessionManager.getTaskProgress(sessionId);
      const locks = SessionManager.getSessionLocks(sessionId);
      const deps = SessionManager.getSessionDependencies(sessionId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            session: {
              id: session.id,
              name: session.name,
              status: session.status,
              currentTask: session.currentTask,
              lastActivity: new Date(session.lastActivityAt).toISOString(),
            },
            progress: progress.summary,
            tasks: progress.tasks.map(t => ({
              id: t.id,
              description: t.description,
              status: t.status,
              priority: t.priority,
            })),
            locks: locks.map(l => ({
              file: l.filePath,
              type: l.lockType,
              reason: l.reason,
            })),
            dependencies: {
              waiting: deps.waiting.length,
              providing: deps.providing.length,
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get progress",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Mark task complete
server.tool(
  "tarx_admin_session_mark_complete",
  "Mark a task as completed. Automatically satisfies dependencies waiting on this task.",
  {
    taskId: z.string().describe("The task ID to mark complete"),
    result: z.string().optional().describe("Optional result or summary of the completed task"),
  },
  async ({ taskId, result }) => {
    try {
      const success = SessionManager.markTaskComplete(taskId, result);
      if (!success) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Task ${taskId} not found or already completed` }),
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            taskId,
            message: "Task marked as completed",
            note: "Any dependencies waiting on this task have been satisfied",
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to mark task complete",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: List all sessions
server.tool(
  "tarx_admin_session_list_all",
  "List all sessions with optional status filter.",
  {
    status: z.enum(["active", "idle", "blocked", "completed"]).optional()
      .describe("Filter by status (default: all)"),
  },
  async ({ status }) => {
    try {
      const sessions = SessionManager.listSessions(status);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sessions: sessions.map(s => ({
              id: s.id,
              name: s.name,
              status: s.status,
              currentTask: s.currentTask,
              lastActivity: new Date(s.lastActivityAt).toISOString(),
            })),
            count: sessions.length,
            filter: status || "all",
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to list sessions",
          }),
        }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// FILE COORDINATION TOOLS
// =============================================================================

// Tool: Acquire file lock
server.tool(
  "tarx_admin_file_lock",
  "Acquire a lock on a file to prevent conflicts between sessions.",
  {
    sessionId: z.string().describe("The session requesting the lock"),
    filePath: z.string().describe("Absolute path to the file"),
    lockType: z.enum(["exclusive", "shared"]).optional()
      .describe("Lock type: 'exclusive' for writes, 'shared' for reads (default: exclusive)"),
    reason: z.string().optional().describe("Reason for the lock"),
    ttlMs: z.number().optional().describe("Lock TTL in milliseconds (optional, prevents stale locks)"),
  },
  async ({ sessionId, filePath, lockType = "exclusive", reason, ttlMs }) => {
    try {
      const result = SessionManager.acquireFileLock(sessionId, filePath, lockType, reason, ttlMs);

      if (result.success && result.lock) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              lock: {
                id: result.lock.id,
                filePath: result.lock.filePath,
                lockType: result.lock.lockType,
                acquiredAt: new Date(result.lock.acquiredAt).toISOString(),
                expiresAt: result.lock.expiresAt ? new Date(result.lock.expiresAt).toISOString() : null,
              },
              message: `Lock acquired on ${filePath}`,
            }, null, 2),
          }],
        };
      } else {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              conflict: result.conflict ? {
                heldBy: result.conflict.sessionId,
                lockType: result.conflict.lockType,
                reason: result.conflict.reason,
                acquiredAt: new Date(result.conflict.acquiredAt).toISOString(),
              } : null,
              message: `File ${filePath} is already locked by another session`,
            }, null, 2),
          }],
        };
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to acquire lock",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Release file lock
server.tool(
  "tarx_admin_file_unlock",
  "Release a lock on a file.",
  {
    sessionId: z.string().describe("The session releasing the lock"),
    filePath: z.string().describe("Absolute path to the file"),
  },
  async ({ sessionId, filePath }) => {
    try {
      const success = SessionManager.releaseFileLock(sessionId, filePath);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success,
            filePath,
            message: success ? `Lock released on ${filePath}` : `No lock found for ${filePath}`,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to release lock",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Get file conflicts
server.tool(
  "tarx_admin_file_conflicts",
  "Get all current file locks and identify potential conflicts.",
  {},
  async () => {
    try {
      const result = SessionManager.getFileConflicts();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            locks: result.locks.map(l => ({
              file: l.filePath,
              session: l.sessionId,
              type: l.lockType,
              reason: l.reason,
              acquiredAt: new Date(l.acquiredAt).toISOString(),
            })),
            conflicts: result.conflicts,
            summary: {
              totalLocks: result.locks.length,
              conflictCount: result.conflicts.length,
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get conflicts",
          }),
        }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// HANDOFF TOOLS
// =============================================================================

// Tool: Set dependency
server.tool(
  "tarx_admin_dependency_set",
  "Declare that one session is waiting on another session's work.",
  {
    fromSessionId: z.string().describe("The session that is waiting"),
    toSessionId: z.string().describe("The session being waited on"),
    description: z.string().describe("What is being waited for"),
    taskId: z.string().optional().describe("Specific task ID to wait for (optional)"),
  },
  async ({ fromSessionId, toSessionId, description, taskId }) => {
    try {
      const fromSession = SessionManager.getSession(fromSessionId);
      const toSession = SessionManager.getSession(toSessionId);

      if (!fromSession) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Session ${fromSessionId} not found` }),
          }],
          isError: true,
        };
      }
      if (!toSession) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Session ${toSessionId} not found` }),
          }],
          isError: true,
        };
      }

      const dependency = SessionManager.setDependency(fromSessionId, toSessionId, description, taskId);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            dependency: {
              id: dependency.id,
              from: { id: fromSessionId, name: fromSession.name },
              to: { id: toSessionId, name: toSession.name },
              description,
              taskId: taskId || null,
              status: dependency.status,
            },
            message: `Dependency set: "${fromSession.name}" waiting on "${toSession.name}"`,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to set dependency",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Create handoff
server.tool(
  "tarx_admin_handoff_create",
  "Create a handoff to pass work from one session to another.",
  {
    fromSessionId: z.string().describe("The session handing off work"),
    toSessionId: z.string().describe("The session receiving the work"),
    taskDescription: z.string().describe("Description of the task being handed off"),
    context: z.string().describe("Relevant context, notes, or state for the receiving session"),
  },
  async ({ fromSessionId, toSessionId, taskDescription, context }) => {
    try {
      const fromSession = SessionManager.getSession(fromSessionId);
      const toSession = SessionManager.getSession(toSessionId);

      if (!fromSession) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Session ${fromSessionId} not found` }),
          }],
          isError: true,
        };
      }
      if (!toSession) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Session ${toSessionId} not found` }),
          }],
          isError: true,
        };
      }

      const handoff = SessionManager.createHandoff(fromSessionId, toSessionId, taskDescription, context);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            handoff: {
              id: handoff.id,
              from: { id: fromSessionId, name: fromSession.name },
              to: { id: toSessionId, name: toSession.name },
              task: taskDescription,
              status: handoff.status,
              createdAt: new Date(handoff.createdAt).toISOString(),
            },
            message: `Handoff created from "${fromSession.name}" to "${toSession.name}"`,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to create handoff",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Accept handoff
server.tool(
  "tarx_admin_handoff_accept",
  "Accept a pending handoff and get the context.",
  {
    handoffId: z.string().describe("The handoff ID to accept"),
    sessionId: z.string().describe("The receiving session ID"),
  },
  async ({ handoffId, sessionId }) => {
    try {
      const session = SessionManager.getSession(sessionId);
      if (!session) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Session ${sessionId} not found` }),
          }],
          isError: true,
        };
      }

      // Get pending handoffs to find the context
      const pendingHandoffs = SessionManager.getPendingHandoffs(sessionId);
      const handoff = pendingHandoffs.find(h => h.id === handoffId);

      if (!handoff) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Handoff ${handoffId} not found or not pending for this session`,
            }),
          }],
          isError: true,
        };
      }

      const success = SessionManager.acceptHandoff(handoffId, sessionId);
      if (!success) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: "Failed to accept handoff" }),
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            handoff: {
              id: handoffId,
              task: handoff.taskDescription,
              context: handoff.context,
              fromSession: handoff.fromSessionId,
            },
            message: "Handoff accepted. Context provided above.",
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to accept handoff",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Track milestone
server.tool(
  "tarx_admin_milestone_track",
  "Create or update a milestone to track cross-session progress.",
  {
    action: z.enum(["create", "update", "list"]).describe("Action to perform"),
    name: z.string().optional().describe("Milestone name (required for create)"),
    description: z.string().optional().describe("Milestone description (required for create)"),
    requiredTasks: z.array(z.string()).optional().describe("Task IDs required for this milestone"),
    milestoneId: z.string().optional().describe("Milestone ID (required for update)"),
  },
  async ({ action, name, description, requiredTasks, milestoneId }) => {
    try {
      if (action === "create") {
        if (!name || !description) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ error: "Name and description required for create" }),
            }],
            isError: true,
          };
        }
        const milestone = SessionManager.createMilestone(name, description, requiredTasks || []);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              milestone: {
                id: milestone.id,
                name: milestone.name,
                description: milestone.description,
                requiredTasks: milestone.requiredTasks,
                progress: `${Math.round(milestone.progress * 100)}%`,
                status: milestone.status,
              },
            }, null, 2),
          }],
        };
      }

      if (action === "update") {
        if (!milestoneId) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ error: "milestoneId required for update" }),
            }],
            isError: true,
          };
        }
        const milestone = SessionManager.updateMilestoneProgress(milestoneId);
        if (!milestone) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ error: `Milestone ${milestoneId} not found` }),
            }],
            isError: true,
          };
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              milestone: {
                id: milestone.id,
                name: milestone.name,
                progress: `${Math.round(milestone.progress * 100)}%`,
                status: milestone.status,
                completedAt: milestone.completedAt ? new Date(milestone.completedAt).toISOString() : null,
              },
            }, null, 2),
          }],
        };
      }

      if (action === "list") {
        const milestones = SessionManager.getMilestones();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              milestones: milestones.map(m => ({
                id: m.id,
                name: m.name,
                progress: `${Math.round(m.progress * 100)}%`,
                status: m.status,
              })),
              count: milestones.length,
            }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "Invalid action" }),
        }],
        isError: true,
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to track milestone",
          }),
        }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// MONITORING TOOLS
// =============================================================================

// Tool: Dashboard
server.tool(
  "tarx_admin_dashboard",
  "Get a comprehensive dashboard of all session orchestration status.",
  {},
  async () => {
    try {
      const dashboard = SessionManager.getDashboard();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            overview: {
              sessions: dashboard.sessions,
              tasks: dashboard.tasks,
              locks: dashboard.locks,
              handoffs: dashboard.handoffs,
            },
            recentActivity: dashboard.recentActivity.slice(0, 10).map(a => ({
              session: a.sessionId,
              action: a.action,
              details: a.details,
              time: new Date(a.timestamp).toISOString(),
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get dashboard",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Session log
server.tool(
  "tarx_admin_session_log",
  "Get activity log for a specific session.",
  {
    sessionId: z.string().describe("The session ID"),
    limit: z.number().optional().describe("Max entries to return (default: 50)"),
  },
  async ({ sessionId, limit = 50 }) => {
    try {
      const session = SessionManager.getSession(sessionId);
      if (!session) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Session ${sessionId} not found` }),
          }],
          isError: true,
        };
      }

      const log = SessionManager.getSessionLog(sessionId, limit);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            session: {
              id: session.id,
              name: session.name,
              status: session.status,
            },
            log: log.map(entry => ({
              action: entry.action,
              details: entry.details,
              time: new Date(entry.timestamp).toISOString(),
            })),
            count: log.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get session log",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Performance metrics
server.tool(
  "tarx_admin_performance_metrics",
  "Get performance metrics for session orchestration.",
  {},
  async () => {
    try {
      const metrics = SessionManager.getPerformanceMetrics();

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            last24Hours: {
              sessionsCreated: metrics.sessionsCreatedLast24h,
              tasksCompleted: metrics.tasksCompletedLast24h,
              locksAcquired: metrics.locksAcquiredLast24h,
              handoffsCompleted: metrics.handoffsCompletedLast24h,
            },
            averages: {
              taskDurationMs: Math.round(metrics.avgTaskDurationMs),
              taskDurationFormatted: metrics.avgTaskDurationMs > 0
                ? `${Math.round(metrics.avgTaskDurationMs / 1000)}s`
                : "N/A",
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get metrics",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Resource: Admin config
server.resource(
  "tarx-admin://config",
  "Admin MCP server configuration",
  async () => ({
    contents: [{
      uri: "tarx-admin://config",
      mimeType: "application/json",
      text: JSON.stringify({
        server: "tarx-admin-mcp",
        sentry: {
          org: SENTRY_ORG,
          projects: ALL_PROJECTS,
          api: SENTRY_API_BASE,
        },
      }, null, 2),
    }],
  })
);

// =============================================================================
// CLAUDE CODE SESSION TOOLS
// =============================================================================

interface OutputLine {
  timestamp: string;
  type: 'stdout' | 'stderr';
  text: string;
}

interface ClaudeCodeSession {
  id: string;
  process: ChildProcess;
  workspace: string;
  prompt: string;
  model: string;
  startedAt: string;
  endedAt?: string;
  status: 'running' | 'completed' | 'error';
  outputLines: OutputLine[];
  exitCode?: number | null;
  error?: string;
}

// In-memory store for Claude Code sessions
const claudeCodeSessions = new Map<string, ClaudeCodeSession>();

function generateSessionId(): string {
  return `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Tool: Start a Claude Code session
server.tool(
  "tarx_admin_start_code_session",
  "Start a Claude Code CLI session with a prompt. The session runs in the background and you can check its output later.",
  {
    prompt: z.string().describe("The prompt/task to give Claude Code"),
    workspace: z.string().optional().describe("Working directory (default: ~/Desktop/tarx-code-oss)"),
    model: z.string().optional().describe("Model to use (default: sonnet)"),
    dangerouslySkipPermissions: z.boolean().optional().describe("Skip permission prompts (default: false)"),
  },
  async ({ prompt, workspace, model = "sonnet", dangerouslySkipPermissions = false }) => {
    try {
      const sessionId = generateSessionId();
      const workDir = workspace || path.join(os.homedir(), "Desktop/tarx-code-oss");

      // Create outputLines array BEFORE spawn - this will be shared by reference
      const outputLines: OutputLine[] = [];

      // Build Claude Code command arguments
      const args = [
        '--model', model,
        '-p', prompt,
        '--output-format', 'text'
      ];

      if (dangerouslySkipPermissions) {
        args.push('--dangerously-skip-permissions');
      }

      // Spawn Claude Code process with explicit pipes
      const proc = spawn('/opt/homebrew/bin/claude', args, {
        cwd: workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      // Capture stdout
      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        console.error(`[Claude ${sessionId}] stdout: ${text.substring(0, 200)}`);
        text.split('\n').forEach(line => {
          if (line.trim()) {
            outputLines.push({
              timestamp: new Date().toISOString(),
              type: 'stdout',
              text: line
            });
          }
        });
      });

      // Capture stderr
      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        console.error(`[Claude ${sessionId}] stderr: ${text.substring(0, 200)}`);
        text.split('\n').forEach(line => {
          if (line.trim()) {
            outputLines.push({
              timestamp: new Date().toISOString(),
              type: 'stderr',
              text: line
            });
          }
        });
      });

      // Store session - outputLines is SHARED REFERENCE
      const session: ClaudeCodeSession = {
        id: sessionId,
        process: proc,
        workspace: workDir,
        prompt,
        model,
        startedAt: new Date().toISOString(),
        status: 'running',
        outputLines,  // Same array that spawn callbacks push to
      };

      claudeCodeSessions.set(sessionId, session);

      // Handle process exit - update session in map
      proc.on('close', (code: number | null) => {
        console.error(`[Claude ${sessionId}] Process exited with code ${code}`);
        const sess = claudeCodeSessions.get(sessionId);
        if (sess) {
          sess.status = code === 0 ? 'completed' : 'error';
          sess.exitCode = code;
          sess.endedAt = new Date().toISOString();
          if (code !== 0) {
            sess.error = `Process exited with code ${code}`;
          }
        }
      });

      proc.on('error', (err: Error) => {
        console.error(`[Claude ${sessionId}] Process error: ${err.message}`);
        const sess = claudeCodeSessions.get(sessionId);
        if (sess) {
          sess.status = 'error';
          sess.error = err.message;
          sess.endedAt = new Date().toISOString();
        }
      });

      console.error(`[Claude ${sessionId}] Spawned: /opt/homebrew/bin/claude ${args.slice(0, 4).join(' ')}...`);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            sessionId,
            workspace: workDir,
            prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
            model,
            message: "Claude Code session started. Use tarx_admin_get_session_output to check progress.",
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to start Claude Code session",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: List Claude Code sessions
server.tool(
  "tarx_admin_list_code_sessions",
  "List all Claude Code sessions (running and completed).",
  {
    status: z.enum(["all", "running", "completed", "error"]).optional()
      .describe("Filter by status (default: all)"),
  },
  async ({ status = "all" }) => {
    try {
      let sessions = Array.from(claudeCodeSessions.values());

      if (status !== "all") {
        sessions = sessions.filter(s => s.status === status);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sessions: sessions.map(s => ({
              id: s.id,
              status: s.status,
              workspace: s.workspace,
              prompt: s.prompt.substring(0, 50) + (s.prompt.length > 50 ? '...' : ''),
              startedAt: s.startedAt,
              outputLines: s.outputLines.length,
              error: s.error,
            })),
            count: sessions.length,
            filter: status,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to list sessions",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Get session output
server.tool(
  "tarx_admin_get_session_output",
  "Get the output from a Claude Code session.",
  {
    sessionId: z.string().describe("The session ID"),
    tail: z.number().optional().describe("Only return last N lines (default: all)"),
  },
  async ({ sessionId, tail }) => {
    try {
      const session = claudeCodeSessions.get(sessionId);

      if (!session) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Session ${sessionId} not found` }),
          }],
          isError: true,
        };
      }

      let lines = session.outputLines;
      if (tail && tail > 0) {
        lines = lines.slice(-tail);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sessionId,
            status: session.status,
            workspace: session.workspace,
            prompt: session.prompt,
            model: session.model,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            exitCode: session.exitCode,
            output: lines.map(l => l.text),
            totalLines: session.outputLines.length,
            returnedLines: lines.length,
            error: session.error,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get session output",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Send followup to session
server.tool(
  "tarx_admin_send_to_session",
  "Send a followup message to a running Claude Code session via stdin.",
  {
    sessionId: z.string().describe("The session ID"),
    message: z.string().describe("Message to send to the session"),
  },
  async ({ sessionId, message }) => {
    try {
      const session = claudeCodeSessions.get(sessionId);

      if (!session) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Session ${sessionId} not found` }),
          }],
          isError: true,
        };
      }

      if (session.status !== 'running') {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Session is ${session.status}, cannot send message`,
              sessionId,
              status: session.status,
            }),
          }],
          isError: true,
        };
      }

      if (!session.process.stdin) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: "Session stdin not available" }),
          }],
          isError: true,
        };
      }

      // Write message to stdin
      session.process.stdin.write(message + '\n');
      session.output.push(`[input] ${message}`);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            sessionId,
            messageSent: message,
            message: "Message sent to session. Check output for response.",
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to send message",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Stop a Claude Code session
server.tool(
  "tarx_admin_stop_code_session",
  "Stop a running Claude Code session.",
  {
    sessionId: z.string().describe("The session ID to stop"),
    force: z.boolean().optional().describe("Force kill with SIGKILL (default: false, uses SIGTERM)"),
  },
  async ({ sessionId, force = false }) => {
    try {
      const session = claudeCodeSessions.get(sessionId);

      if (!session) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Session ${sessionId} not found` }),
          }],
          isError: true,
        };
      }

      if (session.status !== 'running') {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Session is already ${session.status}`,
              sessionId,
              status: session.status,
            }),
          }],
          isError: true,
        };
      }

      // Kill the process
      const signal = force ? 'SIGKILL' : 'SIGTERM';
      session.process.kill(signal);
      session.status = 'completed';
      session.output.push(`[system] Session stopped with ${signal}`);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            sessionId,
            signal,
            message: `Session stopped with ${signal}`,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to stop session",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Clear completed sessions
server.tool(
  "tarx_admin_clear_code_sessions",
  "Clear completed/errored sessions from memory.",
  {
    olderThanMinutes: z.number().optional().describe("Only clear sessions older than N minutes (default: 0 = all completed)"),
  },
  async ({ olderThanMinutes = 0 }) => {
    try {
      const cutoff = Date.now() - (olderThanMinutes * 60 * 1000);
      let cleared = 0;

      for (const [id, session] of claudeCodeSessions) {
        if (session.status !== 'running' && session.startedAt < cutoff) {
          claudeCodeSessions.delete(id);
          cleared++;
        }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            clearedSessions: cleared,
            remainingSessions: claudeCodeSessions.size,
            message: `Cleared ${cleared} completed sessions`,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to clear sessions",
          }),
        }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// TETHERED CLAUDE CODE TOOLS (TARX ↔ CC Bridge)
// =============================================================================

// Tool: Dispatch work (tethered Claude Code session)
server.tool(
  "tarx_dispatch_work",
  "Start a Claude Code session with TARX tethering. Creates a TARX session, orchestration entry, and auto-syncs output on completion. Use this for tracked work that needs to persist in TARX history.",
  {
    prompt: z.string().describe("The prompt/task to give Claude Code"),
    workspace: z.string().optional().describe("Working directory (default: ~/Desktop/tarx-code-oss)"),
    model: z.string().optional().describe("Model to use (default: sonnet)"),
    dangerouslySkipPermissions: z.boolean().optional().describe("Skip permission prompts (default: false)"),
  },
  async ({ prompt, workspace, model = "sonnet", dangerouslySkipPermissions = false }) => {
    try {
      const sessionId = generateSessionId();
      const workDir = workspace || path.join(os.homedir(), "Desktop/tarx-code-oss");

      // Create tether BEFORE spawning
      const tetherResult = Tether.createTether(sessionId, prompt, workDir, model);
      console.error(`[Tether] Created tether for CC session ${sessionId} → TARX ${tetherResult.tarxSessionId}`);

      // Create outputLines array BEFORE spawn
      const outputLines: OutputLine[] = [];

      // Build Claude Code command arguments
      const args = [
        '--model', model,
        '-p', prompt,
        '--output-format', 'text'
      ];

      if (dangerouslySkipPermissions) {
        args.push('--dangerously-skip-permissions');
      }

      // Spawn Claude Code process
      const proc = spawn('/opt/homebrew/bin/claude', args, {
        cwd: workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      // Capture stdout
      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        console.error(`[Claude ${sessionId}] stdout: ${text.substring(0, 200)}`);
        text.split('\n').forEach(line => {
          if (line.trim()) {
            outputLines.push({
              timestamp: new Date().toISOString(),
              type: 'stdout',
              text: line
            });
          }
        });
      });

      // Capture stderr
      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        console.error(`[Claude ${sessionId}] stderr: ${text.substring(0, 200)}`);
        text.split('\n').forEach(line => {
          if (line.trim()) {
            outputLines.push({
              timestamp: new Date().toISOString(),
              type: 'stderr',
              text: line
            });
          }
        });
      });

      // Store session
      const session: ClaudeCodeSession = {
        id: sessionId,
        process: proc,
        workspace: workDir,
        prompt,
        model,
        startedAt: new Date().toISOString(),
        status: 'running',
        outputLines,
      };

      claudeCodeSessions.set(sessionId, session);

      // Handle process exit - AUTO-SYNC TO TARX
      proc.on('close', (code: number | null) => {
        console.error(`[Claude ${sessionId}] Process exited with code ${code}`);
        const sess = claudeCodeSessions.get(sessionId);
        if (sess) {
          sess.status = code === 0 ? 'completed' : 'error';
          sess.exitCode = code;
          sess.endedAt = new Date().toISOString();
          if (code !== 0) {
            sess.error = `Process exited with code ${code}`;
          }

          // AUTO-SYNC OUTPUT TO TARX
          const fullOutput = sess.outputLines.map(l => l.text).join('\n');
          const syncResult = Tether.syncOutput(
            sessionId,
            fullOutput,
            code === 0 ? 'completed' : 'error',
            code
          );
          console.error(`[Tether] Auto-synced output for ${sessionId}: msg=${syncResult.messageId}, memory=${syncResult.memoryId}`);
        }
      });

      proc.on('error', (err: Error) => {
        console.error(`[Claude ${sessionId}] Process error: ${err.message}`);
        const sess = claudeCodeSessions.get(sessionId);
        if (sess) {
          sess.status = 'error';
          sess.error = err.message;
          sess.endedAt = new Date().toISOString();

          // Sync error state too
          const fullOutput = sess.outputLines.map(l => l.text).join('\n');
          Tether.syncOutput(sessionId, fullOutput, 'error', null);
        }
      });

      console.error(`[Claude ${sessionId}] Spawned (tethered): /opt/homebrew/bin/claude ${args.slice(0, 4).join(' ')}...`);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            ccSessionId: sessionId,
            tarxSessionId: tetherResult.tarxSessionId,
            orchSessionId: tetherResult.orchSessionId,
            spaceId: tetherResult.spaceId,
            workspace: workDir,
            prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
            model,
            message: `Tethered Claude Code session started. Output will auto-sync to TARX session ${tetherResult.tarxSessionId}. Use tarx_check_work to monitor progress.`,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to start tethered Claude Code session",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Check work status
server.tool(
  "tarx_check_work",
  "Check status of tethered Claude Code work. If ccSessionId is provided, returns detailed status and auto-syncs if completed. Otherwise lists all tethered sessions.",
  {
    ccSessionId: z.string().optional().describe("Claude Code session ID to check"),
    showAll: z.boolean().optional().describe("Show all sessions including completed (default: false)"),
    limit: z.number().optional().describe("Limit number of results (default: 10)"),
  },
  async ({ ccSessionId, showAll = false, limit = 10 }) => {
    try {
      if (ccSessionId) {
        // Get specific tether and CC session
        const tether = Tether.getTether(ccSessionId);
        if (!tether) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: `No tethered session found for CC session ${ccSessionId}`,
              }),
            }],
            isError: true,
          };
        }

        const ccSession = claudeCodeSessions.get(ccSessionId);

        // If CC session is done but not synced, sync it now
        if (ccSession && ccSession.status !== 'running' && !tether.outputSynced) {
          const fullOutput = ccSession.outputLines.map(l => l.text).join('\n');
          const syncResult = Tether.syncOutput(
            ccSessionId,
            fullOutput,
            ccSession.status === 'completed' ? 'completed' : 'error',
            ccSession.exitCode
          );
          console.error(`[Tether] Manual sync triggered for ${ccSessionId}: msg=${syncResult.messageId}`);
        }

        // Return unified status
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ccSession: {
                id: ccSessionId,
                status: ccSession?.status || 'unknown',
                startedAt: ccSession?.startedAt,
                endedAt: ccSession?.endedAt,
                outputLines: ccSession?.outputLines.length || 0,
                exitCode: ccSession?.exitCode,
              },
              tarxSession: {
                id: tether.tarxSessionId,
                orchId: tether.orchSessionId,
                spaceId: tether.spaceId,
                prompt: tether.prompt,
                workspace: tether.workspace,
                model: tether.model,
                outputSynced: tether.outputSynced,
                createdAt: new Date(tether.createdAt).toISOString(),
                lastSyncAt: tether.lastSyncAt ? new Date(tether.lastSyncAt).toISOString() : null,
              },
            }, null, 2),
          }],
        };
      } else {
        // List all tethered sessions
        const allTethers = Tether.listTetheredSessions({ limit });
        const stats = Tether.getTetherStats();

        const tethersWithStatus = allTethers.map(t => {
          const ccSession = claudeCodeSessions.get(t.ccSessionId);
          return {
            ccSessionId: t.ccSessionId,
            tarxSessionId: t.tarxSessionId,
            prompt: t.prompt.substring(0, 80) + (t.prompt.length > 80 ? '...' : ''),
            workspace: t.workspace,
            model: t.model,
            ccStatus: ccSession?.status || 'ended',
            outputSynced: t.outputSynced,
            createdAt: new Date(t.createdAt).toISOString(),
          };
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              stats,
              recentSessions: showAll ? tethersWithStatus : tethersWithStatus.filter(t => !t.outputSynced || t.ccStatus === 'running'),
              totalShown: tethersWithStatus.length,
              message: `Showing ${tethersWithStatus.length} tethered sessions. Use ccSessionId parameter for detailed status.`,
            }, null, 2),
          }],
        };
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to check work status",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Work history
server.tool(
  "tarx_work_history",
  "Get persistent history of tethered Claude Code sessions. This history survives restarts, unlike in-memory CC sessions.",
  {
    limit: z.number().optional().describe("Maximum sessions to return (default: 20)"),
    onlySynced: z.boolean().optional().describe("Only show synced sessions (default: false)"),
  },
  async ({ limit = 20, onlySynced = false }) => {
    try {
      const sessions = Tether.listTetheredSessions({
        limit,
        synced: onlySynced ? true : undefined,
      });
      const stats = Tether.getTetherStats();

      const sessionSummaries = sessions.map(s => ({
        ccSessionId: s.ccSessionId,
        tarxSessionId: s.tarxSessionId,
        orchSessionId: s.orchSessionId,
        prompt: s.prompt.substring(0, 100) + (s.prompt.length > 100 ? '...' : ''),
        workspace: s.workspace,
        model: s.model,
        outputSynced: s.outputSynced,
        createdAt: new Date(s.createdAt).toISOString(),
        lastSyncAt: s.lastSyncAt ? new Date(s.lastSyncAt).toISOString() : null,
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            stats: {
              ...stats,
              spaceLink: stats.spaceId ? `View in TARX: space/${stats.spaceId}` : null,
            },
            sessions: sessionSummaries,
            totalShown: sessionSummaries.length,
            message: `Showing ${sessionSummaries.length} tethered sessions from persistent storage.`,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to get work history",
          }),
        }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// CONSOLE LOG TOOLS
// =============================================================================

const TARX_LOG_FILE = path.join(os.homedir(), "Library/Application Support/tarx/console.log");

// Tool: Read TARX console logs
server.tool(
  "tarx_admin_read_console",
  "Read Workbench extension console logs. Returns recent [TARX] prefixed log lines from the running app.",
  {
    lines: z.number().optional().describe("Number of lines to return (default: 100, max: 1000)"),
    filter: z.string().optional().describe("Case-insensitive substring filter"),
    clear: z.boolean().optional().describe("Clear logs after reading (default: false)"),
  },
  async ({ lines = 100, filter, clear = false }) => {
    try {
      if (!fs.existsSync(TARX_LOG_FILE)) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: "Log file not found. Extension may not be running or logger not initialized.",
              path: TARX_LOG_FILE,
            }, null, 2),
          }],
        };
      }

      const content = fs.readFileSync(TARX_LOG_FILE, "utf8");
      let logLines = content.split("\n").filter(Boolean);

      // Apply filter if provided
      if (filter) {
        const lowerFilter = filter.toLowerCase();
        logLines = logLines.filter(l => l.toLowerCase().includes(lowerFilter));
      }

      // Limit to requested lines (from end)
      const maxLines = Math.min(lines, 1000);
      const result = logLines.slice(-maxLines);

      // Clear if requested
      if (clear) {
        fs.writeFileSync(TARX_LOG_FILE, "");
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            lineCount: result.length,
            totalLines: logLines.length,
            filter: filter || null,
            cleared: clear,
            logs: result,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to read logs",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Tail TARX console logs (last N seconds)
server.tool(
  "tarx_admin_tail_console",
  "Get TARX console logs from the last N seconds. Useful for 'what just happened' debugging.",
  {
    seconds: z.number().optional().describe("Timeframe in seconds (default: 60)"),
    filter: z.string().optional().describe("Case-insensitive substring filter"),
  },
  async ({ seconds = 60, filter }) => {
    try {
      if (!fs.existsSync(TARX_LOG_FILE)) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: "Log file not found. Extension may not be running or logger not initialized.",
              path: TARX_LOG_FILE,
            }, null, 2),
          }],
        };
      }

      const content = fs.readFileSync(TARX_LOG_FILE, "utf8");
      let logLines = content.split("\n").filter(Boolean);

      // Filter by timestamp
      const cutoff = Date.now() - (seconds * 1000);
      logLines = logLines.filter(line => {
        const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z)/);
        if (match) {
          const lineTime = new Date(match[1]).getTime();
          return lineTime >= cutoff;
        }
        return false;
      });

      // Apply text filter if provided
      if (filter) {
        const lowerFilter = filter.toLowerCase();
        logLines = logLines.filter(l => l.toLowerCase().includes(lowerFilter));
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            lineCount: logLines.length,
            seconds,
            filter: filter || null,
            logs: logLines,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to tail logs",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Tool: Clear TARX console logs
server.tool(
  "tarx_admin_clear_console",
  "Clear TARX console log file.",
  {},
  async () => {
    try {
      if (fs.existsSync(TARX_LOG_FILE)) {
        fs.writeFileSync(TARX_LOG_FILE, "");
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Console logs cleared",
            path: TARX_LOG_FILE,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Failed to clear logs",
          }),
        }],
        isError: true,
      };
    }
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`TARX Admin MCP Server v2.3.0 started`);
  console.error(`  - Sentry: ${SENTRY_ORG} (projects: ${ALL_PROJECTS.join(", ")})`);
  console.error(`  - Session orchestration: enabled`);
  console.error(`  - Claude Code sessions: enabled`);
  console.error(`  - Console log access: enabled`);
  console.error(`  - Creator auth: ${CREATOR_KEY ? "ENABLED" : "DISABLED (set TARX_CREATOR_KEY to enable)"}`);
  console.error(`  - Audit log: ${AUDIT_LOG_PATH}`);
}

main().catch(console.error);
