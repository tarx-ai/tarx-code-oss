/**
 * tarx index — RAG health dashboard.
 * Shows total chunks, file breakdown, coverage, DB size, top files, embedding server status.
 */

import { statSync } from 'fs';
import { openDb, dbExists, DB_PATH } from './db';
import { checkHealth as checkEmbeddingHealth } from '../services/embeddings';
import { header, section, kv, brand, icon, footer, progressBar } from '../format';

export async function indexStats(): Promise<void> {
	header('Index', 'RAG knowledge base health');

	if (!dbExists()) {
		console.log(`  ${brand.dim('No knowledge base found.')}`);
		console.log(`  ${brand.dim('Use')} ${brand.cmd('tarx learn <file|dir>')} ${brand.dim('to get started.')}`);
		return;
	}

	const db = openDb(true);

	// Chunk stats
	let totalChunks = 0;
	try {
		const row = db.prepare('SELECT COUNT(*) as cnt FROM knowledge_embeddings').get() as { cnt: number };
		totalChunks = row.cnt;
	} catch { /* table missing */ }

	// File stats by source type
	let totalFiles = 0;
	let uploaded = 0, scanned = 0, learned = 0;
	let indexedFiles = 0;
	try {
		const rows = db.prepare(`
			SELECT source_type, COUNT(*) as cnt FROM files GROUP BY source_type
		`).all() as Array<{ source_type: string; cnt: number }>;
		for (const r of rows) {
			totalFiles += r.cnt;
			if (r.source_type === 'upload') uploaded = r.cnt;
			else if (r.source_type === 'scan' || r.source_type === 'reference') scanned += r.cnt;
			else if (r.source_type === 'cli_learn') learned = r.cnt;
		}
	} catch { /* table missing */ }

	try {
		const row = db.prepare('SELECT COUNT(*) as cnt FROM files WHERE indexed_at IS NOT NULL').get() as { cnt: number };
		indexedFiles = row.cnt;
	} catch { /* table missing */ }

	// Top 5 largest files (by chunk count)
	let topFiles: Array<{ filename: string; chunks: number }> = [];
	try {
		topFiles = db.prepare(`
			SELECT f.filename, COUNT(ke.id) as chunks
			FROM files f
			JOIN knowledge_embeddings ke ON ke.source_id = f.id
			GROUP BY f.id
			ORDER BY chunks DESC
			LIMIT 5
		`).all() as typeof topFiles;
	} catch { /* table missing */ }

	db.close();

	// Embedding server status
	const embHealth = await checkEmbeddingHealth();

	// Display
	section('Chunks');
	kv('Total', String(totalChunks), totalChunks > 0 ? 'ok' : undefined);

	section('Files');
	kv('Total', String(totalFiles), totalFiles > 0 ? 'ok' : undefined);
	if (uploaded) kv('  Uploaded', String(uploaded));
	if (scanned) kv('  Scanned', String(scanned));
	if (learned) kv('  CLI learned', String(learned));

	// Coverage bar
	if (totalFiles > 0) {
		section('Coverage');
		progressBar('Indexed', indexedFiles, totalFiles);
	}

	// DB size
	section('Database');
	try {
		const size = statSync(DB_PATH).size;
		kv('Size', `${(size / 1024 / 1024).toFixed(1)} MB`);
		kv('Path', DB_PATH);
	} catch {
		kv('Path', DB_PATH);
	}

	// Top files
	if (topFiles.length > 0) {
		section('Top Files (by chunks)');
		for (const f of topFiles) {
			console.log(`  ${icon.arrow} ${f.filename} ${brand.dim(`(${f.chunks} chunks)`)}`);
		}
	}

	// Embedding server
	section('Embedding Server');
	if (embHealth.healthy) {
		kv('Status', 'online :11437', 'ok');
		if (embHealth.model) kv('Model', embHealth.model);
	} else {
		kv('Status', `offline — ${embHealth.error || 'unreachable'}`, 'error');
	}

	footer('local');
}
