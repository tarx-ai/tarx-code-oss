/**
 * TARX Daily Briefing — Chief of staff voice.
 *
 * Reads priorities.jsonl + orchestration-log.jsonl + thinking.log
 * and produces a conversational SMS-length brief.
 *
 * No tables, no markdown, no bullet points. Just talk.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import * as http from 'http';

const PRIORITIES_PATH = resolve(homedir(), '.tarx/priorities.jsonl');
const ORCH_LOG_PATH = resolve(homedir(), 'Library/Application Support/tarx/orchestration-log.jsonl');
const THINKING_LOG = resolve(homedir(), '.tarx/thinking.log');

interface Priority {
  ts: string;
  id: string;
  title: string;
  status: string; // active | blocked | done | waiting_review
  owner: string;
  urgency: string; // now | today | this_week
  context: string;
  last_updated: string;
}

function loadPriorities(): Priority[] {
  if (!existsSync(PRIORITIES_PATH)) return [];
  try {
    const raw = readFileSync(PRIORITIES_PATH, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean) as Priority[];
  } catch { return []; }
}

function loadRecentOrchLog(n = 20): Record<string, unknown>[] {
  if (!existsSync(ORCH_LOG_PATH)) return [];
  try {
    const raw = readFileSync(ORCH_LOG_PATH, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').slice(-n).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean) as Record<string, unknown>[];
  } catch { return []; }
}

function getThinkingTail(n = 5): string[] {
  if (!existsSync(THINKING_LOG)) return [];
  try {
    const raw = readFileSync(THINKING_LOG, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').slice(-n);
  } catch { return []; }
}

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

// === DAILY BRIEF ===

export async function generateDailyBrief(): Promise<string> {
  const priorities = loadPriorities();
  const orchLog = loadRecentOrchLog(20);
  const thinking = getThinkingTail(5);

  const active = priorities.filter(p => p.status === 'active');
  const blocked = priorities.filter(p => p.status === 'blocked');
  const now = active.filter(p => p.urgency === 'now');
  const today = active.filter(p => p.urgency === 'today');
  const thisWeek = active.filter(p => p.urgency === 'this_week');
  const done = priorities.filter(p => p.status === 'done');

  // Port health snapshot
  const ports = [
    { port: 11435, name: 'Inference' },
    { port: 11436, name: 'Mesh' },
    { port: 11437, name: 'Embeddings' },
  ];
  const portResults = await Promise.all(
    ports.map(async p => ({ ...p, up: await checkPort(p.port) }))
  );
  const portsDown = portResults.filter(p => !p.up);

  // Recent daemon activity
  const recentSpawns = orchLog.filter(e => e.type === 'worker_spawned').length;
  const recentDone = orchLog.filter(e => e.type === 'task_update' && e.status === 'done').length;
  const recentBlockers = orchLog.filter(e => e.type === 'blocker').length;

  // Build conversational brief
  const parts: string[] = [];

  // Opening — what needs you
  if (now.length > 0) {
    parts.push(`${now.length} need you right now: ${now.map(p => p.title).join(', ')}.`);
  }

  if (today.length > 0) {
    parts.push(`${today.length} for today: ${today.map(p => p.title).join(', ')}.`);
  }

  if (now.length === 0 && today.length === 0) {
    parts.push('Nothing urgent today.');
  }

  // What TARX handled
  if (done.length > 0 || recentDone > 0) {
    const handled = done.length > 0
      ? `${done.length} priorities closed`
      : '';
    const tasks = recentDone > 0
      ? `${recentDone} tasks auto-completed`
      : '';
    const combined = [handled, tasks].filter(Boolean).join(', ');
    parts.push(`Handled: ${combined}.`);
  }

  // Health
  if (portsDown.length > 0) {
    parts.push(`Health: ${portsDown.map(p => p.name).join(', ')} down.`);
  } else {
    parts.push('All services up.');
  }

  // Blockers
  if (blocked.length > 0) {
    parts.push(`Blocked: ${blocked.map(p => p.title).join(', ')}.`);
  } else if (recentBlockers > 0) {
    parts.push(`${recentBlockers} blocker${recentBlockers > 1 ? 's' : ''} logged — check orchestration log.`);
  } else {
    parts.push('Blocked: none.');
  }

  // This week lookahead
  if (thisWeek.length > 0) {
    parts.push(`This week: ${thisWeek.length} items queued (${thisWeek.slice(0, 2).map(p => p.title).join(', ')}${thisWeek.length > 2 ? ', ...' : ''}).`);
  }

  // Sign off
  const lastThought = thinking.length > 0 ? thinking[thinking.length - 1] : '';
  const restingMatch = lastThought.match(/Resting/);
  if (restingMatch) {
    parts.push('Daemon resting. All quiet.');
  } else if (recentSpawns > 0) {
    parts.push(`Daemon active — ${recentSpawns} workers spawned recently.`);
  }

  return parts.join(' ');
}

// === WEEKLY DIGEST ===

export async function generateWeeklyDigest(): Promise<string> {
  const priorities = loadPriorities();
  const orchLog = loadRecentOrchLog(100); // larger window for weekly

  const active = priorities.filter(p => p.status === 'active');
  const blocked = priorities.filter(p => p.status === 'blocked');
  const done = priorities.filter(p => p.status === 'done');

  const totalSpawns = orchLog.filter(e => e.type === 'worker_spawned').length;
  const totalDone = orchLog.filter(e => e.type === 'task_update' && e.status === 'done').length;
  const totalBlockers = orchLog.filter(e => e.type === 'blocker').length;
  const totalHeals = orchLog.filter(e => e.type === 'auto_heal').length;

  const parts: string[] = [];

  parts.push(`TARX weekly. Done: ${done.length}. Active: ${active.length}. Blocked: ${blocked.length}.`);

  if (totalSpawns > 0 || totalDone > 0) {
    parts.push(`Daemon: ${totalSpawns} workers spawned, ${totalDone} tasks completed, ${totalHeals} auto-heals.`);
  }

  if (totalBlockers > 0) {
    parts.push(`${totalBlockers} blockers hit this week.`);
  }

  if (blocked.length > 0) {
    parts.push(`Blocked: ${blocked.map(p => `${p.title} — ${p.context}`).join('. ')}.`);
  }

  // Top active items
  const nowItems = active.filter(p => p.urgency === 'now');
  if (nowItems.length > 0) {
    parts.push(`Still urgent: ${nowItems.map(p => p.title).join(', ')}.`);
  }

  parts.push('Full log at ~/.tarx/priorities.jsonl.');

  return parts.join(' ');
}
