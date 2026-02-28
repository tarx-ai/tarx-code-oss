#!/usr/bin/env node
/**
 * TARX RAG Populate — indexes key docs into memory.db
 * Creates missing tables, chunks text, generates embeddings, stores in SQLite.
 *
 * Usage: node scripts/rag-populate.mjs [--dry-run]
 */

import { createRequire } from 'module';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, basename, extname } from 'path';
import { homedir } from 'os';
import { randomUUID, createHash } from 'crypto';

const require = createRequire(import.meta.url);
const bsqlPath = join(resolve(import.meta.url.replace('file://', ''), '../../extensions/tarx-core/node_modules/better-sqlite3'));
const Database = require(bsqlPath);

// --- Config ---
const DB_PATH = join(homedir(), 'Library/Application Support/tarx/memory.db');
const EMBED_URL = 'http://localhost:11437/v1/embeddings';
const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 128;
const DRY_RUN = process.argv.includes('--dry-run');

// --- Files to index ---
const TARX_ROOT = resolve(homedir(), 'Desktop/tarx-code-oss');
const KEY_DOCS = [
	join(TARX_ROOT, 'CLAUDE.md'),
	join(homedir(), '.tarx/priorities.jsonl'),
	join(homedir(), '.tarx/thinking.log'),
	join(homedir(), '.claude/projects/-Users-master/memory/MEMORY.md'),
	join(TARX_ROOT, 'extensions/tarx/docs/TARX_CONTEXT_PROTOCOL.md'),
	join(TARX_ROOT, 'product.json'),
];

// Key source directories (shallow scan — only .ts files, no node_modules)
const SOURCE_DIRS = [
	{ dir: join(TARX_ROOT, 'extensions/tarx-core/src'), glob: '.ts' },
	{ dir: join(TARX_ROOT, 'extensions/tarx-cli/src'), glob: '.ts' },
	{ dir: join(TARX_ROOT, 'extensions/tarx/src/chat'), glob: '.ts' },
	{ dir: join(TARX_ROOT, 'extensions/tarx/src/services'), glob: '.ts' },
];

// --- Helpers ---

function sha256(content) {
	return createHash('sha256').update(content).digest('hex');
}

function chunkText(text) {
	const chunks = [];
	const lines = text.split('\n');
	let currentChunk = '';
	let chunkStart = 0;
	let currentOffset = 0;
	let chunkIndex = 0;

	for (const line of lines) {
		const lineWithNewline = line + '\n';
		if (currentChunk.length + lineWithNewline.length > CHUNK_SIZE && currentChunk.length > 0) {
			chunks.push({ content: currentChunk.trim(), index: chunkIndex++, startOffset: chunkStart, endOffset: currentOffset });
			const overlapStart = Math.max(0, currentChunk.length - CHUNK_OVERLAP);
			currentChunk = currentChunk.slice(overlapStart) + lineWithNewline;
			chunkStart = currentOffset - (currentChunk.length - lineWithNewline.length);
		} else {
			currentChunk += lineWithNewline;
		}
		currentOffset += lineWithNewline.length;
	}
	if (currentChunk.trim().length > 0) {
		chunks.push({ content: currentChunk.trim(), index: chunkIndex, startOffset: chunkStart, endOffset: currentOffset });
	}
	return chunks;
}

async function generateEmbedding(text) {
	try {
		const res = await fetch(EMBED_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ input: text, model: 'nomic-embed' }),
		});
		if (!res.ok) { console.error(`  Embed failed: ${res.status}`); return null; }
		const data = await res.json();
		if (!data.data?.[0]?.embedding) return null;
		return new Float32Array(data.data[0].embedding);
	} catch (e) {
		console.error(`  Embed error: ${e.message}`);
		return null;
	}
}

function collectSourceFiles(dirs) {
	const files = [];
	for (const { dir, glob } of dirs) {
		if (!existsSync(dir)) continue;
		for (const f of readdirSync(dir)) {
			if (!f.endsWith(glob)) continue;
			const full = join(dir, f);
			if (statSync(full).isFile()) files.push(full);
		}
	}
	return files;
}

