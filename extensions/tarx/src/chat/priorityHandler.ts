/**
 * TARX Priority Handler — Conversational task management via @tarx chat.
 *
 * Reads/writes ~/.tarx/priorities.jsonl and related data files.
 * Follows the same intent-detection pattern as agents/agentHub.ts.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import * as http from 'http';

// === Paths ===

const PRIORITIES_PATH = resolve(homedir(), '.tarx/priorities.jsonl');
const ORCH_LOG_PATH = resolve(homedir(), 'Library/Application Support/tarx/orchestration-log.jsonl');
const THINKING_LOG = resolve(homedir(), '.tarx/thinking.log');

// === Types ===

export interface Priority {
	ts: string;
	id: string;
	title: string;
	status: string;  // active | blocked | done | waiting_review
	owner: string;
	urgency: string; // now | today | this_week
	context: string;
	last_updated: string;
}

export type PriorityIntent =
	| { type: 'show_brief' }
	| { type: 'add'; title: string; urgency: string }
	| { type: 'mark_done'; title: string }
	| { type: 'show_blocked' }
	| { type: 'show_thinking' }
	| { type: 'weekly_digest' }
	| null;

// === Intent Patterns ===

const INTENT_PATTERNS: Array<{ pattern: RegExp; extract: (m: RegExpMatchArray) => PriorityIntent }> = [
	// Brief / show priorities
	{ pattern: /^(?:what'?s on my plate|my plate|priorities|briefing|morning|brief|what should I work on)$/i, extract: () => ({ type: 'show_brief' }) },
	{ pattern: /^show\s+(?:my\s+)?priorities$/i, extract: () => ({ type: 'show_brief' }) },
	{ pattern: /^what(?:'s| is)\s+(?:the\s+)?status$/i, extract: () => ({ type: 'show_brief' }) },

	// Add priority
	{ pattern: /^add(?:\s+(?:task|priority))?:\s*(.+)$/i, extract: m => parseAddIntent(m[1].trim()) },
	{ pattern: /^new\s+(?:task|priority):\s*(.+)$/i, extract: m => parseAddIntent(m[1].trim()) },

	// Mark done
	{ pattern: /^(.+?)\s+is\s+done$/i, extract: m => ({ type: 'mark_done', title: m[1].trim() }) },
	{ pattern: /^mark\s+(.+?)\s+done$/i, extract: m => ({ type: 'mark_done', title: m[1].trim() }) },
	{ pattern: /^shipped\s+(.+)$/i, extract: m => ({ type: 'mark_done', title: m[1].trim() }) },
	{ pattern: /^done\s+with\s+(.+)$/i, extract: m => ({ type: 'mark_done', title: m[1].trim() }) },
	{ pattern: /^finished\s+(.+)$/i, extract: m => ({ type: 'mark_done', title: m[1].trim() }) },

	// Blocked
	{ pattern: /^(?:what'?s\s+blocked|blockers|show\s+blockers)$/i, extract: () => ({ type: 'show_blocked' }) },

	// Thinking log
	{ pattern: /^(?:what did you do|overnight|thinking\s*log|show\s+thinking)$/i, extract: () => ({ type: 'show_thinking' }) },
	{ pattern: /^what did (?:you|tarx) do overnight$/i, extract: () => ({ type: 'show_thinking' }) },

	// Weekly digest
	{ pattern: /^(?:weekly|weekly\s+digest|week\s+summary|weekly\s+summary)$/i, extract: () => ({ type: 'weekly_digest' }) },
];

function parseAddIntent(raw: string): PriorityIntent {
	let urgency = 'today';
	let title = raw;

	// Extract urgency suffix: "..., urgent" or "..., this week"
	const urgencyMatch = title.match(/,\s*(urgent|now|this\s+week|today)\s*$/i);
	if (urgencyMatch) {
		const tag = urgencyMatch[1].toLowerCase().replace(/\s+/g, '_');
		if (tag === 'urgent' || tag === 'now') {
			urgency = 'now';
		} else if (tag === 'this_week') {
			urgency = 'this_week';
		}
		title = title.slice(0, urgencyMatch.index).trim();
	}

	return { type: 'add', title, urgency };
}

// === Intent Detection ===

export function detectPriorityIntent(prompt: string): PriorityIntent {
	const trimmed = prompt.trim();
	for (const { pattern, extract } of INTENT_PATTERNS) {
		const match = trimmed.match(pattern);
		if (match) {
			return extract(match);
		}
	}
	return null;
}

// === File I/O ===

function loadPriorities(): Priority[] {
	if (!existsSync(PRIORITIES_PATH)) { return []; }
	try {
		const raw = readFileSync(PRIORITIES_PATH, 'utf-8').trim();
		if (!raw) { return []; }
		return raw.split('\n').map(l => {
			try { return JSON.parse(l); } catch { return null; }
		}).filter(Boolean) as Priority[];
	} catch { return []; }
}

function savePriorities(priorities: Priority[]): void {
	const dir = resolve(homedir(), '.tarx');
	if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }); }
	const data = priorities.map(p => JSON.stringify(p)).join('\n') + '\n';
	writeFileSync(PRIORITIES_PATH, data, 'utf-8');
}

function loadRecentOrchLog(n = 20): Record<string, unknown>[] {
	if (!existsSync(ORCH_LOG_PATH)) { return []; }
	try {
		const raw = readFileSync(ORCH_LOG_PATH, 'utf-8').trim();
		if (!raw) { return []; }
		return raw.split('\n').slice(-n).map(l => {
			try { return JSON.parse(l); } catch { return null; }
		}).filter(Boolean) as Record<string, unknown>[];
	} catch { return []; }
}

function getThinkingTail(n = 20): string[] {
	if (!existsSync(THINKING_LOG)) { return []; }
	try {
		const raw = readFileSync(THINKING_LOG, 'utf-8').trim();
		if (!raw) { return []; }
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

function nextId(priorities: Priority[]): string {
	let max = 0;
	for (const p of priorities) {
		const m = p.id.match(/^p-(\d+)$/);
		if (m) {
			const n = parseInt(m[1], 10);
			if (n > max) { max = n; }
		}
	}
	return `p-${String(max + 1).padStart(3, '0')}`;
}

// === Handlers ===

export async function handleShowBrief(): Promise<string> {
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

	const parts: string[] = [];

	// Need you
	if (now.length > 0) {
		parts.push(`**Need you:** ${now.map(p => p.title).join(', ')}`);
	}
	if (today.length > 0) {
		parts.push(`**Today:** ${today.map(p => p.title).join(', ')}`);
	}
	if (now.length === 0 && today.length === 0) {
		parts.push('**Nothing urgent right now.**');
	}

	// Handled
	if (done.length > 0 || recentDone > 0) {
		const handledParts: string[] = [];
		if (done.length > 0) { handledParts.push(`${done.length} priorities closed`); }
		if (recentDone > 0) { handledParts.push(`${recentDone} tasks auto-completed`); }
		parts.push(`**Handled:** ${handledParts.join(', ')}`);
	}

	// Health
	if (portsDown.length > 0) {
		parts.push(`**Health:** ${portsDown.map(p => p.name).join(', ')} down`);
	} else {
		parts.push('**Health:** All services up');
	}

	// Blocked
	if (blocked.length > 0) {
		parts.push(`**Blocked:** ${blocked.map(p => `${p.title} — ${p.context}`).join('; ')}`);
	} else if (recentBlockers > 0) {
		parts.push(`**Blocked:** ${recentBlockers} blocker${recentBlockers > 1 ? 's' : ''} logged`);
	}

	// This week
	if (thisWeek.length > 0) {
		parts.push(`**This week:** ${thisWeek.length} queued (${thisWeek.slice(0, 2).map(p => p.title).join(', ')}${thisWeek.length > 2 ? ', ...' : ''})`);
	}

	// Daemon status
	const lastThought = thinking.length > 0 ? thinking[thinking.length - 1] : '';
	if (lastThought.includes('Resting')) {
		parts.push('Daemon resting. All quiet.');
	} else if (recentSpawns > 0) {
		parts.push(`Daemon active — ${recentSpawns} workers spawned recently.`);
	}

	parts.push('\nWhat do you want to hit first?');

	return parts.join('\n\n');
}

export function handleAddPriority(title: string, urgency: string = 'today'): string {
	const priorities = loadPriorities();
	const id = nextId(priorities);
	const now = new Date().toISOString().slice(0, 10);

	const newPriority: Priority = {
		ts: new Date().toISOString(),
		id,
		title,
		status: 'active',
		owner: 'john',
		urgency,
		context: '',
		last_updated: new Date().toISOString(),
	};

	priorities.push(newPriority);
	savePriorities(priorities);

	const openCount = priorities.filter(p => p.status === 'active').length;
	const urgencyLabel = urgency === 'now' ? ' (urgent)' : urgency === 'this_week' ? ' (this week)' : '';
	return `Added **${title}**${urgencyLabel}. That's now your #${openCount} open item. (\`${id}\`)`;
}

export function handleMarkDone(titleQuery: string): string {
	const priorities = loadPriorities();
	const query = titleQuery.toLowerCase();

	// Fuzzy match: case-insensitive substring
	const matches = priorities.filter(
		p => p.status !== 'done' && p.title.toLowerCase().includes(query)
	);

	if (matches.length === 0) {
		return `No open priority matching "${titleQuery}". Check \`~/.tarx/priorities.jsonl\` or type **priorities** to see the list.`;
	}

	if (matches.length > 1) {
		const list = matches.map(p => `- ${p.title} (\`${p.id}\`)`).join('\n');
		return `Multiple matches for "${titleQuery}":\n\n${list}\n\nBe more specific?`;
	}

	const target = matches[0];
	target.status = 'done';
	target.last_updated = new Date().toISOString();
	savePriorities(priorities);

	const remaining = priorities.filter(p => p.status === 'active').length;
	return `Marked **${target.title}** done. ${remaining} open item${remaining !== 1 ? 's' : ''} left.`;
}

export function handleShowBlocked(): string {
	const priorities = loadPriorities();
	const orchLog = loadRecentOrchLog(50);

	const blocked = priorities.filter(p => p.status === 'blocked');
	const urgentOpen = priorities.filter(p => p.status === 'active' && p.urgency === 'now');
	const blockers = orchLog.filter(e => e.type === 'blocker') as Array<Record<string, unknown>>;

	const parts: string[] = [];

	if (urgentOpen.length > 0) {
		parts.push('**Urgent & still open:**');
		for (const p of urgentOpen) {
			parts.push(`- ${p.title} — ${p.context || 'no context'}`);
		}
	} else {
		parts.push('No urgent open items.');
	}

	if (blockers.length > 0) {
		parts.push('\n**Recent blockers from orchestration log:**');
		for (const b of blockers.slice(-5)) {
			parts.push(`- \`${b.task_id || '?'}\`: ${b.reason || 'unknown'}`);
		}
	}

	if (blocked.length > 0) {
		parts.push('\n**Blocked priorities:**');
		for (const p of blocked) {
			parts.push(`- ${p.title} — ${p.context || 'no context'}`);
		}
	}

	if (urgentOpen.length === 0 && blockers.length === 0 && blocked.length === 0) {
		return 'Nothing blocked right now. Clear skies.';
	}

	return parts.join('\n');
}

export function handleShowThinking(): string {
	const lines = getThinkingTail(20);

	if (lines.length === 0) {
		return 'No thinking log entries yet. The daemon hasn\'t run, or `~/.tarx/thinking.log` is empty.';
	}

	const parts: string[] = ['**Recent thinking log** (last 20 entries):\n'];
	for (const line of lines) {
		// Strip timestamp for readability, keep content
		const stripped = line.replace(/^\[[\d\-T:.Z]+\]\s*/, '');
		parts.push(`- ${stripped}`);
	}

	return parts.join('\n');
}

