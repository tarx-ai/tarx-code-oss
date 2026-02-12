#!/usr/bin/env node
/**
 * TARX Grok Dispatch — God-Mode Orchestration Hook
 *
 * Registers a "grok-orchestrator" session, watches grok-inbox.md for
 * approvals/prompts, spawns Claude Code for approved tasks, and pushes
 * status to grok-status.log every 60s. Direct SQLite — no MCP overhead.
 *
 * Usage:
 *   cd extensions/tarx-core && node ../../scripts/grok-dispatch.js
 *   # or: nohup node scripts/grok-dispatch.js &
 *
 * Env:
 *   TARX_DATA_DIR  — override ~/Library/Application Support/tarx
 *   TARX_WORKSPACE — override ~/Desktop/tarx-code-oss
 */

'use strict';

const { join, resolve } = require('path');
const { homedir } = require('os');
const {
	existsSync, readFileSync, writeFileSync, appendFileSync,
	mkdirSync, watchFile, unwatchFile, statSync
} = require('fs');
const { randomUUID } = require('crypto');
const { spawn: spawnChild } = require('child_process');

// ─── Paths ────────────────────────────────────────────────────────────
const DATA_DIR = process.env.TARX_DATA_DIR || join(homedir(), 'Library/Application Support/tarx');
const DB_PATH = join(DATA_DIR, 'memory.db');
const STATUS_LOG = join(DATA_DIR, 'grok-status.log');
const STATE_FILE = join(DATA_DIR, 'grok-dispatch-state.json');
const INBOX_PATH = join(DATA_DIR, 'grok-inbox.md');
const WORKSPACE = process.env.TARX_WORKSPACE || join(homedir(), 'Desktop/tarx-code-oss');

// ─── Config ───────────────────────────────────────────────────────────
const SESSION_ID = 'grok-orchestrator';
const SESSION_NAME = 'Grok Dispatch';
const POLL_INTERVAL = 30_000;   // Check pending tasks every 30s
const STATUS_INTERVAL = 60_000; // Write status every 60s
const MAX_CONCURRENT = 2;
const SPAWN_TIMEOUT = 300_000;  // 5 min per task
const MAX_RETRIES = 3;

// ─── State ────────────────────────────────────────────────────────────
let db;
let running = true;
let pollTimer;
let statusTimer;
const activeSessions = new Map();  // taskId → { process, startedAt, lastOutput }
let stats = { started: Date.now(), tasksCompleted: 0, tasksFailed: 0, tasksSpawned: 0 };
let lastInboxMtime = 0;

// ─── Database ─────────────────────────────────────────────────────────
function openDatabase() {
	// Resolve better-sqlite3 from tarx-core
	const bsqlPath = join(__dirname, '..', 'extensions', 'tarx-core', 'node_modules', 'better-sqlite3');
	const Database = require(bsqlPath);
	db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');
	db.pragma('busy_timeout = 5000');
}

function ensureTables() {
	// Ensure orch tables exist (idempotent — tarx-ops may have already created them)
	db.exec(`
		CREATE TABLE IF NOT EXISTS orch_sessions (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			workspace_path TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'active',
			current_file TEXT,
			current_task TEXT,
			thinking_notes TEXT,
			last_command TEXT,
			last_output TEXT,
			error_state TEXT,
			last_activity INTEGER NOT NULL,
			created_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS orch_tasks (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			milestone_id TEXT,
			title TEXT NOT NULL,
			description TEXT,
			status TEXT NOT NULL DEFAULT 'pending',
			priority TEXT NOT NULL DEFAULT 'medium',
			assigned_at INTEGER NOT NULL,
			started_at INTEGER,
			completed_at INTEGER,
			blocked_by TEXT,
			result TEXT,
			FOREIGN KEY (session_id) REFERENCES orch_sessions(id) ON DELETE CASCADE
		);
		CREATE TABLE IF NOT EXISTS orch_session_activity (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL,
			timestamp INTEGER NOT NULL,
			activity_type TEXT NOT NULL,
			details TEXT,
			FOREIGN KEY (session_id) REFERENCES orch_sessions(id) ON DELETE CASCADE
		);
	`);
}