// --- Main ---
async function main() {
	console.log('TARX RAG Populate');
	console.log('=================\n');

	// Check embedding server
	try {
		const h = await fetch('http://localhost:11437/health');
		if (!h.ok) throw new Error('not ok');
		console.log('Embedding server: UP');
	} catch {
		console.error('ERROR: Embedding server not running on :11437');
		process.exit(1);
	}

	// Open DB
	const db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');

	// Create missing tables
	db.exec(`
		CREATE TABLE IF NOT EXISTS chunk_embeddings (
			id TEXT PRIMARY KEY,
			file_id TEXT,
			chunk_index INTEGER,
			content TEXT NOT NULL,
			embedding BLOB NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
		);
		CREATE TABLE IF NOT EXISTS knowledge_embeddings (
			id TEXT PRIMARY KEY,
			space_id TEXT NOT NULL DEFAULT '',
			source_type TEXT NOT NULL DEFAULT 'file',
			source_id TEXT,
			title TEXT,
			content TEXT NOT NULL,
			embedding BLOB NOT NULL,
			model TEXT DEFAULT 'nomic-embed-text-v1.5',
			original_dimensions INTEGER DEFAULT 768,
			stored_dimensions INTEGER DEFAULT 768,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge_embeddings(source_type, source_id);
		CREATE INDEX IF NOT EXISTS idx_chunk_file ON chunk_embeddings(file_id);
	`);
	console.log('Tables: ready\n');

	// Collect all files to index
	const allFiles = [
		...KEY_DOCS.filter(f => existsSync(f)),
		...collectSourceFiles(SOURCE_DIRS),
	];

	console.log(`Files to index: ${allFiles.length}`);
	if (DRY_RUN) {
		for (const f of allFiles) console.log(`  ${f}`);
		console.log('\nDry run — no changes made.');
		db.close();
		return;
	}

	// Prepare statements
	const insertChunk = db.prepare(
		'INSERT OR REPLACE INTO chunk_embeddings (id, file_id, chunk_index, content, embedding, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	);
	const insertKnowledge = db.prepare(
		`INSERT OR REPLACE INTO knowledge_embeddings
		 (id, space_id, source_type, source_id, title, content, embedding, model, original_dimensions, stored_dimensions, created_at, updated_at)
		 VALUES (?, '', 'file', ?, ?, ?, ?, 'nomic-embed-text-v1.5', 768, 768, ?, ?)`
	);
	const insertFile = db.prepare(
		`INSERT OR REPLACE INTO files
		 (id, filename, mime_type, size_bytes, storage_path, sha256_hash, created_at, last_accessed_at, reference_count, source_type, original_path, is_reference)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'local', ?, 1)`
	);

	let totalChunks = 0;
	let totalEmbeddings = 0;
	let totalFiles = 0;
	const now = Date.now();

	for (const filePath of allFiles) {
		const name = basename(filePath);
		const content = readFileSync(filePath, 'utf-8');
		if (!content.trim()) { console.log(`  SKIP (empty): ${name}`); continue; }

		const hash = sha256(content);
		const fileId = `rag-${hash.slice(0, 16)}`;
		const ext = extname(name).slice(1);
		const mime = ext === 'ts' ? 'text/typescript' : ext === 'json' ? 'application/json' : ext === 'md' ? 'text/markdown' : ext === 'jsonl' ? 'application/jsonl' : 'text/plain';

		// Insert file record
		insertFile.run(fileId, name, mime, content.length, filePath, hash, now, now, filePath);
		totalFiles++;

		// Clear old embeddings for this file
		db.prepare('DELETE FROM chunk_embeddings WHERE file_id = ?').run(fileId);
		db.prepare("DELETE FROM knowledge_embeddings WHERE source_type = 'file' AND source_id = ?").run(fileId);

		// Chunk
		const chunks = chunkText(content);
		totalChunks += chunks.length;

		console.log(`  ${name}: ${content.length} bytes, ${chunks.length} chunks`);

		// Embed each chunk
		for (const chunk of chunks) {
			const embedding = await generateEmbedding(`search_document: ${chunk.content}`);
			if (!embedding) { console.log(`    chunk ${chunk.index}: embed FAILED`); continue; }

			const buffer = Buffer.from(embedding.buffer);
			const chunkId = randomUUID();

			insertChunk.run(chunkId, fileId, chunk.index, chunk.content, buffer, now);
			insertKnowledge.run(`ke_${chunkId}`, fileId, name, chunk.content, buffer, now, now);
			totalEmbeddings++;
		}
	}

	console.log(`\nDone.`);
	console.log(`  Files:      ${totalFiles}`);
	console.log(`  Chunks:     ${totalChunks}`);
	console.log(`  Embeddings: ${totalEmbeddings}`);
	console.log(`  Tables:     chunk_embeddings + knowledge_embeddings`);

	// Verify
	const ceCount = db.prepare('SELECT COUNT(*) as c FROM chunk_embeddings').get();
	const keCount = db.prepare('SELECT COUNT(*) as c FROM knowledge_embeddings').get();
	const fCount = db.prepare('SELECT COUNT(*) as c FROM files').get();
	console.log(`\nDB totals: ${fCount.c} files, ${ceCount.c} chunk_embeddings, ${keCount.c} knowledge_embeddings`);

	db.close();
}

main().catch(e => { console.error(`Fatal: ${e.message}`); process.exit(1); });
