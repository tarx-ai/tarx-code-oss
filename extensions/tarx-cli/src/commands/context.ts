/**
 * tarx context — Dashboard showing everything TARX knows.
 * Git state, RAG stats, memory count, service health, priorities, daemon status.
 * All queries run in parallel for speed.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { dbExists, openDb, DB_PATH } from './db';
import { checkHealth } from '../services/health';
import { header, section, kv, brand, icon, footer } from '../format';

interface GitInfo {
	branch: string;
	dirty: number;
	recentCommits: string[];
}

function getGit(): GitInfo | null {
	try {
		const branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
		let dirty = 0;
		try {
			const status = execSync('git status --porcelain', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
			if (status) dirty = status.split('\n').length;
		} catch { /* ignore */ }
		let recentCommits: string[] = [];
		try {
			recentCommits = execSync('git log --oneline -3', { stdio: ['pipe', 'pipe', 'pipe'] })
				.toString().trim().split('\n').filter(Boolean);
		} catch { /* ignore */ }
		return { branch, dirty, recentCommits };
	} catch {
		return null;
	}
}

interface RagStats {
	totalChunks: number;
	totalFiles: number;
	uploadedFiles: number;
	scannedFiles: number;
	learnedFiles: number;
	watches: number;
}

function getRagStats(): RagStats {
	const stats: RagStats = { totalChunks: 0, totalFiles: 0, uploadedFiles: 0, scannedFiles: 0, learnedFiles: 0, watches: 0 };
	if (!dbExists()) return stats;

	const db = openDb(true);
	try {
		try {
			const row = db.prepare('SELECT COUNT(*) as cnt FROM knowledge_embeddings').get() as { cnt: number };
			stats.totalChunks = row.cnt;
		} catch { /* table missing */ }

		try {
			const row = db.prepare('SELECT COUNT(*) as cnt FROM files').get() as { cnt: number };
			stats.totalFiles = row.cnt;
		} catch { /* table missing */ }

		try {
			const rows = db.prepare(`
				SELECT source_type, COUNT(*) as cnt FROM files
				GROUP BY source_type
			`).all() as Array<{ source_type: string; cnt: number }>;
			for (const r of rows) {
				if (r.source_type === 'upload') stats.uploadedFiles = r.cnt;
				else if (r.source_type === 'scan' || r.source_type === 'reference') stats.scannedFiles += r.cnt;
				else if (r.source_type === 'cli_learn') stats.learnedFiles = r.cnt;
			}
		} catch { /* table missing */ }

		try {
			const row = db.prepare('SELECT COUNT(*) as cnt FROM watched_directories WHERE deleted_at IS NULL').get() as { cnt: number };
			stats.watches = row.cnt;
		} catch { /* table missing */ }
	} finally {
		db.close();
	}

	return stats;
}

interface MemoryStats {
	count: number;
	recent: string[];
}

function getMemoryStats(): MemoryStats {
	const stats: MemoryStats = { count: 0, recent: [] };
	if (!dbExists()) return stats;

	const db = openDb(true);
	try {
		try {
			const row = db.prepare('SELECT COUNT(*) as cnt FROM memories WHERE deleted_at IS NULL').get() as { cnt: number };
			stats.count = row.cnt;
		} catch { /* table missing */ }

		try {
			const rows = db.prepare(`
				SELECT content FROM memories
				WHERE deleted_at IS NULL
				ORDER BY created_at DESC LIMIT 3
			`).all() as Array<{ content: string }>;
			stats.recent = rows.map(r => r.content.length > 60 ? r.content.slice(0, 57) + '...' : r.content);
		} catch { /* table missing */ }
	} finally {
		db.close();
	}

	return stats;
}

interface PriorityStats {
	active: number;
	blocked: number;
	done: number;
	urgent: string[];
}

function getPriorities(): PriorityStats {
	const stats: PriorityStats = { active: 0, blocked: 0, done: 0, urgent: [] };
	const priPath = resolve(homedir(), '.tarx/priorities.jsonl');
	if (!existsSync(priPath)) return stats;

	try {
		const raw = readFileSync(priPath, 'utf-8').trim();
		if (!raw) return stats;
		const items = raw.split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
		for (const p of items) {
			if (p.status === 'active') { stats.active++; if (p.urgency === 'now') stats.urgent.push(p.title); }
			else if (p.status === 'blocked') stats.blocked++;
			else if (p.status === 'done') stats.done++;
		}
	} catch { /* ignore */ }

	return stats;
}

