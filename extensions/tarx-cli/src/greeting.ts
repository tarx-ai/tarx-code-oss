/**
 * TARX CLI — Sentient greeting engine.
 * Proactive status + memory recall on every invocation.
 */

import { homedir } from 'os';
import { resolve } from 'path';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { printBanner, box, divider } from './feedback';

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

function getRecentThoughts(n: number = 5): string[] {
	const thinkLog = resolve(homedir(), '.tarx/thinking.log');
	if (!existsSync(thinkLog)) return [];

	try {
		const raw = readFileSync(thinkLog, 'utf-8').trim();
		if (!raw) return [];
		const lines = raw.split('\n');
		return lines.slice(-n).map(l => {
			// Strip timestamp prefix for display, truncate
			const stripped = l.replace(/^\[\d{4}-[^\]]+\]\s*/, '');
			return stripped.length > 72 ? stripped.slice(0, 69) + '...' : stripped;
		});
	} catch {
		return [];
	}
}

function getRecentOrchActions(n: number = 3): string[] {
	const logPath = resolve(homedir(), 'Library/Application Support/tarx/orchestration-log.jsonl');
	if (!existsSync(logPath)) return [];

	try {
		const raw = readFileSync(logPath, 'utf-8').trim();
		if (!raw) return [];
		const lines = raw.split('\n').slice(-n);
		const results: string[] = [];
		for (const line of lines) {
			try {
				const entry = JSON.parse(line);
				const type = entry.type || 'unknown';
				const status = entry.status || '';
				const ts = entry.ts ? new Date(entry.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
				const detail = entry.action || entry.task || entry.taskId || entry.prompt?.substring(0, 40) || '';
				results.push(`${ts} ${type}${detail ? ': ' + detail : ''}${status ? ' [' + status + ']' : ''}`);
			} catch { /* skip */ }
		}
		return results;
	} catch {
		return [];
	}
}

function getDaemonStatus(): string {
	// Check if daemon was recently active (last orch entry < 10 min old)
	const logPath = resolve(homedir(), 'Library/Application Support/tarx/orchestration-log.jsonl');
	if (!existsSync(logPath)) return 'idle';
	try {
		const raw = readFileSync(logPath, 'utf-8').trim();
		if (!raw) return 'idle';
		const last = raw.split('\n').pop();
		if (!last) return 'idle';
		const entry = JSON.parse(last);
		const age = Date.now() - new Date(entry.ts).getTime();
		if (age < 10 * 60 * 1000) return 'active';
		if (age < 60 * 60 * 1000) return 'recent';
		return 'idle';
	} catch {
		return 'idle';
	}
}

function getTimeGreeting(): string {
	const hour = new Date().getHours();
	if (hour < 12) return 'Good morning';
	if (hour < 17) return 'Good afternoon';
	if (hour < 21) return 'Good evening';
	return 'Late night';
}

function getGitContext(): { branch: string; dirty: number } | null {
	try {
		const branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['pipe', 'pipe', 'pipe'] })
			.toString().trim();
		let dirty = 0;
		try {
			const status = execSync('git status --porcelain', { stdio: ['pipe', 'pipe', 'pipe'] })
				.toString().trim();
			if (status) {
				dirty = status.split('\n').length;
			}
		} catch { /* not a git error, just no changes */ }
		return { branch, dirty };
	} catch {
		return null;
	}
}

function isFirstRun(): boolean {
	const tarxDir = resolve(homedir(), '.tarx');
	return !existsSync(tarxDir);
}

function ensureTarxDir(): void {
	const tarxDir = resolve(homedir(), '.tarx');
	if (!existsSync(tarxDir)) {
		mkdirSync(tarxDir, { recursive: true });
	}
}

