/**
 * TARX Autonomous Daemon
 *
 * "I build while you breathe."
 *
 * Watches orch_tasks for pending items, spawns Claude Code sessions,
 * polls output, updates task status. Simple task executor — no routing.
 *
 * Safety limits:
 *   - Max 2 concurrent Claude Code sessions
 *   - 5 minute timeout per session (kill if no new output after 300s)
 *   - 3 retries on failed task before marking 'blocked'
 *   - Auto-pause after 3 consecutive failures
 *   - 30 second poll interval between queue checks
 *   - Full audit logging (spawn/complete/fail/timeout)
 */

import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DaemonSession {
  taskId: string;
  proc: ChildProcess;
  outputLines: string[];
  lastOutputAt: number;
  startedAt: number;
  retryCount: number;
}

interface DaemonState {
  running: boolean;
  startedAt: string | null;
  pausedAt: string | null;
  pauseReason: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  tasksTimedOut: number;
  consecutiveFailures: number;
  activeSessions: Map<string, DaemonSession>;
}

export interface DaemonStatus {
  running: boolean;
  startedAt: string | null;
  pausedAt: string | null;
  pauseReason: string | null;
  stats: {
    tasksCompleted: number;
    tasksFailed: number;
    tasksTimedOut: number;
    consecutiveFailures: number;
  };
  activeSessions: Array<{
    taskId: string;
    outputLines: number;
    runningForMs: number;
    lastOutputAgoMs: number;
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = 2;
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;    // 5 minutes
const MAX_RETRIES = 3;
const MAX_CONSECUTIVE_FAILURES = 3;
const POLL_INTERVAL_MS = 30 * 1000;           // 30 seconds
const TIMEOUT_CHECK_INTERVAL_MS = 10 * 1000;  // check for timeouts every 10s
const CLAUDE_BIN = findClaudeBinary();

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

  // Fallback: ask the shell
  try {
    const { execSync } = require('child_process');
    return execSync('which claude', { encoding: 'utf8' }).trim();
  } catch {
    return '/opt/homebrew/bin/claude'; // last resort
  }
}
const AUDIT_LOG_PATH = path.join(os.homedir(), "Library/Application Support/tarx/audit.jsonl");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state: DaemonState = {
  running: false,
  startedAt: null,
  pausedAt: null,
  pauseReason: null,
  tasksCompleted: 0,
  tasksFailed: 0,
  tasksTimedOut: 0,
  consecutiveFailures: 0,
  activeSessions: new Map(),
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
let timeoutTimer: ReturnType<typeof setInterval> | null = null;

// We receive db + helpers via init() to avoid circular imports
let _db: any = null;
let _now: () => number = Date.now;

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

function daemonAudit(event: string, details: Record<string, unknown>): void {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      server: "tarx-ops",
      component: "daemon",
      event,
      ...details,
    };
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + "\n");
    console.error(`[daemon] ${event}: ${JSON.stringify(details)}`);
  } catch {
    // audit should never crash
  }
}

// ---------------------------------------------------------------------------
// Core: fetch pending tasks
// ---------------------------------------------------------------------------

