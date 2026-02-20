#!/usr/bin/env node
/**
 * TARX Ops MCP Server v1.2.0 -- 55 tools
 *
 * Merged admin + orchestration server.
 * All tools gated by TARX_CREATOR_KEY via creator_only middleware.
 *
 * Tool categories (55 total):
 *   Sentry: 7          | tarx_admin_sentry_projects, events, issues, search, event_details, issue_events, trace
 *   Admin Status: 2    | tarx_admin_status, tarx_admin_performance_metrics
 *   File Locks: 3      | tarx_admin_file_lock, unlock, conflicts
 *   Claude Code: 6     | tarx_admin_start/list/get/send/stop/clear_code_session
 *   Tether: 3          | tarx_dispatch_work, tarx_check_work, tarx_work_history
 *   Console: 2         | tarx_admin_read_console, tarx_admin_tail_console
 *   Orch Session: 6    | tarx_orchestrate_register/state/report_activity/activity/list/pause
 *   Orch Files: 2      | tarx_orchestrate_read_file, update_file
 *   Orch Docs: 3       | tarx_orchestrate_create_doc, list_docs, doc_history
 *   Orch Tasks: 3      | tarx_orchestrate_assign_task, task_update, task_list
 *   Orch Milestones: 3 | tarx_orchestrate_milestone_create, update, list
 *   Orch Context: 4    | tarx_orchestrate_push_context, broadcast, get_updates, mark_delivered
 *   Orch Feedback: 2   | tarx_orchestrate_request_feedback, list_feedback_requests
 *   Orch Status: 1     | tarx_orchestrate_status_report
 *   Daemon: 3          | tarx_daemon_start, stop, status
 *   GTM Invites: 2     | tarx_admin_generate_invite, list_invites
 *   Datadog: 3         | tarx_admin_datadog_status, flush, record_inference
 *
 * @package tarx-ops-mcp-server
 * @version 1.2.0
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as SessionManager from "./session-manager.js";
import { db, DB_PATH } from "./database.js";
import { generateId, now } from "./crypto.js";
import * as Daemon from "./daemon.js";
import * as Tether from "./tether.js";
import * as Datadog from "./datadog.js";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// =============================================================================
// CONFIGURATION
// =============================================================================

const SENTRY_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG = process.env.SENTRY_ORG || "tarx-fo";
const SENTRY_API_BASE = "https://sentry.io/api/0";
const CREATOR_KEY = process.env.TARX_CREATOR_KEY;
const ALL_PROJECTS = ["mesh", "node", "workbench"];

/**
 * Resolve the Claude CLI binary path.
 * Checks common install locations, then falls back to `which`.
 */
function findClaudeBinary(): string {
  const candidates = [
    path.join(os.homedir(), '.npm-global/bin/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch { /* skip */ }
  }

  try {
    const { execSync } = require('child_process');
    return execSync('which claude', { encoding: 'utf8' }).trim();
  } catch {
    return '/opt/homebrew/bin/claude';
  }
}

const CLAUDE_BIN = findClaudeBinary();

// IMPORTANT: Do NOT process.exit(1) if SENTRY_TOKEN missing!
// Just log a warning. Other tools still work without Sentry.
if (!SENTRY_TOKEN) {
  console.error("WARNING: SENTRY_AUTH_TOKEN not set. Sentry tools will fail.");
}

// Initialize daemon with shared db
Daemon.init(db, now);

// =============================================================================
// SECURITY: creator_only middleware + audit logging
// =============================================================================

const AUDIT_LOG_PATH = path.join(os.homedir(), "Library/Application Support/tarx/audit.jsonl");

function auditLog(toolName: string, params: unknown, result: { isError?: boolean } | null): void {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      server: "tarx-ops",
      tool: toolName,
      params: typeof params === "object" ? params : {},
      success: result ? !result.isError : true,
      creator_authenticated: !!CREATOR_KEY,
    };
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + "\n");
    Datadog.recordToolCall({ server: "tarx-ops", tool: toolName, success: entry.success });
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
            error: "Admin tools require creator authentication. Set TARX_CREATOR_KEY environment variable.",
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

// =============================================================================
// MCP SERVER
// =============================================================================

const server = new McpServer({
  name: "tarx-ops",
  version: "1.0.0",
});

// Auto-wrap ALL tool handlers with creator_only + audit logging
const _originalTool = server.tool.bind(server);
server.tool = function (name: string, ...rest: unknown[]) {
  const handler = rest[rest.length - 1] as ToolHandler<unknown>;
  rest[rest.length - 1] = creator_only(name, handler);
  return (_originalTool as Function).call(server, name, ...rest);
};

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

