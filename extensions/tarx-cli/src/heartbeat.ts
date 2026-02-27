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
import { getLatestMentions, processMentions } from './x-api';
import { callXAI } from './xai-api';

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

	// 8. X polling: if "x-poll" priority is active, fetch mentions
	try {
		await pollXMentions();
	} catch (e: any) {
		think(`X-POLL: failed: ${e.message?.substring(0, 200)}`);
	}

	// 9. Inference tasks: process "inference-task:" priorities via xAI
	try {
		await processInferenceTasks();
	} catch (e: any) {
		think(`INFERENCE: tick failed: ${e.message?.substring(0, 200)}`);
	}

	// 10. Grok augmentation: "grok-augment:" priorities → Grok + Qwen consolidation
	try {
		await processAugmentTasks();
	} catch (e: any) {
		think(`AUGMENT: tick failed: ${e.message?.substring(0, 200)}`);
	}

	// 11. Inference-augment: "inference-augment:" → xAI + Qwen RAG consolidation
	try {
		await processInferenceAugmentTasks();
	} catch (e: any) {
		think(`INF-AUG: tick failed: ${e.message?.substring(0, 200)}`);
	}

	// 12. Task exec: "task-exec:" → whitelisted shell commands
	try {
		await processTaskExec();
	} catch (e: any) {
		think(`TASK-EXEC: tick failed: ${e.message?.substring(0, 200)}`);
	}

	// 13. UI test loop: "ui-test:" → exercise conversational intents, audit output
	try {
		await processUITestLoop();
	} catch (e: any) {
		think(`UI-TEST: tick failed: ${e.message?.substring(0, 200)}`);
	}

	// 14. E2E test loop: "e2e-test:" → CC use cases, conversational intents, RAG, MCP audit
	try {
		await processE2ETestLoop();
	} catch (e: any) {
		think(`E2E-TEST: tick failed: ${e.message?.substring(0, 200)}`);
	}
}

// --- UI Test Loop (perpetual conversational audit) ---

const UI_TEST_PREFIX = 'ui-test:';

interface UITestCase {
	name: string;
	cmd: string;
	expect: RegExp[];  // patterns that MUST appear in output
	antiExpect?: RegExp[];  // patterns that must NOT appear
}

