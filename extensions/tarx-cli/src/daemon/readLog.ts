/**
 * Orchestration log reader — append-only JSONL at
 * ~/Library/Application Support/tarx/orchestration-log.jsonl
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const LOG_PATH = join(homedir(), 'Library/Application Support/tarx/orchestration-log.jsonl');

export interface LogEntry {
  ts: string;
  type: string;
  task_id?: string;
  session_id?: string;
  status?: string;
  reason?: string;
  summary?: string;
  files?: string[];
  [key: string]: unknown;
}

export function readRecentLog(n = 30): LogEntry[] {
  try {
    const raw = readFileSync(LOG_PATH, 'utf-8').trim();
    if (!raw) return [];
    const lines = raw.split('\n').slice(-n);
    return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as LogEntry[];
  } catch { return []; }
}

export function getPending(entries: LogEntry[]): LogEntry[] {
  const terminal = new Set(
    entries
      .filter(e => e.status === 'done' || e.status === 'cancelled' || e.type === 'worker_spawned')
      .map(e => e.task_id)
  );
  return entries.filter(e => e.type === 'assign_task' && e.task_id && !terminal.has(e.task_id));
}

export function getBlockers(entries: LogEntry[]): LogEntry[] {
  return entries.filter(e => e.type === 'blocker');
}

export function getUnresolvedBlockers(entries: LogEntry[]): LogEntry[] {
  const resolved = new Set(
    entries.filter(e => e.type === 'blocker_resolved').map(e => e.task_id)
  );
  return entries.filter(e => e.type === 'blocker' && !resolved.has(e.task_id));
}

export { LOG_PATH };