export async function handleWeeklyDigest(): Promise<string> {
	const priorities = loadPriorities();
	const orchLog = loadRecentOrchLog(100);

	const active = priorities.filter(p => p.status === 'active');
	const blocked = priorities.filter(p => p.status === 'blocked');
	const done = priorities.filter(p => p.status === 'done');

	const totalSpawns = orchLog.filter(e => e.type === 'worker_spawned').length;
	const totalDone = orchLog.filter(e => e.type === 'task_update' && e.status === 'done').length;
	const totalBlockers = orchLog.filter(e => e.type === 'blocker').length;
	const totalHeals = orchLog.filter(e => e.type === 'auto_heal').length;

	const parts: string[] = [];

	parts.push(`**Weekly digest:** ${done.length} done, ${active.length} active, ${blocked.length} blocked.`);

	if (totalSpawns > 0 || totalDone > 0) {
		parts.push(`**Daemon:** ${totalSpawns} workers spawned, ${totalDone} tasks completed, ${totalHeals} auto-heals.`);
	}

	if (totalBlockers > 0) {
		parts.push(`${totalBlockers} blocker${totalBlockers > 1 ? 's' : ''} hit this week.`);
	}

	const nowItems = active.filter(p => p.urgency === 'now');
	if (nowItems.length > 0) {
		parts.push(`**Still urgent:** ${nowItems.map(p => p.title).join(', ')}.`);
	}

	parts.push('\nFull log at `~/.tarx/priorities.jsonl`.');

	return parts.join('\n\n');
}

// === Startup Brief ===

export function isFirstMessageToday(lastBriefDate: string | undefined): boolean {
	const today = new Date().toISOString().slice(0, 10);
	return lastBriefDate !== today;
}

export async function generateStartupBrief(): Promise<string> {
	return handleShowBrief();
}
