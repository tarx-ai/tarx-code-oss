/**
 * TARX CLI — Sentient greeting engine.
 * Proactive status + memory recall on every invocation.
 */

import { homedir } from 'os';
import { resolve } from 'path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { box } from './feedback';
import { brand, icon, header, cta, footer, section } from './format';

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

function getRecentThoughts(n: number = 3): string[] {
	const thinkLog = resolve(homedir(), '.tarx/thinking.log');
	if (!existsSync(thinkLog)) return [];

	try {
		const raw = readFileSync(thinkLog, 'utf-8').trim();
		if (!raw) return [];
		const lines = raw.split('\n');
		return lines.slice(-n).map(l => {
			const stripped = l.replace(/^\[\d{4}-[^\]]+\]\s*/, '');
			return stripped.length > 68 ? stripped.slice(0, 65) + '...' : stripped;
		});
	} catch {
		return [];
	}
}

function getDaemonStatus(): string {
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
		} catch { /* ignore */ }
		return { branch, dirty };
	} catch {
		return null;
	}
}

function isFirstRun(): boolean {
	const marker = resolve(homedir(), '.tarx/first_run_complete');
	return !existsSync(marker);
}

function markFirstRunComplete(): void {
	const tarxDir = resolve(homedir(), '.tarx');
	if (!existsSync(tarxDir)) {
		mkdirSync(tarxDir, { recursive: true });
	}
	writeFileSync(resolve(tarxDir, 'first_run_complete'), new Date().toISOString());
}

export async function greet(): Promise<void> {
	const firstRun = isFirstRun();

	// Parallel: services + priorities
	const [services, priorities] = await Promise.all([
		Promise.all([
			checkService(11435, 'Inference'),
			checkService(11436, 'Mesh'),
			checkService(11437, 'Embeddings'),
		]),
		Promise.resolve(loadPriorities()),
	]);

	const upCount = services.filter(s => s.up).length;
	const allUp = upCount === services.length;

	// ── First-run welcome ──
	if (firstRun) {
		markFirstRunComplete();

		console.log();
		console.log(`  ╔══════════════════════════════════════════════════════╗`);
		console.log(`  ║                                                      ║`);
		console.log(`  ║   ${brand.tarx()} — Local AI That Belongs to You              ║`);
		console.log(`  ║                                                      ║`);
		console.log(`  ║   ${brand.dim('Free forever. No tokens. No limits. No catch.')}     ║`);
		console.log(`  ║                                                      ║`);
		console.log(`  ╚══════════════════════════════════════════════════════╝`);

		section('Setting up...');
		for (const s of services) {
			if (s.up) {
				console.log(`  ${icon.success} ${s.name} ready on :${s.port}`);
			} else {
				console.log(`  ${icon.dot.down} ${s.name} not running ${brand.dim(`(:${s.port})`)}`);
			}
		}

		cta('Start working', 'tarx chat "explain this codebase"');
		footer('local', { version: '1.2.0' });
		return;
	}

	// ── Normal branded greeting ──
	header('Local AI That Belongs to You');

	// Context line: time + git + cwd
	const greeting = getTimeGreeting();
	const git = getGitContext();
	let contextLine = `  ${brand.bold(greeting + '.')}`;
	if (git) {
		const dirtyLabel = git.dirty > 0
			? brand.yellow(`${git.dirty} changed`)
			: brand.green('clean');
		contextLine += `  ${brand.dim(git.branch)} · ${dirtyLabel}`;
	}
	const cwd = process.cwd();
	const home = homedir();
	const displayCwd = cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
	contextLine += `  ${brand.dim(displayCwd)}`;
	console.log(contextLine);

	// Services — compact inline
	const svcParts: string[] = [];
	for (const s of services) {
		const si = s.up ? icon.dot.up : icon.dot.down;
		svcParts.push(`${si} ${s.name}`);
	}
	const daemon = getDaemonStatus();
	const daemonIcon = daemon === 'active' ? icon.dot.up : daemon === 'recent' ? icon.dot.warn : icon.dot.idle;
	svcParts.push(`${daemonIcon} Daemon`);
	console.log(`  ${brand.dim('Services:')} ${svcParts.join('  ')}`);

	// Priorities (boxed)
	const needYou = priorities.active + priorities.blocked;
	if (needYou > 0) {
		const Y = '\x1b[33m';
		const R = '\x1b[31m';
		const D = '\x1b[2m';
		const RST = '\x1b[0m';
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

	// Recent thoughts (compact)
	const thoughts = getRecentThoughts(3);
	if (thoughts.length > 0) {
		const D = '\x1b[2m';
		const RST = '\x1b[0m';
		const memLines: string[] = [];
		for (const t of thoughts) {
			memLines.push(`  ${D}${t}${RST}`);
		}
		box('Memory', memLines);
	}

	// Adaptive suggestion
	let suggest = 'brief';
	if (!allUp) suggest = 'doctor';
	else if (priorities.topUrgent.length > 0) suggest = 'priorities';
	else if (priorities.blocked > 0) suggest = 'priorities';
	else if (daemon === 'idle') suggest = 'wake';
	else if (needYou === 0) suggest = 'chat';

	cta(`${brand.bold('Suggested:')} tarx ${suggest}`, suggest);

	footer('local', { version: '1.2.0' });
}