async function listProjects(): Promise<SentryProject[]> {
  return sentryFetch<SentryProject[]>(`/organizations/${SENTRY_ORG}/projects/`);
}

async function getProjectEvents(project: string, minutes: number = 60): Promise<SentryEvent[]> {
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const events = await sentryFetch<SentryEvent[]>(
    `/projects/${SENTRY_ORG}/${project}/events/?query=timestamp:>${since}&limit=50`
  );
  return events.map(e => ({ ...e, project }));
}

async function getAllProjectsEvents(minutes: number = 60): Promise<SentryEvent[]> {
  const allEvents: SentryEvent[] = [];
  for (const project of ALL_PROJECTS) {
    try {
      const events = await getProjectEvents(project, minutes);
      allEvents.push(...events);
    } catch (e) {
      console.error(`Failed to fetch events from ${project}:`, e);
    }
  }
  return allEvents.sort((a, b) =>
    new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()
  );
}

async function getProjectIssues(project: string, status: string = "unresolved"): Promise<SentryIssue[]> {
  const issues = await sentryFetch<SentryIssue[]>(
    `/projects/${SENTRY_ORG}/${project}/issues/?query=is:${status}&limit=25`
  );
  return issues.map(i => ({ ...i, project: { slug: project, name: project } }));
}