// ─── Session Registration ─────────────────────────────────────────────
function registerSession() {
	const now = Date.now();
	const existing = db.prepare('SELECT id FROM orch_sessions WHERE id = ?').get(SESSION_ID);

	if (existing) {
		db.prepare(`
			UPDATE orch_sessions SET status = 'active', last_activity = ?, name = ?, workspace_path = ?
			WHERE id = ?
		`).run(now, SESSION_NAME, WORKSPACE, SESSION_ID);
	} else {
		db.prepare(`
			INSERT INTO orch_sessions (id, name, workspace_path, status, last_activity, created_at)
			VALUES (?, ?, ?, 'active', ?, ?)
		`).run(SESSION_ID, SESSION_NAME, WORKSPACE, now, now);
	}

	logActivity('session_start', { message: 'Grok Dispatch started' });
	log('Session registered: ' + SESSION_ID);
}

function logActivity(type, details) {
	db.prepare(`
		INSERT INTO orch_session_activity (session_id, timestamp, activity_type, details)
		VALUES (?, ?, ?, ?)
	`).run(SESSION_ID, Date.now(), type, JSON.stringify(details));

	db.prepare('UPDATE orch_sessions SET last_activity = ? WHERE id = ?')
		.run(Date.now(), SESSION_ID);
}

// ─── Task Management ──────────────────────────────────────────────────
function getPendingTasks() {
	return db.prepare(`
		SELECT id, title, description, priority, assigned_at
		FROM orch_tasks
		WHERE status = 'pending'
		ORDER BY
			CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
			assigned_at ASC
	`).all();
}

function getBlockedTasks() {
	return db.prepare(`
		SELECT id, title, description, priority, blocked_by
		FROM orch_tasks
		WHERE status = 'blocked' AND blocked_by = 'approval_required'
	`).all();
}

