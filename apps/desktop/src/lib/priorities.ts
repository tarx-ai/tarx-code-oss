/**
 * TARX Priorities — shared module for reading/writing ~/.tarx/priorities.jsonl
 * from the desktop app side. Same data store as CLI `tarx priorities`.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const PRIORITIES_PATH = resolve(homedir(), '.tarx/priorities.jsonl');
const THINKING_LOG = resolve(homedir(), '.tarx/thinking.log');

export interface Priority {
	ts: string;
	id: string;
	title: string;
	status: 'active' | 'blocked' | 'done' | 'waiting_review';
	owner: string;
	urgency: 'now' | 'today' | 'this_week';
	context: string;
	last_updated: string;
}

export function readPriorities(): Priority[] {
	if (!existsSync(PRIORITIES_PATH)) { return []; }
	try {
		const raw = readFileSync(PRIORITIES_PATH, 'utf-8').trim();
		if (!raw) { return []; }
		return raw.split('\n').map(l => {
			try { return JSON.parse(l); } catch { return null; }
		}).filter(Boolean) as Priority[];
	} catch { return []; }
}

export function addPriority(
	title: string,
	urgency: 'now' | 'today' | 'this_week' = 'today',
	owner: string = 'john'
): Priority {
	const items = readPriorities();

	let maxNum = 0;
	for (const p of items) {
		const m = p.id.match(/^p-(\d+)$/);
		if (m) { const n = parseInt(m[1], 10); if (n > maxNum) { maxNum = n; } }
	}

	const now = new Date().toISOString();
	const entry: Priority = {
		ts: now,
		id: `p-${String(maxNum + 1).padStart(3, '0')}`,
		title,
		status: 'active',
		owner,
		urgency,
		context: '',
		last_updated: now,
	};

	const dir = resolve(homedir(), '.tarx');
	if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }); }
	appendFileSync(PRIORITIES_PATH, JSON.stringify(entry) + '\n');

	return entry;
}

export function markDone(id: string): Priority | null {
	const items = readPriorities();
	const target = items.find(p => p.id === id);
	if (!target || target.status === 'done') { return null; }

	target.status = 'done';
	target.last_updated = new Date().toISOString();

	const data = items.map(p => JSON.stringify(p)).join('\n') + '\n';
	writeFileSync(PRIORITIES_PATH, data, 'utf-8');

	return target;
}

export function getActive(): Priority[] {
	return readPriorities().filter(p => p.status === 'active');
}

export function getBlocked(): Priority[] {
	return readPriorities().filter(p => p.status === 'blocked');
}

export function getNeedingAttention(): Priority[] {
	return readPriorities().filter(p => p.owner === 'john' && p.status === 'active');
}

export function getThinkingTail(n = 20): string[] {
	if (!existsSync(THINKING_LOG)) { return []; }
	try {
		const raw = readFileSync(THINKING_LOG, 'utf-8').trim();
		if (!raw) { return []; }
		return raw.split('\n').slice(-n);
	} catch { return []; }
}
