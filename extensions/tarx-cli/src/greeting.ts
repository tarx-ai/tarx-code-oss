/**
 * TARX CLI — Sentient greeting engine.
 * Proactive status + memory recall on every invocation.
 */

import { homedir } from 'os';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

interface ServiceStatus {
	name: string;
	port: number;
	up: boolean;
}

interface PrioritySummary {
	active: number;
	blocked: number;
	done: number;
	topUrgent: string[];
}

async function checkService(port: number, name: string): Promise<ServiceStatus> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2000);
		const res = await fetch(`http://localhost:${port}/health`, { signal: controller.signal });
		clearTimeout(timeout);
		return { name, port, up: res.ok };
	} catch {
		return { name, port, up: false };
	}
}

function loadPriorities(): PrioritySummary {
	const priPath = resolve(homedir(), '.tarx/priorities.jsonl');
	const result: PrioritySummary = { active: 0, blocked: 0, done: 0, topUrgent: [] };

	if (!existsSync(priPath)) return result;

	const raw = readFileSync(priPath, 'utf-8').trim();
	if (!raw) return result;

	const items = raw.split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

	for (const p of items) {
		if (p.status === 'active') {
			result.active++;
			if (p.urgency === 'now' || p.urgency === 'today') {
				result.topUrgent.push(p.title);
			}
		} else if (p.status === 'blocked') {
			result.blocked++;
		} else if (p.status === 'done') {
			result.done++;
		}
	}
	return result;
}

function getLastThought(): string | null {
	const thinkLog = resolve(homedir(), '.tarx/thinking.log');
	if (!existsSync(thinkLog)) return null;

	const raw = readFileSync(thinkLog, 'utf-8').trim();
	if (!raw) return null;

	const lines = raw.split('\n');
	const last = lines[lines.length - 1];
	// Truncate to 80 chars for greeting
	return last.length > 80 ? last.slice(0, 77) + '...' : last;
}

function getRecentOrchAction(): string | null {
	const logPath = resolve(homedir(), 'Library/Application Support/tarx/orchestration-log.jsonl');
	if (!existsSync(logPath)) return null;

	try {
		const raw = readFileSync(logPath, 'utf-8').trim();
		if (!raw) return null;
		const lines = raw.split('\n');
		const last = lines[lines.length - 1];
		const entry = JSON.parse(last);
		if (entry.action || entry.task) {
			return entry.action || entry.task;
		}
	} catch {
		// Ignore parse errors
	}
	return null;
}

export async function greet(): Promise<void> {
	// Parallel: services + priorities + memory
	const [services, priorities] = await Promise.all([
		Promise.all([
			checkService(11435, 'Inference'),
			checkService(11436, 'Mesh'),
			checkService(11437, 'Embeddings'),
		]),
		Promise.resolve(loadPriorities()),
	]);

	const upCount = services.filter(s => s.up).length;
	const totalServices = services.length;
	const allUp = upCount === totalServices;

	const serviceStr = allUp
		? 'all services up'
		: `${upCount}/${totalServices} services up`;

	const needYou = priorities.active + priorities.blocked;
	const priorityStr = needYou > 0
		? `${needYou} ${needYou === 1 ? 'priority needs' : 'priorities need'} you`
		: 'plate is clear';

	// Main greeting line
	console.log(`\nTARX alive \u2014 ${priorityStr}, ${serviceStr}`);

	// Service detail if any down
	if (!allUp) {
		const down = services.filter(s => !s.up);
		console.log(`  \u26a0  Down: ${down.map(s => `${s.name} :${s.port}`).join(', ')}`);
	}

	// Blocked items callout
	if (priorities.blocked > 0) {
		console.log(`  \u26a0  ${priorities.blocked} blocked \u2014 run 'tarx priorities' to review`);
	}

	// Top urgent items (max 3)
	if (priorities.topUrgent.length > 0) {
		const show = priorities.topUrgent.slice(0, 3);
		for (const t of show) {
			console.log(`  \u25b8 ${t}`);
		}
	}

	// Last autonomous action
	const lastAction = getRecentOrchAction();
	if (lastAction) {
		console.log(`  Last action: ${lastAction}`);
	}

	// Last thought
	const thought = getLastThought();
	if (thought) {
		console.log(`  Last thought: ${thought}`);
	}

	// Auto-suggest
	console.log(`\n  Suggested: tarx brief`);
	console.log('');
}
