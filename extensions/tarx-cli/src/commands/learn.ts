/**
 * tarx learn <file|dir> — Teach TARX about files.
 * Reads, chunks, embeds, and stores in the knowledge base.
 * Source type: cli_learn (distinguishes from MCP upload/scan).
 */

import { readFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'fs';
import { resolve, extname, basename, dirname } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { embedAndStore, fileHash } from './rag';
import { openDb, dbExists, DB_PATH, withRetry } from './db';
import { thinkingSpinner } from '../feedback';
import { header, section, kv, brand, icon, footer, progressBar, cta } from '../format';

const TEXT_EXTENSIONS = new Set([
	'.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.py', '.rs',
	'.go', '.java', '.c', '.cpp', '.h', '.hpp', '.css', '.scss', '.html',
	'.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.sh', '.bash',
	'.zsh', '.fish', '.sql', '.graphql', '.proto', '.swift', '.kt',
	'.rb', '.php', '.lua', '.r', '.m', '.vue', '.svelte', '.astro',
	'.env', '.gitignore', '.dockerfile', '.makefile',
]);

const IGNORE_DIRS = new Set([
	'node_modules', '.git', '.svn', 'dist', 'build', 'out', '.next',
	'__pycache__', '.cache', 'target', 'vendor', '.tarx', '.vscode',
	'coverage', '.nyc_output', '.turbo',
]);

function isTextFile(filepath: string): boolean {
	const ext = extname(filepath).toLowerCase();
	if (TEXT_EXTENSIONS.has(ext)) return true;
	const name = basename(filepath).toLowerCase();
	return ['makefile', 'dockerfile', 'readme', 'license', 'changelog'].some(n => name.startsWith(n));
}

function walkDir(dir: string, depth: number, maxDepth: number): string[] {
	if (depth > maxDepth) return [];
	const files: string[] = [];

	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith('.') && entry.name !== '.env') continue;
			const full = resolve(dir, entry.name);

			if (entry.isDirectory()) {
				if (IGNORE_DIRS.has(entry.name)) continue;
				files.push(...walkDir(full, depth + 1, maxDepth));
			} else if (entry.isFile() && isTextFile(full)) {
				try {
					const stat = statSync(full);
					if (stat.size > 0 && stat.size < 1024 * 1024) { // Max 1MB
						files.push(full);
					}
				} catch { /* skip */ }
			}
		}
	} catch { /* skip inaccessible dirs */ }

	return files;
}

function ensureDb(): any {
	const dir = dirname(DB_PATH);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	// If DB doesn't exist, create tables
	const Database = require('better-sqlite3');
	const db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');

	db.exec(`
		CREATE TABLE IF NOT EXISTS files (
			id TEXT PRIMARY KEY,
			filename TEXT,
			content TEXT,
			source_type TEXT DEFAULT 'cli_learn',
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

	return db;
}

async function learnFile(filepath: string, db: any): Promise<{ skipped: boolean; chunks: number }> {
	const content = readFileSync(filepath, 'utf-8');
	const hash = fileHash(content);
	const name = basename(filepath);

	// Dedup check
	const existing = db.prepare('SELECT id FROM files WHERE hash = ?').get(hash) as { id: string } | undefined;
	if (existing) {
		return { skipped: true, chunks: 0 };
	}

	const fileId = createHash('sha256').update(filepath + ':' + Date.now()).digest('hex').slice(0, 32);

	// Insert file record
	withRetry(() => {
		db.prepare(`
			INSERT INTO files (id, filename, content, source_type, hash)
			VALUES (?, ?, ?, 'cli_learn', ?)
		`).run(fileId, name, content, hash);
	});

	// Embed and store chunks
	const chunks = await embedAndStore(fileId, content, name, db);
	return { skipped: false, chunks };
}

export async function learn(args: string[]): Promise<void> {
	// Parse --depth flag
	let maxDepth = 3;
	const pathArgs: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--depth' && args[i + 1]) {
			maxDepth = parseInt(args[++i], 10) || 3;
		} else {
			pathArgs.push(args[i]);
		}
	}

	const target = pathArgs.join(' ');
	if (!target) {
		console.error('Usage: tarx learn <file|dir> [--depth N]');
		console.error('  Teach TARX about files by embedding them into the knowledge base');
		process.exit(1);
	}

	const resolved = resolve(target);
	if (!existsSync(resolved)) {
		console.error(`Not found: ${resolved}`);
		process.exit(1);
	}

	header('Learn', resolved);

	const stat = statSync(resolved);
	const db = ensureDb();

	try {
		if (stat.isFile()) {
			if (!isTextFile(resolved)) {
				console.log(`  ${icon.warning} ${brand.yellow('Not a text file — skipped.')}`);
				db.close();
				return;
			}
			const spin = thinkingSpinner(`Learning ${basename(resolved)}`);
			const result = await learnFile(resolved, db);
			if (result.skipped) {
				spin.stop('Already learned (duplicate hash)');
			} else {
				spin.stop(`Learned ${basename(resolved)} — ${result.chunks} chunks embedded`);
			}
		} else if (stat.isDirectory()) {
			const spin = thinkingSpinner('Scanning directory');
			const files = walkDir(resolved, 0, maxDepth);
			spin.stop(`Found ${files.length} text files`);

			if (files.length === 0) {
				console.log(`  ${brand.dim('No text files found in directory.')}`);
				db.close();
				return;
			}

			let learned = 0, skipped = 0, totalChunks = 0, errors = 0;

			for (let i = 0; i < files.length; i++) {
				progressBar('Learning', i + 1, files.length);
				try {
					const result = await learnFile(files[i], db);
					if (result.skipped) {
						skipped++;
					} else {
						learned++;
						totalChunks += result.chunks;
					}
				} catch {
					errors++;
				}
			}

			section('Summary');
			kv('Learned', `${learned} files`, learned > 0 ? 'ok' : undefined);
			kv('Chunks', `${totalChunks} embedded`, totalChunks > 0 ? 'ok' : undefined);
			if (skipped > 0) kv('Skipped', `${skipped} (already known)`);
			if (errors > 0) kv('Errors', `${errors}`, 'warn');
		}
	} finally {
		db.close();
	}

	footer('local');
}