function updateTaskStatus(taskId, status, extras = {}) {
	const sets = ['status = ?'];
	const values = [status];

	if (status === 'in_progress' && !extras.skipStarted) {
		sets.push('started_at = ?');
		values.push(Date.now());
	}
	if (status === 'completed') {
		sets.push('completed_at = ?');
		values.push(Date.now());
	}
	if (extras.result !== undefined) {
		sets.push('result = ?');
		values.push(extras.result);
	}
	if (extras.blocked_by !== undefined) {
		sets.push('blocked_by = ?');
		values.push(extras.blocked_by);
	}

	values.push(taskId);
	db.prepare(`UPDATE orch_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

function createTask(title, description, priority = 'medium', needsApproval = true) {
	const taskId = 'grok-' + randomUUID().slice(0, 8);
	const now = Date.now();

	db.prepare(`
		INSERT INTO orch_tasks (id, session_id, title, description, status, priority, assigned_at, blocked_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		taskId, SESSION_ID, title, description || '',
		needsApproval ? 'blocked' : 'pending',
		priority, now,
		needsApproval ? 'approval_required' : null
	);

	log(`Task created: ${taskId} "${title}" [${needsApproval ? 'needs approval' : 'auto-pending'}]`);
	logActivity('task_created', { taskId, title, priority, needsApproval });
	return taskId;
}

// ─── Task Spawning (Claude Code) ──────────────────────────────────────
function spawnForTask(task) {
	if (activeSessions.size >= MAX_CONCURRENT) return;

	const prompt = `${task.title}\n\n${task.description || ''}`.trim();
	log(`Spawning for task ${task.id}: ${task.title}`);

	updateTaskStatus(task.id, 'in_progress');
	stats.tasksSpawned++;

	// Use full path to claude CLI - daemon process may not inherit PATH
	const claudePath = process.env.CLAUDE_PATH || '/opt/homebrew/bin/claude';
	const child = spawnChild(claudePath, [
		'--model', 'sonnet',
		'-p', prompt,
		'--output-format', 'text'
	], {
		cwd: WORKSPACE,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: { ...process.env, FORCE_COLOR: '0', PATH: process.env.PATH + ':/opt/homebrew/bin' }
	});

	const session = {
		process: child,
		taskId: task.id,
		startedAt: Date.now(),
		lastOutputAt: Date.now(),
		output: ''
	};
	activeSessions.set(task.id, session);

	child.stdout?.on('data', (data) => {
		session.lastOutputAt = Date.now();
		session.output += data.toString();
		// Cap output buffer at 50KB
		if (session.output.length > 50_000) {
			session.output = session.output.slice(-40_000);
		}
	});

	child.stderr?.on('data', (data) => {
		session.lastOutputAt = Date.now();
	});

	child.on('exit', (code) => {
		activeSessions.delete(task.id);
		const result = session.output.slice(-2000); // Last 2K chars as result

		if (code === 0) {
			updateTaskStatus(task.id, 'completed', { result });
			stats.tasksCompleted++;
			log(`Task ${task.id} completed successfully`);
			logActivity('task_completed', { taskId: task.id, exitCode: code });
		} else {
			stats.tasksFailed++;
			const retryMarker = `[FAIL code=${code}]`;
			updateTaskStatus(task.id, 'blocked', {
				result: retryMarker + ' ' + result.slice(0, 500),
				blocked_by: 'spawn_failed'
			});
			log(`Task ${task.id} failed with code ${code}`);
			logActivity('task_failed', { taskId: task.id, exitCode: code });
		}
	});

	child.on('error', (err) => {
		activeSessions.delete(task.id);
		stats.tasksFailed++;
		updateTaskStatus(task.id, 'blocked', {
			result: `[ERROR] ${err.message}`,
			blocked_by: 'spawn_error'
		});
		log(`Task ${task.id} spawn error: ${err.message}`);
	});

	// Timeout check
	const timeoutCheck = setInterval(() => {
		if (!activeSessions.has(task.id)) {
			clearInterval(timeoutCheck);
			return;
		}
		const elapsed = Date.now() - session.startedAt;
		if (elapsed > SPAWN_TIMEOUT) {
			log(`Task ${task.id} timed out after ${Math.round(elapsed / 1000)}s`);
			child.kill('SIGTERM');
			clearInterval(timeoutCheck);
		}
	}, 10_000);
}

function pollAndSpawn() {
	if (!running) return;

	// Check for timed-out sessions
	for (const [taskId, session] of activeSessions) {
		const idle = Date.now() - session.lastOutputAt;
		if (idle > SPAWN_TIMEOUT) {
			log(`Task ${taskId} idle timeout (${Math.round(idle / 1000)}s)`);
			session.process.kill('SIGTERM');
		}
	}

	// Spawn for pending tasks
	if (activeSessions.size < MAX_CONCURRENT) {
		const pending = getPendingTasks();
		for (const task of pending) {
			if (activeSessions.size >= MAX_CONCURRENT) break;
			if (activeSessions.has(task.id)) continue;
			spawnForTask(task);
		}
	}
}

// ─── Inbox Watcher ────────────────────────────────────────────────────
function ensureInbox() {
	mkdirSync(DATA_DIR, { recursive: true });
	if (!existsSync(INBOX_PATH)) {
		writeFileSync(INBOX_PATH, [
			'# Grok Inbox',
			'# Lines are parsed on change. Supported formats:',
			'#   approve <taskId>        — approve a blocked task',
			'#   reject <taskId>         — reject/remove a task',
			'#   task: <title>           — create new task (needs approval)',
			'#   auto: <title>           — create + auto-start (no approval)',
			'#   priority: high|low|...  — set priority for next task line',
			'# Processed lines are prefixed with [done]',
			'',
		].join('\n'), 'utf8');
	}
	try {
		lastInboxMtime = statSync(INBOX_PATH).mtimeMs;
	} catch {
		lastInboxMtime = 0;
	}
}

function processInbox() {
	try {
		const stat = statSync(INBOX_PATH);
		if (stat.mtimeMs <= lastInboxMtime) return;
		lastInboxMtime = stat.mtimeMs;
	} catch {
		return;
	}

	const raw = readFileSync(INBOX_PATH, 'utf8');
	const lines = raw.split('\n');
	let modified = false;
	let nextPriority = 'medium';

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		// Skip comments, blanks, already-processed lines
		if (!line || line.startsWith('#') || line.startsWith('[done]')) continue;

		let handled = false;

		// approve <taskId>
		const approveMatch = line.match(/^approve\s+(\S+)/i);
		if (approveMatch) {
			const taskId = approveMatch[1];
			approveTask(taskId);
			handled = true;
		}

		// reject <taskId>
		const rejectMatch = line.match(/^reject\s+(\S+)/i);
		if (rejectMatch) {
			const taskId = rejectMatch[1];
			rejectTask(taskId);
			handled = true;
		}

		// priority: <level>
		const prioMatch = line.match(/^priority:\s*(critical|high|medium|low)/i);
		if (prioMatch) {
			nextPriority = prioMatch[1].toLowerCase();
			handled = true;
		}

		// task: <title>  (needs approval)
		const taskMatch = line.match(/^task:\s*(.+)/i);
		if (taskMatch) {
			createTask(taskMatch[1].trim(), '', nextPriority, true);
			nextPriority = 'medium';
			handled = true;
		}

		// auto: <title>  (auto-pending, no approval needed)
		const autoMatch = line.match(/^auto:\s*(.+)/i);
		if (autoMatch) {
			createTask(autoMatch[1].trim(), '', nextPriority, false);
			nextPriority = 'medium';
			handled = true;
		}

		if (handled) {
			lines[i] = `[done] ${line}`;
			modified = true;
		}
	}

	if (modified) {
		writeFileSync(INBOX_PATH, lines.join('\n'), 'utf8');
	}
}