async function getAllProjectsIssues(status: string = "unresolved"): Promise<SentryIssue[]> {
  const allIssues: SentryIssue[] = [];
  for (const project of ALL_PROJECTS) {
    try {
      const issues = await getProjectIssues(project, status);
      allIssues.push(...issues);
    } catch (e) {
      console.error(`Failed to fetch issues from ${project}:`, e);
    }
  }
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
// ORCHESTRATION HELPERS
// (Renamed to avoid collision with SessionManager names)
// =============================================================================

function getOrchSession(sessionId: string): Record<string, unknown> | null {
  return db.prepare("SELECT * FROM orch_sessions WHERE id = ?").get(sessionId) as Record<string, unknown> | null;
}

function logOrchActivity(sessionId: string, activityType: string, details?: Record<string, unknown>): void {
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
// CLAUDE CODE SESSION MANAGEMENT
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

const claudeCodeSessions = new Map<string, ClaudeCodeSession>();

function generateSessionId(): string {
  return `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// =============================================================================
// CONSOLE LOG PATH
// =============================================================================

const TARX_LOG_FILE = path.join(os.homedir(), "Library/Application Support/tarx/console.log");

// =============================================================================
// SENTRY TOOLS (7)
// =============================================================================

// 1. tarx_admin_sentry_projects
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

// 2. tarx_admin_sentry_events
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

// 3. tarx_admin_sentry_issues
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

// 4. tarx_admin_sentry_search
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

// 5. tarx_admin_sentry_event_details
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

// 6. tarx_admin_sentry_issue_events
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

// 7. tarx_admin_sentry_trace
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

// =============================================================================
// ADMIN STATUS + METRICS (2)
// =============================================================================

// 8. tarx_admin_status (BUG FIX #4: updated to reflect tarx-ops, 44 tools, v1.0.0)
server.tool(
  "tarx_admin_status",
  "Get admin MCP server status and configuration",
  {},
  async () => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          server: "tarx-ops",
          version: "1.0.0",
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
            adminStatus: [
              "tarx_admin_status",
              "tarx_admin_performance_metrics",
            ],
            fileLocks: [
              "tarx_admin_file_lock",
              "tarx_admin_file_unlock",
              "tarx_admin_file_conflicts",
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
            console: [
              "tarx_admin_read_console",
              "tarx_admin_tail_console",
            ],
            orchSessions: [
              "tarx_orchestrate_register_session",
              "tarx_orchestrate_session_state",
              "tarx_orchestrate_report_activity",
              "tarx_orchestrate_session_activity",
              "tarx_orchestrate_list_sessions",
              "tarx_orchestrate_session_pause",
            ],
            orchFiles: [
              "tarx_orchestrate_read_file",
              "tarx_orchestrate_update_file",
            ],
            orchDocs: [
              "tarx_orchestrate_create_doc",
              "tarx_orchestrate_list_docs",
              "tarx_orchestrate_doc_history",
            ],
            orchTasks: [
              "tarx_orchestrate_assign_task",
              "tarx_orchestrate_task_update",
              "tarx_orchestrate_task_list",
            ],
            orchMilestones: [
              "tarx_orchestrate_milestone_create",
              "tarx_orchestrate_milestone_update",
              "tarx_orchestrate_milestone_list",
            ],
            orchContextSync: [
              "tarx_orchestrate_push_context",
              "tarx_orchestrate_broadcast",
              "tarx_orchestrate_get_updates",
              "tarx_orchestrate_mark_delivered",
            ],
            orchFeedback: [
              "tarx_orchestrate_request_feedback",
              "tarx_orchestrate_list_feedback_requests",
            ],
            orchStatus: [
              "tarx_orchestrate_status_report",
            ],
          },
          totalTools: 47,
          note: "Use project='all' to query all Sentry projects, or specify: mesh, node, workbench",
        }, null, 2),
      }],
    };
  }
);

// 9. tarx_admin_performance_metrics
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

// =============================================================================
// FILE COORDINATION TOOLS (3)
// =============================================================================

// 10. tarx_admin_file_lock
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

// 11. tarx_admin_file_unlock
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

// 12. tarx_admin_file_conflicts
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
// CLAUDE CODE SESSION TOOLS (6)
// =============================================================================

// 13. tarx_admin_start_code_session
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
        '--output-format', 'text',
        '--no-session-persistence'
      ];

      if (dangerouslySkipPermissions) {
        args.push('--dangerously-skip-permissions');
      }

      // Spawn Claude Code process
      const proc = spawn(CLAUDE_BIN, args, {
        cwd: workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      // Close stdin immediately — claude -p hangs if stdin pipe is left open
      proc.stdin.end();

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

      console.error(`[Claude ${sessionId}] Spawned: ${CLAUDE_BIN} ${args.slice(0, 4).join(' ')}...`);

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

// 14. tarx_admin_list_code_sessions
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

// 15. tarx_admin_get_session_output
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

// 16. tarx_admin_send_to_session (BUG FIX #1: session.output -> session.outputLines)
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

      if (!session.process.stdin || !session.process.stdin.writable) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: "Session stdin not available (non-interactive -p mode session)" }),
          }],
          isError: true,
        };
      }

      // Write message to stdin
      session.process.stdin.write(message + '\n');
      // BUG FIX #1: was session.output.push(...), fixed to session.outputLines.push(...)
      session.outputLines.push({
        timestamp: new Date().toISOString(),
        type: 'stdin' as 'stdout',
        text: `[input] ${message}`
      });

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

// 17. tarx_admin_stop_code_session (BUG FIX #2: session.output -> session.outputLines)
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
      // BUG FIX #2: was session.output.push(...), fixed to session.outputLines.push(...)
      session.outputLines.push({
        timestamp: new Date().toISOString(),
        type: 'stderr',
        text: `[system] Session stopped with ${signal}`
      });

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

// 18. tarx_admin_clear_code_sessions (BUG FIX #3: string/number comparison)
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
        // BUG FIX #3: was `session.startedAt < cutoff` (string vs number = always NaN)
        // Fixed to `Date.parse(session.startedAt) < cutoff`
        if (session.status !== 'running' && Date.parse(session.startedAt) < cutoff) {
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
// TETHER TOOLS (3) - Claude Code session tethering to TARX
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
      const proc = spawn(CLAUDE_BIN, args, {
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

      console.error(`[Claude ${sessionId}] Spawned (tethered): ${CLAUDE_BIN} ${args.slice(0, 4).join(' ')}...`);

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
// CONSOLE LOG TOOLS (2)
// =============================================================================

// 19. tarx_admin_read_console
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

// 20. tarx_admin_tail_console
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

// =============================================================================
// ORCHESTRATION: SESSION MONITORING (6)
// =============================================================================

// 21. tarx_orchestrate_register_session
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

      logOrchActivity(sessionId, "session_registered", { name, workspacePath });

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

// 22. tarx_orchestrate_session_state
server.tool(
  "tarx_orchestrate_session_state",
  "Get current state of a session including current file, task, and thinking notes",
  {
    sessionId: z.string().describe("Session ID to query"),
  },
  async ({ sessionId }) => {
    try {
      const session = getOrchSession(sessionId);
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

// 23. tarx_orchestrate_report_activity
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
      logOrchActivity(sessionId, activityType, details);

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

// 24. tarx_orchestrate_session_activity
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

// 25. tarx_orchestrate_list_sessions
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

// 26. tarx_orchestrate_session_pause
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
      logOrchActivity(sessionId, pause ? "session_paused" : "session_resumed");

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
// ORCHESTRATION: FILES (2)
// =============================================================================

// 27. tarx_orchestrate_read_file
server.tool(
  "tarx_orchestrate_read_file",
  "Read a file from session workspace",
  {
    sessionId: z.string().describe("Session ID"),
    filePath: z.string().describe("File path (relative or absolute)"),
  },
  async ({ sessionId, filePath }) => {
    try {
      const session = getOrchSession(sessionId);
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

// 28. tarx_orchestrate_update_file
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
      const session = getOrchSession(sessionId);
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

      logOrchActivity(sessionId, "file_updated", { filePath, mode });

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

// =============================================================================
// ORCHESTRATION: DOCUMENTATION (3)
// =============================================================================

// 29. tarx_orchestrate_create_doc
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
      const session = getOrchSession(sessionId);
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

      logOrchActivity(sessionId, "doc_created", { docType, fileName });

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

// 30. tarx_orchestrate_list_docs
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

// 31. tarx_orchestrate_doc_history
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
// ORCHESTRATION: TASK & MILESTONE MANAGEMENT (6)
// =============================================================================

// 32. tarx_orchestrate_assign_task
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

      logOrchActivity(sessionId, "task_assigned", { taskId, title, priority });

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

// 33. tarx_orchestrate_task_update
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

      logOrchActivity(task.session_id as string, "task_updated", { taskId, status, notes });

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

// 34. tarx_orchestrate_task_list
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

// 35. tarx_orchestrate_milestone_create
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

// 36. tarx_orchestrate_milestone_update
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

// 37. tarx_orchestrate_milestone_list
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
// ORCHESTRATION: CONTEXT SYNCHRONIZATION (4)
// =============================================================================

// 38. tarx_orchestrate_push_context
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

// 39. tarx_orchestrate_broadcast
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

// 40. tarx_orchestrate_get_updates
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

// 41. tarx_orchestrate_mark_delivered
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
// ORCHESTRATION: FEEDBACK (2)
// =============================================================================

// 42. tarx_orchestrate_request_feedback
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

// 43. tarx_orchestrate_list_feedback_requests
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
// ORCHESTRATION: STATUS REPORT (1)
// =============================================================================

// 44. tarx_orchestrate_status_report
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
// DAEMON TOOLS (3)
// =============================================================================

// 45. tarx_daemon_start
server.tool(
  "tarx_daemon_start",
  "Start the autonomous daemon. It watches orch_tasks for pending items, spawns Claude Code sessions, and updates task status on completion. Safety: max 2 concurrent, 5min timeout, 3 retries, auto-pause on 3 consecutive failures.",
  {},
  async () => {
    const result = Daemon.start();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2),
      }],
      isError: !result.success,
    };
  }
);

// 46. tarx_daemon_stop
server.tool(
  "tarx_daemon_stop",
  "Stop the autonomous daemon. Active sessions are terminated and their tasks reset to pending.",
  {},
  async () => {
    const result = Daemon.stop();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2),
      }],
      isError: !result.success,
    };
  }
);

// 47. tarx_daemon_status
server.tool(
  "tarx_daemon_status",
  "Get daemon status: running state, task stats (completed/failed/timed out), active sessions, and safety counters.",
  {},
  async () => {
    const status = Daemon.getStatus();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(status, null, 2),
      }],
    };
  }
);

// =============================================================================
// GTM: INVITE CODE MANAGEMENT
// =============================================================================

const INVITE_WORDS = [
  'SPARK', 'PULSE', 'NEXUS', 'FORGE', 'PRISM', 'ORBIT', 'CREST', 'FLUX',
  'LUNAR', 'SOLAR', 'NEON', 'BLAZE', 'VIPER', 'TITAN', 'DRIFT', 'WAVE',
  'ECHO', 'PIXEL', 'SIGMA', 'ALPHA', 'OMEGA', 'DELTA', 'CIPHER', 'GHOST',
  'HYPER', 'STEEL', 'RAPID', 'TURBO', 'PRIME', 'ZENITH', 'APEX', 'NOVA'
];

// 48. tarx_admin_generate_invite
server.tool(
  "tarx_admin_generate_invite",
  "Generate TARX invite codes (format: TARX-WORD-DIGITS). Creator-only.",
  {
    count: z.number().min(1).max(100).describe("Number of codes to generate"),
    tier: z.enum(["beta", "pro", "enterprise", "internal"]).optional().describe("Tier for the codes (default: beta)"),
    prefix_word: z.string().optional().describe("Custom word for the code (default: random)")
  },
  async ({ count, tier, prefix_word }) => {
    const codeTier = tier || 'beta';
    const codes: string[] = [];
    const insertTime = now();

    // Ensure invite_codes table exists
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS invite_codes (
        code TEXT PRIMARY KEY, created_at INTEGER NOT NULL, redeemed_at INTEGER,
        redeemed_by TEXT, max_uses INTEGER DEFAULT 1, use_count INTEGER DEFAULT 0,
        tier TEXT DEFAULT 'beta', metadata TEXT
      )`);
    } catch {}

    const insert = db.prepare(
      'INSERT INTO invite_codes (code, created_at, tier, max_uses) VALUES (?, ?, ?, 1)'
    );

    for (let i = 0; i < count; i++) {
      const word = prefix_word?.toUpperCase() || INVITE_WORDS[Math.floor(Math.random() * INVITE_WORDS.length)];
      const digits = String(Math.floor(1000 + Math.random() * 9000));
      const code = `TARX-${word}-${digits}`;

      try {
        insert.run(code, insertTime, codeTier);
        codes.push(code);
      } catch {
        i--; // Retry on duplicate
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ generated: codes.length, tier: codeTier, codes }, null, 2)
      }]
    };
  }
);