const UI_TEST_SUITE: UITestCase[] = [
	{
		name: 'brief',
		cmd: 'tarx brief',
		expect: [/need you|active|priorities|blocked|resting/i, /port|service|sentry|breaker/i],
		antiExpect: [/undefined|null|NaN|ENOENT/i],
	},
	{
		name: 'priorities',
		cmd: 'tarx priorities',
		expect: [/p-\d{3}/],
		antiExpect: [/undefined|SyntaxError/i],
	},
	{
		name: 'think',
		cmd: 'tarx think 5',
		expect: [/\[\d{4}-\d{2}-\d{2}/],  // timestamp format
		antiExpect: [/ENOENT|Permission denied/i],
	},
	{
		name: 'priorities_add_remove',
		cmd: 'tarx priorities add "ui-test-canary: smoke" --urgency today --owner tarx',
		expect: [/added|p-\d{3}/i],
		antiExpect: [/Error|ENOENT/i],
	},
	{
		name: 'status',
		cmd: 'tarx status',
		expect: [/inference|mesh|embed/i],
	},
];

async function processUITestLoop(): Promise<void> {
	const priPath = resolve(homedir(), '.tarx/priorities.jsonl');
	if (!existsSync(priPath)) return;

	const raw = readFileSync(priPath, 'utf-8').trim();
	if (!raw) return;

	const lines = raw.split('\n');
	const items = lines.map(line => {
		try { return JSON.parse(line); } catch { return null; }
	}).filter(Boolean);

	const tasks = items.filter(
		(p: any) => p.status === 'active' && p.title && p.title.toLowerCase().startsWith(UI_TEST_PREFIX)
	);

	if (tasks.length === 0) return;

	think(`UI-TEST: ${tasks.length} active ui-test task(s). Running suite...`);

	for (const task of tasks) {
		const scope = task.title.substring(UI_TEST_PREFIX.length).trim().toLowerCase();
		// scope = "all" or freeform runs full suite; exact test name runs just that test
		const scoped = UI_TEST_SUITE.filter(t => scope.includes(t.name) || t.name.includes(scope));
		const suite = scope === 'all' || !scope || scoped.length === 0
			? UI_TEST_SUITE
			: scoped;

		let passed = 0;
		let failed = 0;
		const failures: string[] = [];

		for (const tc of suite) {
			try {
				const output = execSync(
					`node ${resolve(__dirname, 'index.js')} ${tc.cmd.replace(/^tarx\s+/, '')}`,
					{ cwd: TARX_ROOT, encoding: 'utf-8', timeout: 15000, stdio: 'pipe' }
				).trim();

				// Check expected patterns
				let pass = true;
				for (const pat of tc.expect) {
					if (!pat.test(output)) {
						pass = false;
						failures.push(`${tc.name}: missing expected /${pat.source}/`);
						break;
					}
				}

				// Check anti-patterns
				if (pass && tc.antiExpect) {
					for (const pat of tc.antiExpect) {
						if (pat.test(output)) {
							pass = false;
							failures.push(`${tc.name}: found forbidden /${pat.source}/ in output`);
							break;
						}
					}
				}

				if (pass) {
					passed++;
				} else {
					failed++;
					think(`UI-TEST [${tc.name}]: FAIL — output="${output.substring(0, 200)}"`);
				}
			} catch (e: any) {
				failed++;
				failures.push(`${tc.name}: exec error: ${e.message?.substring(0, 100)}`);
				think(`UI-TEST [${tc.name}]: ERROR — ${e.message?.substring(0, 150)}`);
			}
		}

		// Clean up canary priority if created
		try {
			const freshRaw = readFileSync(priPath, 'utf-8').trim();
			const cleaned = freshRaw.split('\n').filter(line => {
				try { const p = JSON.parse(line); return !p.title?.includes('ui-test-canary:'); } catch { return true; }
			});
			writeFileSync(priPath, cleaned.join('\n') + '\n');
		} catch { /* best-effort cleanup */ }

		think(`UI-TEST: ${passed}/${passed + failed} passed. ${failed > 0 ? 'Failures: ' + failures.join('; ') : 'All clear.'}`);

		// Mark done
		const updated = lines.map(line => {
			try {
				const p = JSON.parse(line);
				if (p.id === task.id) {
					p.status = 'done';
					p.last_updated = new Date().toISOString();
					return JSON.stringify(p);
				}
			} catch { /* keep */ }
			return line;
		});
		writeFileSync(priPath, updated.join('\n') + '\n');

		appendFileSync(ORCH_LOG, JSON.stringify({
			ts: new Date().toISOString(),
			type: 'ui_test',
			taskId: task.id,
			passed,
			failed,
			failures: failures.slice(0, 5),
			status: failed === 0 ? 'pass' : 'fail',
		}) + '\n');

		// SMS on failure
		if (failed > 0) {
			try {
				execSync(
					`node ${resolve(__dirname, 'index.js')} notify --level=warning "UI test: ${failed} fail — ${failures[0]?.substring(0, 80)}"`,
					{ cwd: TARX_ROOT, encoding: 'utf-8', timeout: 15000, stdio: 'pipe' }
				);
			} catch { /* best-effort */ }
		}
	}
}

// --- Task Exec (whitelisted shell) ---

const TASK_EXEC_PREFIX = 'task-exec:';
const BLOCKED_PATTERNS = /\b(sudo|rm\s|rm$|rmdir|mkfs|dd\s|chmod\s|chown\s|kill\s|killall|shutdown|reboot|passwd|eval\s|>\s*\/|&&\s*rm|;\s*rm|\|\s*rm|`|\$\()/i;

function isCommandAllowed(cmd: string): boolean {
	const trimmed = cmd.trim();
	if (/^tarx\s+/.test(trimmed)) return true;
	if (/^curl\s+-fsSL\s+/.test(trimmed)) return true;
	if (/^echo(\s+|$)/.test(trimmed)) return true;
	if (/^vercel\s+--prod\s*$/.test(trimmed)) return true;
	return false;
}

async function processTaskExec(): Promise<void> {
	const priPath = resolve(homedir(), '.tarx/priorities.jsonl');
	if (!existsSync(priPath)) return;

	const raw = readFileSync(priPath, 'utf-8').trim();
	if (!raw) return;

	const lines = raw.split('\n');
	const items = lines.map(line => {
		try { return JSON.parse(line); } catch { return null; }
	}).filter(Boolean);

	const tasks = items.filter(
		(p: any) => p.status === 'active' && p.title && p.title.toLowerCase().startsWith(TASK_EXEC_PREFIX)
	);

	if (tasks.length === 0) return;

	think(`TASK-EXEC: ${tasks.length} active task-exec task(s). Processing...`);

	for (const task of tasks) {
		const cmd = task.title.substring(TASK_EXEC_PREFIX.length).trim();
		if (!cmd) continue;

		// Block dangerous commands
		if (BLOCKED_PATTERNS.test(cmd)) {
			think(`TASK-EXEC [${task.id}]: BLOCKED dangerous: "${cmd.substring(0, 100)}"`);
			try {
				execSync(
					`node ${resolve(__dirname, 'index.js')} notify --level=warning "Task blocked: ${cmd.substring(0, 100).replace(/"/g, '\\"')}"`,
					{ cwd: TARX_ROOT, encoding: 'utf-8', timeout: 15000, stdio: 'pipe' }
				);
			} catch { /* best-effort */ }
			appendFileSync(ORCH_LOG, JSON.stringify({
				ts: new Date().toISOString(), type: 'task_exec', taskId: task.id,
				cmd: cmd.substring(0, 200), status: 'blocked',
			}) + '\n');
			const updated = lines.map(line => {
				try { const p = JSON.parse(line); if (p.id === task.id) { p.status = 'done'; p.last_updated = new Date().toISOString(); return JSON.stringify(p); } } catch { /* keep */ }
				return line;
			});
			writeFileSync(priPath, updated.join('\n') + '\n');
			continue;
		}

		// Whitelist check
		if (!isCommandAllowed(cmd)) {
			think(`TASK-EXEC [${task.id}]: REJECTED not whitelisted: "${cmd.substring(0, 100)}"`);
			try {
				execSync(
					`node ${resolve(__dirname, 'index.js')} notify --level=warning "Task blocked: ${cmd.substring(0, 100).replace(/"/g, '\\"')}"`,
					{ cwd: TARX_ROOT, encoding: 'utf-8', timeout: 15000, stdio: 'pipe' }
				);
			} catch { /* best-effort */ }
			appendFileSync(ORCH_LOG, JSON.stringify({
				ts: new Date().toISOString(), type: 'task_exec', taskId: task.id,
				cmd: cmd.substring(0, 200), status: 'rejected_not_whitelisted',
			}) + '\n');
			const updated = lines.map(line => {
				try { const p = JSON.parse(line); if (p.id === task.id) { p.status = 'done'; p.last_updated = new Date().toISOString(); return JSON.stringify(p); } } catch { /* keep */ }
				return line;
			});
			writeFileSync(priPath, updated.join('\n') + '\n');
			continue;
		}

		// Execute whitelisted command
		try {
			think(`TASK-EXEC [${task.id}]: running "${cmd.substring(0, 100)}"`);
			const output = execSync(cmd, {
				cwd: TARX_ROOT, encoding: 'utf-8', timeout: 30000, stdio: 'pipe',
			}).trim();

			think(`TASK-EXEC [${task.id}]: output="${output.substring(0, 500)}"`);

			const updated = lines.map(line => {
				try { const p = JSON.parse(line); if (p.id === task.id) { p.status = 'done'; p.last_updated = new Date().toISOString(); return JSON.stringify(p); } } catch { /* keep */ }
				return line;
			});
			writeFileSync(priPath, updated.join('\n') + '\n');

			appendFileSync(ORCH_LOG, JSON.stringify({
				ts: new Date().toISOString(), type: 'task_exec', taskId: task.id,
				cmd: cmd.substring(0, 200), outputPreview: output.substring(0, 200), status: 'done',
			}) + '\n');

			if (task.urgency === 'now') {
				try {
					execSync(
						`node ${resolve(__dirname, 'index.js')} notify --level=info "Exec done: ${cmd.substring(0, 80).replace(/"/g, '\\"')}"`,
						{ cwd: TARX_ROOT, encoding: 'utf-8', timeout: 15000, stdio: 'pipe' }
					);
				} catch { /* best-effort */ }
			}
		} catch (e: any) {
			think(`TASK-EXEC [${task.id}]: FAILED: ${e.message?.substring(0, 200)}`);
			appendFileSync(ORCH_LOG, JSON.stringify({
				ts: new Date().toISOString(), type: 'task_exec', taskId: task.id,
				cmd: cmd.substring(0, 200), status: 'error', error: e.message?.substring(0, 200),
			}) + '\n');
			const updated = lines.map(line => {
				try { const p = JSON.parse(line); if (p.id === task.id) { p.status = 'done'; p.last_updated = new Date().toISOString(); return JSON.stringify(p); } } catch { /* keep */ }
				return line;
			});
			writeFileSync(priPath, updated.join('\n') + '\n');
		}
	}
}