export async function greet(): Promise<void> {
	const firstRun = isFirstRun();

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

	const G = '\x1b[32m';
	const R = '\x1b[31m';
	const Y = '\x1b[33m';
	const D = '\x1b[2m';
	const B = '\x1b[1m';
	const P = '\x1b[35m';
	const RST = '\x1b[0m';

	// ASCII banner
	printBanner();

	// Time greeting + git context
	const greeting = getTimeGreeting();
	const git = getGitContext();
	let contextLine = `  ${B}${greeting}.${RST}`;
	if (git) {
		const dirtyLabel = git.dirty > 0 ? `${Y}${git.dirty} file${git.dirty === 1 ? '' : 's'} changed${RST}` : `${G}clean${RST}`;
		contextLine += `  ${D}${git.branch}${RST} · ${dirtyLabel}`;
	}
	const cwd = process.cwd();
	const home = homedir();
	const displayCwd = cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
	contextLine += `  ${D}${displayCwd}${RST}`;
	console.log(contextLine);

	// First-run welcome
	if (firstRun) {
		ensureTarxDir();
		console.log('');
		console.log(`  ${P}Welcome to TARX${RST} — your local AI development agent.`);
		console.log(`  ${D}Get started:${RST}`);
		console.log(`    ${B}tarx status${RST}    Check service health`);
		console.log(`    ${B}tarx chat${RST}      Talk to your local LLM`);
		console.log(`    ${B}tarx --help${RST}    See all commands`);
		divider();
		console.log('');

		console.log(`  ${B}Suggested:${RST} tarx status    ${D}|  chat · brief · --help${RST}`);
		console.log('');
		return;
	}

	// Service status — compact single line
	const svcParts: string[] = [];
	for (const s of services) {
		const icon = s.up ? `${G}●${RST}` : `${R}●${RST}`;
		svcParts.push(`${icon} ${s.name}`);
	}
	const daemon = getDaemonStatus();
	const daemonIcon = daemon === 'active' ? `${G}●${RST}` : daemon === 'recent' ? `${Y}●${RST}` : `${D}○${RST}`;
	svcParts.push(`${daemonIcon} Daemon`);
	console.log(`  ${D}Services:${RST} ${svcParts.join('  ')}`);

	// Priorities
	const needYou = priorities.active + priorities.blocked;
	if (needYou > 0) {
		const priLines: string[] = [];
		if (priorities.topUrgent.length > 0) {
			for (const t of priorities.topUrgent.slice(0, 3)) {
				priLines.push(`${Y}\u25b8${RST} ${t}`);
			}
		}
		if (priorities.blocked > 0) {
			priLines.push(`${R}\u25b8${RST} ${priorities.blocked} blocked`);
		}
		priLines.push(`${D}${priorities.active} active, ${priorities.done} done${RST}`);
		box('Priorities', priLines);
	}

	// Memory context — recent thoughts (last 5) + orch actions (last 3)
	const thoughts = getRecentThoughts(5);
	const orchActions = getRecentOrchActions(3);

	if (thoughts.length > 0 || orchActions.length > 0) {
		const memLines: string[] = [];
		if (orchActions.length > 0) {
			memLines.push(`${D}─ Recent actions ─${RST}`);
			for (const a of orchActions) {
				memLines.push(`  ${D}${a}${RST}`);
			}
		}
		if (thoughts.length > 0) {
			memLines.push(`${D}─ Last thoughts ─${RST}`);
			for (const t of thoughts) {
				memLines.push(`  ${D}${t}${RST}`);
			}
		}
		box('Memory', memLines);
	}

	// Adaptive suggestion based on state
	let suggest = 'brief';
	if (!allUp) suggest = 'doctor';
	else if (priorities.topUrgent.length > 0) suggest = 'priorities';
	else if (priorities.blocked > 0) suggest = 'priorities';
	else if (daemon === 'idle') suggest = 'wake';
	else if (needYou === 0) suggest = 'chat';

	console.log(`\n  ${B}Suggested:${RST} tarx ${suggest}    ${D}|  status · brief · search · build · chat · mesh${RST}`);
	console.log('');
}