function getDaemonInfo(): { status: string; lastTick: string } {
	const logPath = resolve(homedir(), 'Library/Application Support/tarx/orchestration-log.jsonl');
	if (!existsSync(logPath)) return { status: 'idle', lastTick: 'never' };

	try {
		const raw = readFileSync(logPath, 'utf-8').trim();
		if (!raw) return { status: 'idle', lastTick: 'never' };
		const last = raw.split('\n').pop();
		if (!last) return { status: 'idle', lastTick: 'never' };
		const entry = JSON.parse(last);
		const age = Date.now() - new Date(entry.ts).getTime();
		const status = age < 10 * 60 * 1000 ? 'active' : age < 60 * 60 * 1000 ? 'recent' : 'idle';
		const lastTick = new Date(entry.ts).toLocaleString();
		return { status, lastTick };
	} catch {
		return { status: 'idle', lastTick: 'unknown' };
	}
}

export async function context(): Promise<void> {
	header('Context', 'Everything TARX knows');

	// Run all queries in parallel
	const [health, git, rag, memory, priorities, daemon] = await Promise.all([
		checkHealth(),
		Promise.resolve(getGit()),
		Promise.resolve(getRagStats()),
		Promise.resolve(getMemoryStats()),
		Promise.resolve(getPriorities()),
		Promise.resolve(getDaemonInfo()),
	]);

	// Git
	if (git) {
		section('Git');
		kv('Branch', git.branch);
		kv('Changed files', String(git.dirty), git.dirty > 0 ? 'warn' : 'ok');
		if (git.recentCommits.length > 0) {
			for (const c of git.recentCommits) {
				console.log(`    ${brand.dim(c)}`);
			}
		}
	}

	// Services
	section('Services');
	kv('Inference', `:11435`, health.inference.healthy ? 'ok' : 'error');
	kv('Embeddings', `:11437`, health.embeddings.healthy ? 'ok' : 'error');
	kv('Mesh', `:11436`, health.mesh.healthy ? 'ok' : 'error');

	// RAG
	section('Knowledge Base');
	kv('Chunks', String(rag.totalChunks), rag.totalChunks > 0 ? 'ok' : undefined);
	kv('Files', `${rag.totalFiles} total`, rag.totalFiles > 0 ? 'ok' : undefined);
	if (rag.uploadedFiles) kv('  Uploaded', String(rag.uploadedFiles));
	if (rag.scannedFiles) kv('  Scanned', String(rag.scannedFiles));
	if (rag.learnedFiles) kv('  CLI learned', String(rag.learnedFiles));
	kv('Watches', String(rag.watches));
	if (dbExists()) {
		try {
			const size = statSync(DB_PATH).size;
			kv('DB size', `${(size / 1024 / 1024).toFixed(1)} MB`);
		} catch { /* ignore */ }
	}

	// Memory
	section('Memories');
	kv('Count', String(memory.count), memory.count > 0 ? 'ok' : undefined);
	if (memory.recent.length > 0) {
		for (const r of memory.recent) {
			console.log(`    ${brand.dim(r)}`);
		}
	}

	// Priorities
	section('Priorities');
	kv('Active', String(priorities.active), priorities.active > 0 ? 'ok' : undefined);
	kv('Blocked', String(priorities.blocked), priorities.blocked > 0 ? 'warn' : 'ok');
	kv('Done', String(priorities.done));
	if (priorities.urgent.length > 0) {
		for (const u of priorities.urgent) {
			console.log(`    ${icon.warning} ${brand.yellow(u)}`);
		}
	}

	// Daemon
	section('Daemon');
	const daemonStatus = daemon.status === 'active' ? 'ok' : daemon.status === 'recent' ? 'warn' : undefined;
	kv('Status', daemon.status, daemonStatus);
	kv('Last tick', daemon.lastTick);

	footer('local');
}