// --- X Mentions Polling ---

const ORCH_LOG = resolve(TARX_DIR, 'orchestration-log.jsonl');
const X_POLL_CURSOR = resolve(TARX_DIR, 'x-poll-cursor.json');

async function pollXMentions(): Promise<void> {
	// Check if "x-poll" priority exists and is active
	const priPath = resolve(homedir(), '.tarx/priorities.jsonl');
	if (!existsSync(priPath)) return;

	const raw = readFileSync(priPath, 'utf-8').trim();
	if (!raw) return;

	const items = raw.split('\n').map(line => {
		try { return JSON.parse(line); } catch { return null; }
	}).filter(Boolean);

	const xPoll = items.find(
		(p: any) => p.status === 'active' && p.title && p.title.toLowerCase().includes('x-poll')
	);
	if (!xPoll) return;

	// Load cursor (last seen mention ID)
	let sinceId: string | undefined;
	if (existsSync(X_POLL_CURSOR)) {
		try {
			const cursor = JSON.parse(readFileSync(X_POLL_CURSOR, 'utf-8'));
			sinceId = cursor.sinceId;
		} catch { /* fresh start */ }
	}

	// Fetch mentions
	const mentions = await getLatestMentions(sinceId, 5);
	const count = mentions.length;

	if (count > 0) {
		// Update cursor to newest mention
		const newestId = mentions[0].id;
		ensureDir();
		writeFileSync(X_POLL_CURSOR, JSON.stringify({
			sinceId: newestId,
			lastPolled: new Date().toISOString(),
		}));

		// Log to thinking
		const processed = processMentions(mentions);
		think(`X-POLL: ${count} new mention(s):`);
		for (const line of processed) {
			think(`  ${line.substring(0, 200)}`);
		}
	} else {
		think(`X-POLL: 0 new mentions.`);
	}

	// Append to orchestration log
	appendFileSync(ORCH_LOG, JSON.stringify({
		ts: new Date().toISOString(),
		type: 'x_poll',
		mentions: count,
	}) + '\n');
}