// 49. tarx_admin_list_invites
server.tool(
  "tarx_admin_list_invites",
  "List invite codes with redemption status. Creator-only.",
  {
    tier: z.string().optional().describe("Filter by tier"),
    unused_only: z.boolean().optional().describe("Show only unused codes")
  },
  async ({ tier, unused_only }) => {
    try {
      let query = 'SELECT code, tier, use_count, max_uses, created_at, redeemed_at, redeemed_by FROM invite_codes WHERE 1=1';
      const params: unknown[] = [];

      if (tier) {
        query += ' AND tier = ?';
        params.push(tier);
      }
      if (unused_only) {
        query += ' AND use_count < max_uses';
      }

      query += ' ORDER BY created_at DESC LIMIT 100';

      const codes = db.prepare(query).all(...params);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ count: (codes as unknown[]).length, codes }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: error instanceof Error ? error.message : "Failed to list invites" })
        }],
        isError: true
      };
    }
  }
);

// =============================================================================
// DATADOG TOOLS
// =============================================================================

// 50. tarx_admin_datadog_status
server.tool(
  "tarx_admin_datadog_status",
  "Get Datadog metrics integration status, buffered metric count, and config",
  {},
  async () => {
    const status = Datadog.getStatus();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(status, null, 2),
      }],
    };
  }
);