function approveTask(taskId) {
	const task = db.prepare('SELECT id, status, blocked_by FROM orch_tasks WHERE id = ?').get(taskId);
	if (!task) {
		log(`Approve: task ${taskId} not found`);
		return;
	}
	if (task.status === 'blocked') {
		updateTaskStatus(taskId, 'pending', { blocked_by: null });
		log(`Task ${taskId} approved → pending`);
		logActivity('task_approved', { taskId, source: 'inbox' });
	} else {
		log(`Approve: task ${taskId} is ${task.status}, not blocked — skipping`);
	}
}

function rejectTask(taskId) {
	const task = db.prepare('SELECT id FROM orch_tasks WHERE id = ?').get(taskId);
	if (!task) {
		log(`Reject: task ${taskId} not found`);
		return;
	}
	updateTaskStatus(taskId, 'completed', { result: '[REJECTED] User rejected via inbox' });
	log(`Task ${taskId} rejected`);
	logActivity('task_rejected', { taskId, source: 'inbox' });
}

// ─── Status Reporter ──────────────────────────────────────────────────
function writeStatus() {
	if (!running) return;

	const now = new Date();
	const pending = getPendingTasks();
	const blocked = getBlockedTasks();

	const allTasks = db.prepare(`
		SELECT status, COUNT(*) as cnt FROM orch_tasks GROUP BY status
	`).all();
	const taskCounts = {};
	for (const row of allTasks) taskCounts[row.status] = row.cnt;

	const activeList = [];
	for (const [taskId, sess] of activeSessions) {
		activeList.push({
			taskId,
			runningFor: Math.round((Date.now() - sess.startedAt) / 1000) + 's',
			outputLines: sess.output.split('\n').length
		});
	}

	const report = {
		timestamp: now.toISOString(),
		uptime: Math.round((Date.now() - stats.started) / 1000) + 's',
		session: SESSION_ID,
		stats: {
			spawned: stats.tasksSpawned,
			completed: stats.tasksCompleted,
			failed: stats.tasksFailed,
			activeNow: activeSessions.size
		},
		taskCounts,
		pendingCount: pending.length,
		blockedAwaitingApproval: blocked.length,
		activeSessions: activeList
	};

	// Append to rolling log
	const logLine = `[${now.toISOString()}] active=${activeSessions.size} pending=${pending.length} blocked=${blocked.length} completed=${stats.tasksCompleted} failed=${stats.tasksFailed}\n`;
	appendFileSync(STATUS_LOG, logLine);

	// Write full state JSON (for extension/dashboard to read)
	writeFileSync(STATE_FILE, JSON.stringify(report, null, 2));

	// Touch session activity
	db.prepare('UPDATE orch_sessions SET last_activity = ? WHERE id = ?')
		.run(Date.now(), SESSION_ID);
}