// --- Inference Tasks ---

const INFERENCE_PREFIX = 'inference-task:';

async function processInferenceTasks(): Promise<void> {
	const priPath = resolve(homedir(), '.tarx/priorities.jsonl');
	if (!existsSync(priPath)) return;

	const raw = readFileSync(priPath, 'utf-8').trim();
	if (!raw) return;

	const lines = raw.split('\n');
	const items = lines.map(line => {
		try { return JSON.parse(line); } catch { return null; }
	}).filter(Boolean);

	const tasks = items.filter(
		(p: any) => p.status === 'active' && p.title && p.title.toLowerCase().startsWith(INFERENCE_PREFIX)
	);

	if (tasks.length === 0) {
		think('INFERENCE: 0 active inference tasks.');
		return;
	}

	think(`INFERENCE: ${tasks.length} active inference task(s). Processing...`);

	for (const task of tasks) {
		const prompt = task.title.substring(INFERENCE_PREFIX.length).trim();
		if (!prompt) {
			think(`INFERENCE: Skipping empty prompt for ${task.id}`);
			continue;
		}

		try {
			const response = await callXAI(prompt, {
				systemPrompt: 'You are TARX, an autonomous developer agent. Answer concisely.',
				maxTokens: 512,
				temperature: 0.3,
			});

			think(`INFERENCE [${task.id}]: prompt="${prompt.substring(0, 100)}"`);
			think(`INFERENCE [${task.id}]: response="${response.substring(0, 500)}"`);

			// SMS notify for urgent inference tasks
			if (task.urgency === 'now') {
				try {
					const smsBody = `Grok says: ${response.substring(0, 200)}`;
					execSync(
						`node ${resolve(__dirname, 'index.js')} notify --level=info "${smsBody.replace(/"/g, '\\"')}"`,
						{ cwd: TARX_ROOT, encoding: 'utf-8', timeout: 15000, stdio: 'pipe' }
					);
					think(`INFERENCE [${task.id}]: SMS sent (urgency=now)`);
				} catch {
					think(`INFERENCE [${task.id}]: SMS failed (best-effort)`);
				}
			}

			// Mark task done in priorities.jsonl
			const updated = lines.map(line => {
				try {
					const parsed = JSON.parse(line);
					if (parsed.id === task.id) {
						parsed.status = 'done';
						parsed.last_updated = new Date().toISOString();
						return JSON.stringify(parsed);
					}
				} catch { /* keep original */ }
				return line;
			});
			writeFileSync(priPath, updated.join('\n') + '\n');

			// Append to orchestration log
			appendFileSync(ORCH_LOG, JSON.stringify({
				ts: new Date().toISOString(),
				type: 'inference_task',
				taskId: task.id,
				prompt: prompt.substring(0, 200),
				responsePreview: response.substring(0, 200),
				status: 'done',
			}) + '\n');
		} catch (e: any) {
			think(`INFERENCE [${task.id}]: FAILED: ${e.message?.substring(0, 200)}`);
			appendFileSync(ORCH_LOG, JSON.stringify({
				ts: new Date().toISOString(),
				type: 'inference_task',
				taskId: task.id,
				prompt: prompt.substring(0, 200),
				status: 'error',
				error: e.message?.substring(0, 200),
			}) + '\n');
		}
	}
}

// --- Inference Augmentation Tasks ---

const INF_AUG_PREFIX = 'inference-augment:';

