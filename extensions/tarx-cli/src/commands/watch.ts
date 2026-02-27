/**
 * tarx watch <add|rm|ls|scan> — Manage watched directories.
 * Watches are auto-scanned by the daemon and embedded into RAG.
 */

import { existsSync, statSync, readdirSync, readFileSync } from 'fs';
import { resolve, extname, basename } from 'path';
import { createHash } from 'crypto';
import { openDb, dbExists, DB_PATH, withRetry } from './db';
import { embedAndStore, fileHash } from './rag';
import { thinkingSpinner } from '../feedback';
import { header, section, kv, brand, icon, footer, progressBar, cta } from '../format';

function ensureWatchTable(db: any): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS watched_directories (
			id TEXT PRIMARY KEY,
			path TEXT NOT NULL,
			label TEXT,
			depth INTEGER DEFAULT 3,
			created_at TEXT DEFAULT (datetime('now')),
			last_scan TEXT,
			deleted_at TEXT
		);
		CREATE TABLE IF NOT EXISTS files (
			id TEXT PRIMARY KEY,
			filename TEXT,
			content TEXT,
			source_type TEXT DEFAULT 'scan',
			hash TEXT,
			created_at TEXT DEFAULT (datetime('now')),
			indexed_at TEXT,
			is_reference INTEGER DEFAULT 0
		);
		CREATE TABLE IF NOT EXISTS knowledge_embeddings (
			id TEXT PRIMARY KEY,
			source_id TEXT,
			content TEXT,
			title TEXT,
			embedding BLOB,
			created_at TEXT DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS chunk_embeddings (
			id TEXT PRIMARY KEY,
			source_id TEXT,
			content TEXT,
			title TEXT,
			embedding BLOB,
			created_at TEXT DEFAULT (datetime('now'))
		);
	`);
}

const TEXT_EXTENSIONS = new Set([
	'.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.py', '.rs',
	'.go', '.java', '.c', '.cpp', '.h', '.css', '.html', '.yaml', '.yml',
	'.toml', '.sh', '.sql', '.swift', '.kt', '.rb', '.php', '.vue',
]);

const IGNORE_DIRS = new Set([
	'node_modules', '.git', 'dist', 'build', 'out', '.next', '__pycache__',
	'.cache', 'target', 'vendor', '.tarx', 'coverage',
]);

function walkDir(dir: string, depth: number, maxDepth: number): string[] {
	if (depth > maxDepth) return [];
	const files: string[] = [];
	try {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith('.')) continue;
			const full = resolve(dir, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORE_DIRS.has(entry.name)) files.push(...walkDir(full, depth + 1, maxDepth));
			} else if (entry.isFile()) {
				const ext = extname(full).toLowerCase();
				if (TEXT_EXTENSIONS.has(ext)) {
					try { if (statSync(full).size < 1024 * 1024) files.push(full); } catch { /* skip */ }
				}
			}
		}
	} catch { /* skip */ }
	return files;
}

async function scanWatch(watchId: string, watchPath: string, depth: number, db: any): Promise<{ learned: number; skipped: number; chunks: number }> {
	const files = walkDir(watchPath, 0, depth);
	let learned = 0, skipped = 0, chunks = 0;

	for (let i = 0; i < files.length; i++) {
		progressBar('Scanning', i + 1, files.length);
		try {
			const content = readFileSync(files[i], 'utf-8');
			const hash = fileHash(content);
			const existing = db.prepare('SELECT id FROM files WHERE hash = ?').get(hash) as { id: string } | undefined;
			if (existing) { skipped++; continue; }

			const fileId = createHash('sha256').update(files[i] + ':' + Date.now()).digest('hex').slice(0, 32);
			const name = basename(files[i]);

			withRetry(() => {
				db.prepare(`INSERT INTO files (id, filename, content, source_type, hash, is_reference) VALUES (?, ?, ?, 'scan', ?, 1)`)
					.run(fileId, name, content, hash);
			});

			const stored = await embedAndStore(fileId, content, name, db);
			learned++;
			chunks += stored;
		} catch { /* skip */ }
	}

	// Update last_scan
	withRetry(() => {
		db.prepare('UPDATE watched_directories SET last_scan = datetime(\'now\') WHERE id = ?').run(watchId);
	});

	return { learned, skipped, chunks };
}

export async function watch(args: string[]): Promise<void> {
	const sub = args[0] || 'ls';

	switch (sub) {
		case 'add': {
			const pathArgs: string[] = [];
			let depth = 3;
			let label: string | undefined;
			for (let i = 1; i < args.length; i++) {
				if (args[i] === '--depth' && args[i + 1]) { depth = parseInt(args[++i], 10) || 3; }
				else if (args[i] === '--label' && args[i + 1]) { label = args[++i]; }
				else pathArgs.push(args[i]);
			}
			const dir = pathArgs.join(' ');
			if (!dir) {
				console.error('Usage: tarx watch add <dir> [--depth N] [--label NAME]');
				process.exit(1);
			}
			const resolved = resolve(dir);
			if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
				console.error(`Not a directory: ${resolved}`);
				process.exit(1);
			}

			header('Watch', `Adding ${resolved}`);
			const Database = require('better-sqlite3');
			const db = new Database(DB_PATH);
			db.pragma('journal_mode = WAL');
			ensureWatchTable(db);

			const id = createHash('sha256').update(resolved).digest('hex').slice(0, 16);

			// Check if already watched
			const existing = db.prepare('SELECT id FROM watched_directories WHERE path = ? AND deleted_at IS NULL').get(resolved) as { id: string } | undefined;
			if (existing) {
				console.log(`  ${icon.warning} Already watching: ${resolved}`);
				db.close();
				return;
			}

			withRetry(() => {
				db.prepare('INSERT INTO watched_directories (id, path, label, depth) VALUES (?, ?, ?, ?)')
					.run(id, resolved, label || basename(resolved), depth);
			});

			console.log(`  ${icon.success} Watching: ${resolved} (depth: ${depth})`);
			db.close();
			footer('local');
			break;
		}

		case 'rm':
		case 'remove': {
			const target = args.slice(1).join(' ');
			if (!target) {
				console.error('Usage: tarx watch rm <dir|id>');
				process.exit(1);
			}
			if (!dbExists()) { console.log('No watches configured.'); return; }

			header('Watch', 'Removing watch');
			const db = openDb(false);
			ensureWatchTable(db);

			const row = db.prepare(`
				SELECT id, path FROM watched_directories
				WHERE (id = ? OR path = ?) AND deleted_at IS NULL
			`).get(target, resolve(target)) as { id: string; path: string } | undefined;

			if (!row) {
				console.log(`  ${icon.warning} No watch found for: ${target}`);
				db.close();
				return;
			}

			withRetry(() => {
				db.prepare('UPDATE watched_directories SET deleted_at = datetime(\'now\') WHERE id = ?').run(row.id);
			});

			console.log(`  ${icon.success} Removed watch: ${row.path}`);
			db.close();
			footer('local');
			break;
		}

		case 'ls':
		case 'list': {
			header('Watch', 'Watched directories');
			if (!dbExists()) {
				cta('No watches configured yet.', 'tarx watch add <dir>');
				return;
			}
			const db = openDb(true);
			try {
				ensureWatchTable(db);
			} catch { /* readonly, table might exist */ }

			let watches: Array<{ id: string; path: string; label: string; depth: number; last_scan: string; file_count: number }> = [];
			try {
				watches = db.prepare(`
					SELECT w.id, w.path, w.label, w.depth, w.last_scan,
						(SELECT COUNT(*) FROM files f WHERE f.source_type = 'scan') as file_count
					FROM watched_directories w
					WHERE w.deleted_at IS NULL
					ORDER BY w.created_at
				`).all() as typeof watches;
			} catch {
				watches = [];
			}

			db.close();

			if (watches.length === 0) {
				cta('No watches configured yet.', 'tarx watch add <dir>');
				return;
			}

			for (const w of watches) {
				const lastScan = w.last_scan ? new Date(w.last_scan).toLocaleString() : 'never';
				kv(w.label || w.id.slice(0, 8), w.path);
				console.log(`    ${brand.dim(`depth: ${w.depth} · files: ${w.file_count} · last scan: ${lastScan}`)}`);
			}
			footer('local');
			break;
		}

		case 'scan': {
			const scanTarget = args[1];
			header('Watch', 'Scanning');
			if (!dbExists()) {
				cta('No watches configured yet.', 'tarx watch add <dir>');
				return;
			}

			const db = openDb(false);
			ensureWatchTable(db);

			let watches;
			if (scanTarget) {
				watches = db.prepare(`
					SELECT id, path, depth FROM watched_directories
					WHERE (id = ? OR path = ?) AND deleted_at IS NULL
				`).all(scanTarget, resolve(scanTarget)) as Array<{ id: string; path: string; depth: number }>;
			} else {
				watches = db.prepare('SELECT id, path, depth FROM watched_directories WHERE deleted_at IS NULL')
					.all() as Array<{ id: string; path: string; depth: number }>;
			}

			if (watches.length === 0) {
				console.log(`  ${brand.dim('No watches to scan.')}`);
				db.close();
				return;
			}

			let totalLearned = 0, totalSkipped = 0, totalChunks = 0;
			for (const w of watches) {
				section(w.path);
				if (!existsSync(w.path)) {
					console.log(`  ${icon.warning} Directory not found`);
					continue;
				}
				const result = await scanWatch(w.id, w.path, w.depth, db);
				totalLearned += result.learned;
				totalSkipped += result.skipped;
				totalChunks += result.chunks;
				kv('Learned', `${result.learned} files, ${result.chunks} chunks`);
				if (result.skipped > 0) kv('Skipped', `${result.skipped} (already known)`);
			}

			section('Total');
			kv('Learned', `${totalLearned} files`, totalLearned > 0 ? 'ok' : undefined);
			kv('Chunks', `${totalChunks} embedded`);
			kv('Skipped', `${totalSkipped}`);
			db.close();
			footer('local');
			break;
		}

		default:
			console.error(`Unknown subcommand: ${sub}`);
			console.error('Usage: tarx watch <add|rm|ls|scan>');
			process.exit(1);
	}
}
