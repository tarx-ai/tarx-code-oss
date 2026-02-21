/**
 * Daemon tick — called by heartbeat.ts every 5 min.
 *
 * Reads orchestration log → decides → acts:
 *   1. Health-check ports, heal if down
 *   2. Escalate unresolved blockers via SMS
 *   3. Self-handle simple tasks
 *   4. Spawn Claude worker for complex tasks
 */

import { spawn, execSync } from 'child_process';
import { appendFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { readRecentLog, getPending, getUnresolvedBlockers, LOG_PATH } from './readLog';
import { buildWorkerPrompt } from './workerPrompt';
import * as http from 'http';

const THINK_LOG = resolve(homedir(), '.tarx/thinking.log');
const INDEX_JS = resolve(__dirname, '../index.js');

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] DAEMON: ${msg}`;
  appendFileSync(THINK_LOG, line + '\n');
}

function logAction(entry: Record<string, unknown>): void {
  appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

// --- Port health (async http, matches heartbeat pattern) ---

function checkPort(port: number): Promise<boolean> {
  return new Promise((res) => {
    const timer = setTimeout(() => res(false), 3000);
    const req = http.get(`http://127.0.0.1:${port}/health`, (resp) => {
      clearTimeout(timer);
      res(resp.statusCode !== undefined && resp.statusCode >= 200 && resp.statusCode < 400);
      resp.resume();
    });
    req.on('error', () => { clearTimeout(timer); res(false); });
    req.on('timeout', () => { clearTimeout(timer); req.destroy(); res(false); });
  });
}

function healPort(port: number): void {
  log(`HEAL: Port ${port} down, running tarx heal`);
  try {
    execSync(`node ${INDEX_JS} heal`, {
      cwd: resolve(homedir(), 'Desktop/tarx-code-oss'),
      encoding: 'utf-8',
      timeout: 60000,
      stdio: 'pipe',
    });
    log(`HEAL: Heal command completed for port ${port}`);
  } catch (e: any) {
    log(`HEAL: Failed for port ${port}: ${e.message?.substring(0, 200)}`);
  }
  logAction({ type: 'auto_heal', target: `port_${port}`, status: 'attempted' });
}

// --- Worker spawn ---

function spawnWorker(taskId: string, directive: string, files: string[]): void {
  const prompt = buildWorkerPrompt({
    session_id: 'daemon-auto',
    task_id: taskId,
    directive,
    files,
  });

  log(`SPAWN: Worker for task ${taskId}: "${directive}"`);

  const child = spawn('claude', ['-p', prompt, '--max-turns', '5'], {
    cwd: files[0]?.includes('/') ? files[0].replace(/\/[^/]+$/, '') : homedir(),
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  logAction({ type: 'worker_spawned', task_id: taskId, directive, pid: child.pid });
}

// --- Blocker notification (uses spawn with args array — no shell injection) ---

function notifyBlocker(taskId: string, reason: string): void {
  log(`BLOCKER: ${reason} — sending SMS`);
  try {
    const child = spawn('node', [INDEX_JS, 'notify', '--level=blocked', `BLOCKER [${taskId}]: ${reason}`], {
      cwd: resolve(homedir(), 'Desktop/tarx-code-oss'),
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch (e: any) {
    log(`BLOCKER: Notification failed: ${e.message?.substring(0, 200)}`);
  }
}

// --- Self-handle patterns ---

const SELF_HANDLE_PATTERNS = [
  'update status',
  'push context',
  'mark delivered',
  'log checkpoint',
];

function canSelfHandle(summary: string): boolean {
  const lower = summary.toLowerCase();
  return SELF_HANDLE_PATTERNS.some(p => lower.includes(p));
}

// === MAIN TICK ===

export async function daemonTick(): Promise<void> {
  const entries = readRecentLog(30);
  const pending = getPending(entries);
  const blockers = getUnresolvedBlockers(entries);

  // 1. Health first
  const ports = [11435, 11436, 11437];
  for (const p of ports) {
    if (!(await checkPort(p))) {
      healPort(p);
      return; // heal takes priority, re-check next tick
    }
  }

  // 2. Unresolved blockers → SMS (max 1 per tick)
  if (blockers.length > 0) {
    const latest = blockers[blockers.length - 1];
    const recentNotify = entries.find(
      e => e.type === 'blocker_notified' && e.task_id === latest.task_id
    );
    if (!recentNotify) {
      notifyBlocker(latest.task_id || 'unknown', String(latest.reason || 'no reason given'));
      logAction({ type: 'blocker_notified', task_id: latest.task_id });
    }
    log(`Blockers active: ${blockers.length}. Waiting for human input.`);
    return;
  }

  // 3. Pending tasks → pick highest priority (first in queue)
  if (pending.length > 0) {
    const task = pending[0];
    const summary = task.summary || '';

    if (canSelfHandle(summary)) {
      log(`SELF-HANDLE: ${task.task_id} — ${summary}`);
      logAction({ type: 'task_update', task_id: task.task_id, status: 'done', summary: 'Daemon auto-completed' });
      return;
    }

    // Complex tasks: spawn worker
    spawnWorker(
      task.task_id || `auto_${Date.now()}`,
      summary || 'No directive',
      task.files || [],
    );
    return;
  }

  // 4. Nothing to do
  log(`All clear. ${entries.length} log entries, ${pending.length} pending, ${blockers.length} blockers. Resting.`);
}