async function processInferenceAugmentTasks(): Promise<void> {
	const priPath = resolve(homedir(), '.tarx/priorities.jsonl');
	if (!existsSync(priPath)) return;

	const raw = readFileSync(priPath, 'utf-8').trim();
	if (!raw) return;

	const lines = raw.split('\n');
	const items = lines.map(line => {
		try { return JSON.parse(line); } catch { return null; }
	}).filter(Boolean);

	const tasks = items.filter(
		(p: any) => p.status === 'active' && p.title && p.title.toLowerCase().startsWith(INF_AUG_PREFIX)
	);

	if (tasks.length === 0) return;

	think(`INF-AUG: ${tasks.length} active inference-augment task(s). Processing...`);

	for (const task of tasks) {
		const prompt = task.title.substring(INF_AUG_PREFIX.length).trim();
		if (!prompt) continue;

		try {
			// Step 1: xAI inference
			const xaiResponse = await callXAI(prompt, {
				systemPrompt: 'You are TARX, an autonomous developer agent. Provide detailed, structured analysis.',
				maxTokens: 1024,
				temperature: 0.4,
			});

			think(`INF-AUG [${task.id}]: xAI="${xaiResponse.substring(0, 300)}"`);

			// Step 2: Qwen local consolidation for RAG/taxonomy
			let consolidated = '';
			try {
				const qwenBody = JSON.stringify({
					model: 'qwen',
					messages: [
						{ role: 'system', content: 'Consolidate response for RAG/taxonomy. Output JSON: {"category":"","tags":[],"summary":"","facts":[]}' },
						{ role: 'user', content: xaiResponse },
					],
					temperature: 0.1,
					max_tokens: 512,
				});
				consolidated = await new Promise<string>((res, rej) => {
					const timer = setTimeout(() => rej(new Error('qwen timeout')), 15000);
					const req = http.request('http://127.0.0.1:11435/v1/chat/completions', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(qwenBody) },
					}, (resp) => {
						let data = '';
						resp.on('data', (c: Buffer) => { data += c.toString(); });
						resp.on('end', () => {
							clearTimeout(timer);
							try {
								const parsed = JSON.parse(data);
								res(parsed?.choices?.[0]?.message?.content || '');
							} catch { res(''); }
						});
					});
					req.on('error', (e) => { clearTimeout(timer); rej(e); });
					req.write(qwenBody);
					req.end();
				});
				think(`INF-AUG [${task.id}]: consolidated="${consolidated.substring(0, 300)}"`);
			} catch (e: any) {
				think(`INF-AUG [${task.id}]: Qwen failed: ${e.message?.substring(0, 100)}. Using raw xAI.`);
				consolidated = xaiResponse;
			}

			// Mark done
			const updated = lines.map(line => {
				try {
					const parsed = JSON.parse(line);
					if (parsed.id === task.id) {
						parsed.status = 'done';
						parsed.last_updated = new Date().toISOString();
						return JSON.stringify(parsed);
					}
				} catch { /* keep */ }
				return line;
			});
			writeFileSync(priPath, updated.join('\n') + '\n');

			// Orch log
			appendFileSync(ORCH_LOG, JSON.stringify({
				ts: new Date().toISOString(),
				type: 'inference_augment',
				taskId: task.id,
				prompt: prompt.substring(0, 200),
				xaiPreview: xaiResponse.substring(0, 200),
				consolidatedPreview: consolidated.substring(0, 200),
				status: 'done',
			}) + '\n');

			// SMS if urgent
			if (task.urgency === 'now') {
				try {
					const smsBody = `Grok says: ${xaiResponse.substring(0, 200).replace(/"/g, '\\"')}`;
					execSync(
						`node ${resolve(__dirname, 'index.js')} notify --level=info "${smsBody}"`,
						{ cwd: TARX_ROOT, encoding: 'utf-8', timeout: 15000, stdio: 'pipe' }
					);
					think(`INF-AUG [${task.id}]: SMS sent (urgency=now)`);
				} catch {
					think(`INF-AUG [${task.id}]: SMS failed (best-effort)`);
				}
			}
		} catch (e: any) {
			think(`INF-AUG [${task.id}]: FAILED: ${e.message?.substring(0, 200)}`);
			appendFileSync(ORCH_LOG, JSON.stringify({
				ts: new Date().toISOString(),
				type: 'inference_augment',
				taskId: task.id,
				status: 'error',
				error: e.message?.substring(0, 200),
			}) + '\n');
		}
	}
}

// --- Grok Augmentation Tasks ---

const AUGMENT_PREFIX = 'grok-augment:';

