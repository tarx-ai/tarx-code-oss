/**
 * TARX CLI — Shared RAG utilities.
 * Search, chunk, embed+store, and format RAG results.
 */

import { embedQuery, embed } from '../services/embeddings';
import { openDb, dbExists, cosineSimilarity, withRetry } from './db';
import { createHash } from 'crypto';

export interface RagResult {
	content: string;
	score: number;
	source: string;
	sourceId: string;
}

/**
 * Search knowledge_embeddings using vector similarity.
 */
export async function ragSearch(query: string, topK = 5): Promise<RagResult[]> {
	if (!dbExists()) return [];

	const queryVec = await embedQuery(query);
	const db = openDb(true);

	try {
		const rows = db.prepare(`
			SELECT ke.content, ke.source_id, ke.title, ke.embedding, f.filename
			FROM knowledge_embeddings ke
			LEFT JOIN files f ON ke.source_id = f.id
			WHERE ke.embedding IS NOT NULL
			LIMIT 500
		`).all() as Array<{ content: string; source_id: string; title: string; embedding: Buffer; filename: string }>;

		if (rows.length === 0) return [];

		const results: RagResult[] = [];
		for (const row of rows) {
			try {
				if (!row.embedding || row.embedding.length < 16) continue;
				const emb = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
				if (emb.length !== queryVec.length) continue;

				const score = cosineSimilarity(queryVec, emb);
				if (score < 0.3) continue;

				results.push({
					content: row.content || '',
					score,
					source: row.filename || row.title || `source:${row.source_id}`,
					sourceId: row.source_id,
				});
			} catch {
				continue;
			}
		}

		results.sort((a, b) => b.score - a.score);
		return results.slice(0, topK);
	} finally {
		db.close();
	}
}

/**
 * Chunk text into overlapping segments.
 */
export function chunkText(text: string, size = 512, overlap = 128): string[] {
	const chunks: string[] = [];
	let start = 0;
	while (start < text.length) {
		chunks.push(text.slice(start, start + size));
		start += size - overlap;
	}
	return chunks;
}

/**
 * Embed text chunks and store in both knowledge_embeddings + chunk_embeddings.
 * Also sets files.indexed_at on success.
 */
export async function embedAndStore(
	fileId: string,
	content: string,
	filename: string,
	db: any
): Promise<number> {
	const chunks = chunkText(content);
	let stored = 0;

	const insertKnowledge = db.prepare(`
		INSERT INTO knowledge_embeddings (id, source_id, content, title, embedding, created_at)
		VALUES (?, ?, ?, ?, ?, datetime('now'))
	`);

	const insertChunk = db.prepare(`
		INSERT INTO chunk_embeddings (id, source_id, content, title, embedding, created_at)
		VALUES (?, ?, ?, ?, ?, datetime('now'))
	`);

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		if (chunk.trim().length < 10) continue;

		try {
			const vec = await embed(chunk);
			const vecBuf = Buffer.from(new Float32Array(vec).buffer);
			const chunkId = createHash('sha256').update(`${fileId}:${i}`).digest('hex').slice(0, 32);

			withRetry(() => {
				insertKnowledge.run(chunkId, fileId, chunk, filename, vecBuf);
			});

			withRetry(() => {
				insertChunk.run(chunkId, fileId, chunk, filename, vecBuf);
			});

			stored++;
		} catch {
			// Skip failed chunks, continue with rest
		}
	}

	// Set indexed_at
	if (stored > 0) {
		try {
			withRetry(() => {
				db.prepare(`UPDATE files SET indexed_at = datetime('now') WHERE id = ?`).run(fileId);
			});
		} catch { /* non-fatal */ }
	}

	return stored;
}

/**
 * Format RAG results into a context block for LLM consumption.
 */
export function buildRagContext(results: RagResult[]): string {
	if (results.length === 0) return '';
	const parts = results.map((r, i) =>
		`[Source ${i + 1}: ${r.source} (score: ${r.score.toFixed(3)})]\n${r.content}`
	);
	return `<context>\n${parts.join('\n\n')}\n</context>`;
}

/**
 * SHA256 hash of file content for dedup.
 */
export function fileHash(content: string): string {
	return createHash('sha256').update(content).digest('hex');
}