// ─── Logging ──────────────────────────────────────────────────────────
function log(msg) {
	const ts = new Date().toISOString().slice(11, 19);
	const line = `[${ts}] [grok-dispatch] ${msg}`;
	console.log(line);
}

// ─── Lifecycle ────────────────────────────────────────────────────────
function shutdown(signal) {
	if (!running) return;
	running = false;
	log(`Shutting down (${signal})...`);

	// Clear timers
	if (pollTimer) clearInterval(pollTimer);
	if (statusTimer) clearInterval(statusTimer);

	// Kill active sessions
	for (const [taskId, session] of activeSessions) {
		log(`Killing active session for task ${taskId}`);
		session.process.kill('SIGTERM');
		// Reset task to pending so it can be re-picked later
		updateTaskStatus(taskId, 'pending', { skipStarted: true });
	}
	activeSessions.clear();

	// Mark session paused
	if (db) {
		db.prepare("UPDATE orch_sessions SET status = 'paused' WHERE id = ?").run(SESSION_ID);
		logActivity('session_stop', { signal });
		writeStatus();
		db.close();
	}

	// Unwatch inbox
	try { unwatchFile(INBOX_PATH); } catch { /* ignore */ }

	log('Shutdown complete');
	process.exit(0);
}

// ─── Main ─────────────────────────────────────────────────────────────
function main() {
	log('Grok Dispatch starting...');

	// Ensure data dir
	mkdirSync(DATA_DIR, { recursive: true });

	// Open database
	openDatabase();
	ensureTables();

	// Register session
	registerSession();

	// Setup inbox
	ensureInbox();

	// Start polling (tasks)
	pollTimer = setInterval(() => {
		try {
			processInbox();
			pollAndSpawn();
		} catch (err) {
			log(`Poll error: ${err.message}`);
		}
	}, POLL_INTERVAL);

	// Start status reporter
	statusTimer = setInterval(() => {
		try {
			writeStatus();
		} catch (err) {
			log(`Status error: ${err.message}`);
		}
	}, STATUS_INTERVAL);

	// Initial status write
	writeStatus();

	// Watch inbox for rapid changes (in addition to poll)
	watchFile(INBOX_PATH, { interval: 2000 }, () => {
		try {
			processInbox();
		} catch (err) {
			log(`Inbox watch error: ${err.message}`);
		}
	});

	// Graceful shutdown
	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));

	log('Grok Dispatch started');
	log(`  Session: ${SESSION_ID}`);
	log(`  Workspace: ${WORKSPACE}`);
	log(`  Inbox: ${INBOX_PATH}`);
	log(`  Status log: ${STATUS_LOG}`);
	log(`  Poll interval: ${POLL_INTERVAL / 1000}s`);
	log(`  Status interval: ${STATUS_INTERVAL / 1000}s`);
	log(`  Max concurrent: ${MAX_CONCURRENT}`);
}

// ─── Entry ────────────────────────────────────────────────────────────
try {
	main();
} catch (err) {
	console.error('[grok-dispatch] Fatal:', err);
	process.exit(1);
}