// 51. tarx_admin_datadog_flush
server.tool(
  "tarx_admin_datadog_flush",
  "Force an immediate flush of buffered metrics to Datadog",
  {},
  async () => {
    const result = await Datadog.forceFlush();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2),
      }],
    };
  }
);

// 52. tarx_admin_datadog_record_inference
server.tool(
  "tarx_admin_datadog_record_inference",
  "Record an inference call's latency and token metrics to Datadog",
  {
    latency_ms: z.number().describe("Inference latency in milliseconds"),
    route: z.string().describe("Routing decision: 'local' or 'network'"),
    model: z.string().describe("Model used (e.g. 'qwen-8b', 'claude-sonnet')"),
    prompt_tokens: z.number().optional().describe("Number of prompt tokens"),
    completion_tokens: z.number().optional().describe("Number of completion tokens"),
  },
  async (params) => {
    Datadog.recordInference({
      latencyMs: params.latency_ms,
      route: params.route,
      model: params.model,
      promptTokens: params.prompt_tokens,
      completionTokens: params.completion_tokens,
    });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ recorded: true, metric: "tarx.inference.*", tags: { route: params.route, model: params.model } }),
      }],
    };
  }
);

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Start Datadog metrics flush timer
  Datadog.start();

  console.error("TARX Ops MCP Server v1.2.0 started");
  console.error(`  - 55 tools available (44 ops + 3 daemon + 2 gtm + 3 datadog + 3 tether)`);
  console.error(`  - Sentry: ${SENTRY_TOKEN ? `${SENTRY_ORG} (${ALL_PROJECTS.join(", ")})` : "NOT CONFIGURED"}`);
  console.error(`  - Datadog: ${process.env.DD_API_KEY ? `${process.env.DD_SITE || "datadoghq.com"}` : "NOT CONFIGURED (set DD_API_KEY)"}`);
  console.error(`  - Database: ${DB_PATH}`);
  console.error(`  - Creator auth: ${CREATOR_KEY ? "ENABLED" : "DISABLED (set TARX_CREATOR_KEY)"}`);
  console.error(`  - Audit log: ${AUDIT_LOG_PATH}`);
}

main().catch(console.error);