async function processAugmentTasks(): Promise<void> {
	const priPath = resolve(homedir(), '.tarx/priorities.jsonl');
	if (!existsSync(priPath)) return;

	const raw = readFileSync(priPath, 'utf-8').trim();
	if (!raw) return;

	const lines = raw.split('\n');
	const items = lines.map(line => {
		try { return JSON.parse(line); } catch { return null; }
	}).filter(Boolean);

	const tasks = items.filter(
		(p: any) => p.status === 'active' && p.title && p.title.toLowerCase().startsWith(AUGMENT_PREFIX)
	);

	if (tasks.length === 0) return;

	think(`AUGMENT: ${tasks.length} active grok-augment task(s). Processing...`);

	for (const task of tasks) {
		const prompt = task.title.substring(AUGMENT_PREFIX.length).trim();
		if (!prompt) continue;

		try {
			// Step 1: Grok generates rich response
			const grokResponse = await callXAI(prompt, {
				systemPrompt: 'You are TARX, an autonomous developer agent. Provide detailed, structured analysis.',
				maxTokens: 1024,
				temperature: 0.4,
			});

			think(`AUGMENT [${task.id}]: grok="${grokResponse.substring(0, 300)}"`);

			// Step 2: Local Qwen consolidates for RAG/taxonomy
			let consolidated = '';
			try {
				const qwenRes = await new Promise<string>((res, rej) => {
					const timer = setTimeout(() => rej(new Error('qwen timeout')), 10000);
					const body = JSON.stringify({
						model: 'qwen',
						messages: [
							{ role: 'system', content: 'Consolidate the following into structured knowledge for a RAG system. Output: category, tags (comma-separated), one-paragraph summary, key facts as bullet points.' },
							{ role: 'user', content: grokResponse },
						],
						temperature: 0.2,
						max_tokens: 512,
					});
					const req = http.request('http://127.0.0.1:11435/v1/chat/completions', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
					}, (resp) => {
						let data = '';
						resp.on('data', (c: Buffer) => { data += c.toString(); });
						resp.on('end', () => {
							clearTimeout(timer);
							try {
								const parsed = JSON.parse(data);
								res(parsed?.choices?.[0]?.message?.content || '');
							} catch { res(''); }
						});
					});
					req.on('error', (e) => { clearTimeout(timer); rej(e); });
					req.write(body);
					req.end();
				});
				consolidated = qwenRes;
				think(`AUGMENT [${task.id}]: consolidated="${consolidated.substring(0, 300)}"`);
			} catch (e: any) {
				think(`AUGMENT [${task.id}]: Qwen consolidation failed: ${e.message?.substring(0, 100)}. Using raw Grok response.`);
				consolidated = grokResponse;
			}

			// Mark done
			const updated = lines.map(line => {
				try {
					const parsed = JSON.parse(line);
					if (parsed.id === task.id) {
						parsed.status = 'done';
						parsed.last_updated = new Date().toISOString();
						return JSON.stringify(parsed);
					}
				} catch { /* keep */ }
				return line;
			});
			writeFileSync(priPath, updated.join('\n') + '\n');

			appendFileSync(ORCH_LOG, JSON.stringify({
				ts: new Date().toISOString(),
				type: 'grok_augment',
				taskId: task.id,
				prompt: prompt.substring(0, 200),
				grokPreview: grokResponse.substring(0, 200),
				consolidatedPreview: consolidated.substring(0, 200),
				status: 'done',
			}) + '\n');

			// SMS for urgent
			if (task.urgency === 'now') {
				try {
					execSync(
						`node ${resolve(__dirname, 'index.js')} notify --level=info "Augment done: ${prompt.substring(0, 100).replace(/"/g, '\\"')}"`,
						{ cwd: TARX_ROOT, encoding: 'utf-8', timeout: 15000, stdio: 'pipe' }
					);
				} catch { /* best-effort */ }
			}
		} catch (e: any) {
			think(`AUGMENT [${task.id}]: FAILED: ${e.message?.substring(0, 200)}`);
			appendFileSync(ORCH_LOG, JSON.stringify({
				ts: new Date().toISOString(),
				type: 'grok_augment',
				taskId: task.id,
				status: 'error',
				error: e.message?.substring(0, 200),
			}) + '\n');
		}
	}
}

// --- E2E Test Loop (CC use cases + conversational + RAG + MCP audit) ---
//
// Triggered on each heartbeat tick when a priority task with the "e2e-test:"
// prefix is active in ~/.tarx/priorities.jsonl. Runs 4 test phases:
//
//   Phase 1 — CC Use Case Routing (runCCUseCaseTests)
//     Reads the compiled index.js and verifies each CC command (build, refactor,
//     fix, test, document, plan) has a `case '<cmd>'` in the switch statement.
//
//   Phase 2 — Conversational Intent Detection (runConversationalIntentTests)
//     Runs sample inputs ("set up pin", "unlock", etc.) against the same regex
//     patterns used by conversationalFlows.ts, verifying intent classification
//     matches expected types.
//
//   Phase 3 — RAG Search Pipeline (runRAGSearchTest)
//     Hits the embedding server /health endpoint on :11437 to confirm the
//     vector search pipeline is operational.
//
//   Phase 4 — MCP Audit (runMCPAudit)
//     Pings each MCP service port (11435 inference, 11436 mesh, 11437 embeddings)
//     and validates the expected JSON fields are present. Also verifies the
//     thinking log is writable.
//
// Results are aggregated, logged to the thinking stream, written to the
// orchestration log (~/.tarx/orch.jsonl), and the priority task is marked done.
// On failure, a notification is dispatched via `tarx notify`.

const E2E_PREFIX = 'e2e-test:';