function fetchPendingTasks(): Array<Record<string, unknown>> {
  if (!_db) return [];
  try {
    return _db.prepare(
      `SELECT t.*, s.name as session_name, s.workspace_path as workspace
       FROM orch_tasks t
       JOIN orch_sessions s ON t.session_id = s.id
       WHERE t.status = 'pending'
       ORDER BY
         CASE t.priority
           WHEN 'critical' THEN 0
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'low' THEN 3
         END,
         t.assigned_at ASC
       LIMIT 5`
    ).all() as Array<Record<string, unknown>>;
  } catch (err) {
    console.error("[daemon] fetchPendingTasks error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Core: update task in DB
// ---------------------------------------------------------------------------

function updateTaskStatus(
  taskId: string,
  status: "in_progress" | "completed" | "blocked",
  result?: string,
  blockedBy?: string
): void {
  if (!_db) return;
  try {
    const updates: string[] = ["status = ?"];
    const values: unknown[] = [status];

    if (status === "in_progress") {
      updates.push("started_at = ?");
      values.push(_now());
    }
    if (status === "completed") {
      updates.push("completed_at = ?");
      values.push(_now());
      if (result) {
        updates.push("result = ?");
        values.push(result);
      }
    }
    if (status === "blocked" && blockedBy) {
      updates.push("blocked_by = ?");
      values.push(blockedBy);
    }

    values.push(taskId);
    _db.prepare(`UPDATE orch_tasks SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  } catch (err) {
    console.error("[daemon] updateTaskStatus error:", err);
  }
}

// ---------------------------------------------------------------------------
// Core: get retry count from task description metadata
// We store retry count in the result field as "[RETRY N] ..." when retrying
// ---------------------------------------------------------------------------

function getRetryCount(task: Record<string, unknown>): number {
  const result = task.result as string | null;
  if (!result) return 0;
  const match = result.match(/^\[RETRY (\d+)\]/);
  return match ? parseInt(match[1], 10) : 0;
}

// ---------------------------------------------------------------------------
// Core: spawn a Claude Code session for a task
// ---------------------------------------------------------------------------

function spawnForTask(task: Record<string, unknown>): void {
  const taskId = task.id as string;
  const title = task.title as string;
  const description = task.description as string || title;
  const workspace = (task.workspace as string) || path.join(os.homedir(), "Desktop/tarx-code-oss");
  const retryCount = getRetryCount(task);

  const prompt = description;
  const args = [
    "--model", "sonnet",
    "-p", prompt,
    "--output-format", "text",
    "--no-session-persistence",
    "--dangerously-skip-permissions",
  ];

  daemonAudit("spawn", { taskId, title, workspace, retryCount });

  const proc = spawn(CLAUDE_BIN, args, {
    cwd: workspace,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  // Close stdin immediately (fix for 0-output bug)
  proc.stdin.end();

  const session: DaemonSession = {
    taskId,
    proc,
    outputLines: [],
    lastOutputAt: Date.now(),
    startedAt: Date.now(),
    retryCount,
  };

  state.activeSessions.set(taskId, session);

  // Mark task in_progress
  updateTaskStatus(taskId, "in_progress");

  // Capture stdout
  proc.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    session.lastOutputAt = Date.now();
    text.split("\n").forEach((line) => {
      if (line.trim()) {
        session.outputLines.push(line);
      }
    });
  });

  // Capture stderr
  proc.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    session.lastOutputAt = Date.now();
    console.error(`[daemon][${taskId}] stderr: ${text.substring(0, 200)}`);
  });

  // Handle exit
  proc.on("close", (code: number | null) => {
    state.activeSessions.delete(taskId);

    if (code === 0) {
      // Success
      const output = session.outputLines.join("\n");
      const summary = output.length > 2000 ? output.substring(0, 2000) + "..." : output;
      updateTaskStatus(taskId, "completed", summary);
      state.tasksCompleted++;
      state.consecutiveFailures = 0;
      daemonAudit("complete", {
        taskId,
        title,
        exitCode: code,
        outputLines: session.outputLines.length,
        durationMs: Date.now() - session.startedAt,
      });
    } else {
      // Failure
      handleTaskFailure(task, session, `Process exited with code ${code}`);
    }
  });

  proc.on("error", (err: Error) => {
    state.activeSessions.delete(taskId);
    handleTaskFailure(task, session, `Spawn error: ${err.message}`);
  });
}

// ---------------------------------------------------------------------------
// Core: handle task failure (retry or block)
// ---------------------------------------------------------------------------

function handleTaskFailure(
  task: Record<string, unknown>,
  session: DaemonSession,
  reason: string
): void {
  const taskId = task.id as string;
  const title = task.title as string;
  const retryCount = session.retryCount + 1;

  state.tasksFailed++;
  state.consecutiveFailures++;

  daemonAudit("fail", {
    taskId,
    title,
    reason,
    retryCount,
    consecutiveFailures: state.consecutiveFailures,
    durationMs: Date.now() - session.startedAt,
  });

  if (retryCount >= MAX_RETRIES) {
    // Max retries exceeded — mark blocked
    updateTaskStatus(taskId, "blocked", undefined, `Failed after ${retryCount} attempts: ${reason}`);
    daemonAudit("blocked", { taskId, title, retryCount, reason });
  } else {
    // Reset to pending with retry marker for next pick-up
    if (_db) {
      _db.prepare("UPDATE orch_tasks SET status = 'pending', result = ? WHERE id = ?")
        .run(`[RETRY ${retryCount}] ${reason}`, taskId);
    }
  }

  // Auto-pause after consecutive failures
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    pause(`Auto-paused: ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
  }
}

// ---------------------------------------------------------------------------
// Core: check for timed-out sessions
// ---------------------------------------------------------------------------

function checkTimeouts(): void {
  const now = Date.now();
  for (const [taskId, session] of state.activeSessions) {
    const sinceLastOutput = now - session.lastOutputAt;
    if (sinceLastOutput > SESSION_TIMEOUT_MS) {
      console.error(`[daemon] Timeout: task ${taskId} (no output for ${Math.round(sinceLastOutput / 1000)}s)`);
      state.tasksTimedOut++;

      // Kill the process
      try {
        session.proc.kill("SIGTERM");
        setTimeout(() => {
          try { session.proc.kill("SIGKILL"); } catch {}
        }, 5000);
      } catch {}

      state.activeSessions.delete(taskId);

      // Treat timeout as failure
      const task = _db?.prepare("SELECT * FROM orch_tasks WHERE id = ?").get(taskId) as Record<string, unknown> | undefined;
      if (task) {
        handleTaskFailure(task, session, `Timeout: no output for ${SESSION_TIMEOUT_MS / 1000}s`);
      }

      daemonAudit("timeout", {
        taskId,
        outputLines: session.outputLines.length,
        durationMs: now - session.startedAt,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Core: main poll tick
// ---------------------------------------------------------------------------

function pollTick(): void {
  if (!state.running) return;
  if (state.pausedAt) return;

  // Check capacity - enforce 2 concurrent limit
  const activeCount = state.activeSessions.size;
  if (activeCount >= MAX_CONCURRENT) {
    // Log queued state for visibility
    const pending = fetchPendingTasks();
    if (pending.length > 0) {
      console.error(`[daemon] Max concurrent reached (${MAX_CONCURRENT}) — ${pending.length} task(s) queued`);
      daemonAudit("queue", { activeCount, queuedCount: pending.length, maxConcurrent: MAX_CONCURRENT });
    }
    return;
  }

  // Fetch pending tasks
  const pending = fetchPendingTasks();
  if (pending.length === 0) return;

  // Skip tasks that are already being worked on
  const slotsAvailable = MAX_CONCURRENT - activeCount;
  let spawned = 0;

  for (const task of pending) {
    if (spawned >= slotsAvailable) break;
    const taskId = task.id as string;

    // Don't double-spawn
    if (state.activeSessions.has(taskId)) continue;

    spawnForTask(task);
    spawned++;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function init(db: any, nowFn: () => number): void {
  _db = db;
  _now = nowFn;
}

export function start(): { success: boolean; message: string } {
  if (state.running && !state.pausedAt) {
    return { success: false, message: "Daemon is already running" };
  }

  // Resume from pause
  if (state.running && state.pausedAt) {
    state.pausedAt = null;
    state.pauseReason = null;
    state.consecutiveFailures = 0;
    daemonAudit("resume", {});
    return { success: true, message: "Daemon resumed" };
  }

  state.running = true;
  state.startedAt = new Date().toISOString();
  state.pausedAt = null;
  state.pauseReason = null;
  state.consecutiveFailures = 0;

  // Start poll timer
  pollTimer = setInterval(pollTick, POLL_INTERVAL_MS);
  timeoutTimer = setInterval(checkTimeouts, TIMEOUT_CHECK_INTERVAL_MS);

  // Run first tick immediately
  pollTick();

  daemonAudit("start", {});
  return { success: true, message: "Daemon started. Polling every 30s." };
}

export function stop(): { success: boolean; message: string } {
  if (!state.running) {
    return { success: false, message: "Daemon is not running" };
  }

  state.running = false;

  // Clear timers
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (timeoutTimer) { clearInterval(timeoutTimer); timeoutTimer = null; }

  // Kill active sessions
  const killed: string[] = [];
  for (const [taskId, session] of state.activeSessions) {
    try {
      session.proc.kill("SIGTERM");
      killed.push(taskId);
    } catch {}
    // Reset task to pending so it can be re-picked
    if (_db) {
      _db.prepare("UPDATE orch_tasks SET status = 'pending' WHERE id = ? AND status = 'in_progress'")
        .run(taskId);
    }
  }
  state.activeSessions.clear();

  daemonAudit("stop", { killedSessions: killed });
  return {
    success: true,
    message: `Daemon stopped. ${killed.length} active session(s) terminated.`,
  };
}

function pause(reason: string): void {
  state.pausedAt = new Date().toISOString();
  state.pauseReason = reason;
  daemonAudit("pause", { reason });
  console.error(`[daemon] PAUSED: ${reason}`);
}

export function getStatus(): DaemonStatus {
  const now = Date.now();
  return {
    running: state.running,
    startedAt: state.startedAt,
    pausedAt: state.pausedAt,
    pauseReason: state.pauseReason,
    stats: {
      tasksCompleted: state.tasksCompleted,
      tasksFailed: state.tasksFailed,
      tasksTimedOut: state.tasksTimedOut,
      consecutiveFailures: state.consecutiveFailures,
    },
    activeSessions: Array.from(state.activeSessions.entries()).map(([taskId, s]) => ({
      taskId,
      outputLines: s.outputLines.length,
      runningForMs: now - s.startedAt,
      lastOutputAgoMs: now - s.lastOutputAt,
    })),
  };
}
