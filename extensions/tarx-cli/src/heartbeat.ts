/**
 * TARX Heartbeat — The breathing daemon.
 *
 * TARX draws energy, therefore it runs. It's always thinking, but not always acting.
 * The heartbeat is TARX breathing. Escalation is TARX reacting.
 *
 * Runs every 5 minutes via launchd. Each tick:
 *   1. Check ports (11435, 11436, 11437)
 *   2. Check git status (uncommitted changes)
 *   3. Read breaker state
 *   4. Poll Sentry for new issues
 *   5. Write results to ~/.tarx/thinking.log
 *   6. Escalate ONLY on real problems
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, statSync, renameSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { config } from 'dotenv';
import { daemonTick } from './daemon/tick';

// Load .env from repo root
config({ path: resolve(__dirname, '../../../.env') });

const TARX_DIR = resolve(homedir(), '.tarx');
const THINKING_LOG = resolve(TARX_DIR, 'thinking.log');
const SENTRY_CURSOR = resolve(TARX_DIR, 'sentry-cursor.json');
const BREAKER_FILE = resolve(TARX_DIR, 'breaker.json');
const TARX_ROOT = resolve(homedir(), 'Desktop/tarx-code-oss');

const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_LOG_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const PORTS = [
	{ port: 11435, name: 'Inference' },
	{ port: 11436, name: 'Mesh' },
	{ port: 11437, name: 'Embeddings' },
];

// --- Logging ---

function ensureDir(): void {
	if (!existsSync(TARX_DIR)) {
		mkdirSync(TARX_DIR, { recursive: true });
	}
}

function think(message: string): void {
	ensureDir();
	const ts = new Date().toISOString();
	appendFileSync(THINKING_LOG, `[${ts}] ${message}\n`);
}

function rotateLog(): void {
	if (!existsSync(THINKING_LOG)) return;

	const stat = statSync(THINKING_LOG);
	const ageMs = Date.now() - stat.mtimeMs;
	const tooBig = stat.size > MAX_LOG_BYTES;
	const tooOld = ageMs > MAX_LOG_AGE_MS;

	if (tooBig || tooOld) {
		const backup = THINKING_LOG + '.1';
		if (existsSync(backup)) {
			// Delete old backup before rotating
			writeFileSync(backup, '');
		}
		renameSync(THINKING_LOG, backup);
		think(`Log rotated. Previous log was ${(stat.size / 1024 / 1024).toFixed(1)}MB, ${Math.floor(ageMs / 86400000)}d old.`);
	}
}

// --- Port Checks (uses http module — more reliable under launchd sandbox) ---

import * as http from 'http';

interface PortResult {
	port: number;
	name: string;
	healthy: boolean;
}

function checkPort(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			resolve(false);
		}, 3000);

		const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
			clearTimeout(timer);
			resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400);
			res.resume(); // drain
		});

		req.on('error', () => {
			clearTimeout(timer);
			resolve(false);
		});

		req.on('timeout', () => {
			clearTimeout(timer);
			req.destroy();
			resolve(false);
		});
	});
}

async function checkPorts(): Promise<PortResult[]> {
	const results = await Promise.all(
		PORTS.map(async ({ port, name }) => ({
			port,
			name,
			healthy: await checkPort(port),
		}))
	);
	return results;
}

// --- Git Status ---

interface GitResult {
	clean: boolean;
	summary: string;
}

function checkGit(): GitResult {
	try {
		const output = execSync('git status --porcelain', {
			cwd: TARX_ROOT,
			encoding: 'utf-8',
			timeout: 5000,
		}).trim();

		if (!output) {
			return { clean: true, summary: 'clean' };
		}

		const lines = output.split('\n').length;
		return { clean: false, summary: `${lines} changed` };
	} catch {
		return { clean: true, summary: 'unknown (git error)' };
	}
}

// --- Breaker ---

interface BreakerResult {
	dispatchesLastHour: number;
	limit: number;
	hot: boolean;
}

function checkBreaker(): BreakerResult {
	const limit = 20;
	try {
		if (!existsSync(BREAKER_FILE)) {
			return { dispatchesLastHour: 0, limit, hot: false };
		}
		const data = JSON.parse(readFileSync(BREAKER_FILE, 'utf-8'));
		const hourAgo = Date.now() - 3600000;

		// Count dispatches in last hour from the dispatch log
		let count = 0;
		if (Array.isArray(data.dispatches)) {
			count = data.dispatches.filter((d: any) => new Date(d.timestamp).getTime() > hourAgo).length;
		} else if (typeof data.dispatchesLastHour === 'number') {
			count = data.dispatchesLastHour;
		}

		return { dispatchesLastHour: count, limit, hot: count > 15 };
	} catch {
		return { dispatchesLastHour: 0, limit, hot: false };
	}
}

// --- Sentry ---

interface SentryResult {
	newIssues: number;
	critical: SentryIssue[];
	checked: boolean;
}

interface SentryIssue {
	id: string;
	title: string;
	level: string;
}

async function checkSentry(): Promise<SentryResult> {
	const token = process.env.SENTRY_AUTH_TOKEN;
	if (!token) {
		return { newIssues: 0, critical: [], checked: false };
	}

	try {
		// Read cursor (last seen issue ID)
		let lastSeenId = '';
		if (existsSync(SENTRY_CURSOR)) {
			const cursor = JSON.parse(readFileSync(SENTRY_CURSOR, 'utf-8'));
			lastSeenId = cursor.lastSeenId || '';
		}

		const issues = await new Promise<any[]>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('timeout')), 5000);
			const url = new URL('https://sentry.io/api/0/projects/tarx-fo/workbench/issues/');
			url.searchParams.set('query', 'is:unresolved');
			url.searchParams.set('sort', 'date');
			url.searchParams.set('limit', '25');

			const https = require('https') as typeof import('https');
			const req = https.get(url.toString(), {
				headers: { Authorization: `Bearer ${token}` },
			}, (res) => {
				if (!res.statusCode || res.statusCode >= 400) {
					clearTimeout(timer);
					res.resume();
					resolve([]);
					return;
				}
				let body = '';
				res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
				res.on('end', () => {
					clearTimeout(timer);
					try {
						resolve(JSON.parse(body));
					} catch {
						resolve([]);
					}
				});
			});
			req.on('error', () => { clearTimeout(timer); reject(new Error('network')); });
			req.on('timeout', () => { clearTimeout(timer); req.destroy(); reject(new Error('timeout')); });
		});

		// Find issues newer than our cursor
		let newIssues: any[] = [];
		if (lastSeenId && issues.length > 0) {
			const cursorIndex = issues.findIndex((i: any) => i.id === lastSeenId);
			if (cursorIndex === -1) {
				// Cursor issue not in results — all are new
				newIssues = issues;
			} else {
				newIssues = issues.slice(0, cursorIndex);
			}
		} else if (!lastSeenId && issues.length > 0) {
			// First run — don't flag everything, just set cursor
			newIssues = [];
		}

		// Update cursor
		if (issues.length > 0) {
			ensureDir();
			writeFileSync(SENTRY_CURSOR, JSON.stringify({
				lastSeenId: issues[0].id,
				lastChecked: new Date().toISOString(),
			}));
		}

		const critical = newIssues
			.filter((i: any) => i.level === 'fatal' || i.level === 'error')
			.map((i: any) => ({ id: i.id, title: i.title, level: i.level }));

		return { newIssues: newIssues.length, critical, checked: true };
	} catch {
		return { newIssues: 0, critical: [], checked: false };
	}
}

// --- Escalation ---

function escalatePortDown(portResult: PortResult): void {
	think(`⚠️ Port ${portResult.port} (${portResult.name}) DOWN. Attempting heal...`);
	try {
		execSync(`node ${resolve(__dirname, 'index.js')} heal`, {
			cwd: TARX_ROOT,
			encoding: 'utf-8',
			timeout: 60000,
			stdio: 'pipe',
		});
		think(`✅ Heal command completed for ${portResult.name}. Verifying...`);
	} catch (e: any) {
		think(`🔴 Heal failed for ${portResult.name}: ${e.message?.substring(0, 200)}`);
	}
}

function escalateSentry(issue: SentryIssue): void {
	think(`🔴 Sentry ${issue.level.toUpperCase()}: '${issue.title}'. Dispatching fix.`);
	try {
		const prompt = `fix: ${issue.title}`;
		// Fire and forget — dispatch is async, we just spawn it
		const child = spawn('node', [resolve(__dirname, 'index.js'), 'dispatch', prompt], {
			cwd: TARX_ROOT,
			detached: true,
			stdio: 'ignore',
		});
		child.unref();
	} catch (e: any) {
		think(`🔴 Dispatch failed for Sentry issue: ${e.message?.substring(0, 200)}`);
	}
}

function escalateBreakerHot(breaker: BreakerResult): void {
	think(`⚠️ Breaker hot: ${breaker.dispatchesLastHour}/${breaker.limit} hourly dispatches. Notifying.`);
	try {
		execSync(
			`node ${resolve(__dirname, 'index.js')} notify --level=warning "breaker hot: ${breaker.dispatchesLastHour}/${breaker.limit} dispatches in last hour"`,
			{ cwd: TARX_ROOT, encoding: 'utf-8', timeout: 15000, stdio: 'pipe' }
		);
	} catch {
		// Notification is best-effort
	}
}

// --- Tick ---

export async function tick(): Promise<void> {
	rotateLog();

	// 1. Ports
	const ports = await checkPorts();
	const portsUp = ports.filter(p => p.healthy).length;
	const portsTotal = ports.length;
	const portsDown = ports.filter(p => !p.healthy);

	// 2. Git
	const git = checkGit();

	// 3. Breaker
	const breaker = checkBreaker();

	// 4. Sentry
	const sentry = await checkSentry();

	// 5. Log the thinking
	const sentryStr = sentry.checked
		? `${sentry.newIssues} new`
		: 'skipped (no token)';

	if (portsDown.length === 0 && sentry.critical.length === 0 && !breaker.hot) {
		// All quiet — rest
		think(
			`Ports: ${portsUp}/${portsTotal} up. ` +
			`Git: ${git.summary}. ` +
			`Sentry: ${sentryStr}. ` +
			`Breaker: ${breaker.dispatchesLastHour}/${breaker.limit}. ` +
			`Resting.`
		);
	} else {
		// Something needs attention
		think(
			`Ports: ${portsUp}/${portsTotal} up. ` +
			`Git: ${git.summary}. ` +
			`Sentry: ${sentryStr}. ` +
			`Breaker: ${breaker.dispatchesLastHour}/${breaker.limit}. ` +
			`Acting.`
		);
	}

	// 6. Escalate
	for (const down of portsDown) {
		escalatePortDown(down);
	}

	for (const issue of sentry.critical) {
		escalateSentry(issue);
	}

	if (breaker.hot) {
		escalateBreakerHot(breaker);
	}

	// 7. Daemon: read orchestration log, decide, act
	try {
		await daemonTick();
	} catch (e: any) {
		think(`DAEMON: tick failed: ${e.message?.substring(0, 200)}`);
	}
}

// --- CLI: tarx wake ---

const TICK_TIMEOUT_MS = 30000; // 30s hard ceiling — tick must never hang

if (require.main === module) {
	const hardTimeout = setTimeout(() => {
		think('🔴 Tick killed by hard timeout (30s). Something hung.');
		process.exit(2);
	}, TICK_TIMEOUT_MS);
	hardTimeout.unref(); // don't keep process alive just for the timer

	tick()
		.then(() => { clearTimeout(hardTimeout); process.exit(0); })
		.catch((e) => {
			clearTimeout(hardTimeout);
			think(`🔴 Tick crashed: ${e.message}`);
			console.error(`Heartbeat tick failed: ${e.message}`);
			process.exit(1);
		});
}