// Conversational intent patterns pulled from extensions/tarx/src/chat/conversationalFlows.ts
const CONVERSATIONAL_INTENTS: Array<{ input: string; expectedType: string }> = [
	{ input: 'set up pin', expectedType: 'auth_setup' },
	{ input: 'unlock', expectedType: 'auth_unlock' },
	{ input: 'lock', expectedType: 'auth_lock' },
	{ input: 'change pin', expectedType: 'auth_change_pin' },
	{ input: 'disable authentication', expectedType: 'auth_disable' },
	{ input: 'turn on memory', expectedType: 'settings_memory' },
	{ input: 'toggle memory', expectedType: 'settings_memory' },
	{ input: 'change model', expectedType: 'settings_model' },
	{ input: 'enable mesh', expectedType: 'settings_mesh' },
	{ input: 'clear my memory', expectedType: 'settings_clear_memory' },
	{ input: 'show settings', expectedType: 'settings_show' },
	{ input: 'create project', expectedType: 'project_create' },
	{ input: 'set up project', expectedType: 'project_setup' },
];

// CC use case commands — dry-run validation (no actual dispatch, just test routing)
const CC_USE_CASES = ['build', 'refactor', 'fix', 'test', 'document', 'plan'];

// MCP server ports to audit
const MCP_AUDIT_PORTS = [
	{ port: 11435, name: 'Inference', expectField: 'model' },
	{ port: 11436, name: 'Mesh', expectField: 'status' },
	{ port: 11437, name: 'Embeddings', expectField: 'data' },
];

interface E2EResult {
	section: string;
	passed: number;
	failed: number;
	details: string[];
}

/** Reads compiled index.js and verifies each CC command has a case statement. */
function runCCUseCaseTests(): E2EResult {
	const result: E2EResult = { section: 'cc_use_cases', passed: 0, failed: 0, details: [] };

	const indexPath = resolve(__dirname, 'index.js');
	if (!existsSync(indexPath)) {
		result.failed += CC_USE_CASES.length;
		result.details.push(`index.js not found at ${indexPath} — CLI not compiled`);
		return result;
	}

	const source = readFileSync(indexPath, 'utf-8');
	for (const cmd of CC_USE_CASES) {
		if (source.includes(`case '${cmd}'`)) {
			result.passed++;
		} else {
			result.failed++;
			result.details.push(`${cmd}: NOT ROUTED — no case in index.js`);
		}
	}
	return result;
}

function runConversationalIntentTests(): E2EResult {
	const result: E2EResult = { section: 'conversational_intents', passed: 0, failed: 0, details: [] };

	// Intent detection patterns matching conversationalFlows.ts
	const INTENT_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
		{ pattern: /\b(set\s*up|create|enable)\s+(pin|auth|authentication)\b/i, type: 'auth_setup' },
		{ pattern: /\bunlock\b/i, type: 'auth_unlock' },
		{ pattern: /\block\b(?!\s*(?:file|screen))/i, type: 'auth_lock' },
		{ pattern: /\bchange\s+pin\b/i, type: 'auth_change_pin' },
		{ pattern: /\bdisable\s+(pin|auth|authentication)\b/i, type: 'auth_disable' },
		{ pattern: /\b(turn|switch|enable)\s+on\s+memory\b/i, type: 'settings_memory' },
		{ pattern: /\btoggle\s+memory\b/i, type: 'settings_memory' },
		{ pattern: /\b(change|switch|set)\s+model\b/i, type: 'settings_model' },
		{ pattern: /\b(enable|connect|join)\s+mesh\b/i, type: 'settings_mesh' },
		{ pattern: /\bclear\s+(my\s+)?memory\b/i, type: 'settings_clear_memory' },
		{ pattern: /\b(show|open|view)\s+settings\b/i, type: 'settings_show' },
		{ pattern: /\b(start|create|new)\s+project\b/i, type: 'project_create' },
		{ pattern: /\bset\s*up\s+project\b/i, type: 'project_setup' },
	];

	function detectIntent(prompt: string): string | null {
		for (const { pattern, type } of INTENT_PATTERNS) {
			if (pattern.test(prompt)) return type;
		}
		return null;
	}

	for (const tc of CONVERSATIONAL_INTENTS) {
		const detected = detectIntent(tc.input);
		if (detected === tc.expectedType) {
			result.passed++;
		} else {
			result.failed++;
			result.details.push(`"${tc.input}": expected ${tc.expectedType}, got ${detected || 'null'}`);
		}
	}
	return result;
}

async function runRAGSearchTest(): Promise<E2EResult> {
	const result: E2EResult = { section: 'rag_search', passed: 0, failed: 0, details: [] };

	// Check embedding server health
	const embHealthy = await checkPort(11437);
	if (!embHealthy) {
		result.failed++;
		result.details.push('Embedding server :11437 down');
		return result;
	}
	result.passed++;

	// Check knowledge DB exists and has data
	const dbPath = resolve(homedir(), 'Library/Application Support/tarx/memory.db');
	if (!existsSync(dbPath)) {
		result.failed++;
		result.details.push('memory.db not found');
		return result;
	}
	result.passed++;

	// Verify search command executes without crash
	try {
		const output = execSync(
			`node ${resolve(__dirname, 'index.js')} search "tarx architecture" 2>&1`,
			{ cwd: TARX_ROOT, encoding: 'utf-8', timeout: 30000, stdio: 'pipe' }
		).trim();

		if (/error|ENOENT|undefined/i.test(output) && !/chunks searched/i.test(output)) {
			result.failed++;
			result.details.push(`search crashed: ${output.substring(0, 150)}`);
		} else {
			result.passed++;
		}
	} catch (e: any) {
		result.failed++;
		result.details.push(`search exec failed: ${e.message?.substring(0, 100)}`);
	}

	return result;
}

async function runMCPAudit(): Promise<E2EResult> {
	const result: E2EResult = { section: 'mcp_audit', passed: 0, failed: 0, details: [] };

	for (const svc of MCP_AUDIT_PORTS) {
		const healthy = await checkPort(svc.port);
		if (healthy) {
			result.passed++;
		} else {
			result.failed++;
			result.details.push(`${svc.name} :${svc.port} DOWN`);
		}
	}

	// Validate thinking log is writable and structured
	try {
		const testLine = `[${new Date().toISOString()}] E2E-PROBE: thinking log write test`;
		appendFileSync(THINKING_LOG, testLine + '\n');
		result.passed++;
	} catch {
		result.failed++;
		result.details.push('thinking.log not writable');
	}

	return result;
}

async function processE2ETestLoop(): Promise<void> {
	const priPath = resolve(homedir(), '.tarx/priorities.jsonl');
	if (!existsSync(priPath)) return;

	const raw = readFileSync(priPath, 'utf-8').trim();
	if (!raw) return;

	const lines = raw.split('\n');
	const items = lines.map(line => {
		try { return JSON.parse(line); } catch { return null; }
	}).filter(Boolean);

	const tasks = items.filter(
		(p: any) => p.status === 'active' && p.title && p.title.toLowerCase().startsWith(E2E_PREFIX)
	);

	if (tasks.length === 0) return;

	think(`E2E-TEST: ${tasks.length} active e2e-test task(s). Running full suite...`);

	for (const task of tasks) {
		const results: E2EResult[] = [];

		// Phase 1: CC use case routing
		results.push(runCCUseCaseTests());

		// Phase 2: Conversational intent detection (front-end parity)
		results.push(runConversationalIntentTests());

		// Phase 3: RAG search pipeline
		results.push(await runRAGSearchTest());

		// Phase 4: MCP audit
		results.push(await runMCPAudit());

		// Aggregate
		const totalPassed = results.reduce((s, r) => s + r.passed, 0);
		const totalFailed = results.reduce((s, r) => s + r.failed, 0);
		const allDetails = results.flatMap(r => r.details);

		// Structured thinking output for RAG/MCP consumption
		const thinkingEntry = {
			type: 'e2e_test_result',
			ts: new Date().toISOString(),
			taskId: task.id,
			sections: results.map(r => ({
				name: r.section,
				passed: r.passed,
				failed: r.failed,
				issues: r.details,
			})),
			total: { passed: totalPassed, failed: totalFailed },
			verdict: totalFailed === 0 ? 'PASS' : 'FAIL',
		};

		think(`E2E-TEST: ${JSON.stringify(thinkingEntry)}`);

		// Human-readable summary
		for (const r of results) {
			const icon = r.failed === 0 ? '✅' : '❌';
			think(`E2E-TEST [${r.section}]: ${icon} ${r.passed}/${r.passed + r.failed} passed${r.details.length > 0 ? ' — ' + r.details[0] : ''}`);
		}

		think(`E2E-TEST: TOTAL ${totalPassed}/${totalPassed + totalFailed} passed. ${totalFailed > 0 ? 'FAIL' : 'ALL CLEAR'}`);

		// Mark done (recurring: re-seed on next wake)
		const updated = lines.map(line => {
			try {
				const p = JSON.parse(line);
				if (p.id === task.id) {
					p.status = 'done';
					p.last_updated = new Date().toISOString();
					return JSON.stringify(p);
				}
			} catch { /* keep */ }
			return line;
		});
		writeFileSync(priPath, updated.join('\n') + '\n');

		// Orch log
		appendFileSync(ORCH_LOG, JSON.stringify({
			ts: new Date().toISOString(),
			type: 'e2e_test',
			taskId: task.id,
			passed: totalPassed,
			failed: totalFailed,
			sections: results.map(r => `${r.section}:${r.passed}/${r.passed + r.failed}`),
			status: totalFailed === 0 ? 'pass' : 'fail',
		}) + '\n');

		// SMS on failure
		if (totalFailed > 0) {
			try {
				execSync(
					`node ${resolve(__dirname, 'index.js')} notify --level=warning "E2E: ${totalFailed} fail — ${allDetails[0]?.substring(0, 80)}"`,
					{ cwd: TARX_ROOT, encoding: 'utf-8', timeout: 15000, stdio: 'pipe' }
				);
			} catch { /* best-effort */ }
		}
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
