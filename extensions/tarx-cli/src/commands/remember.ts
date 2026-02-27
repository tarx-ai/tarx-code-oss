/**
 * tarx remember <fact> — Store a memory with embedding.
 * Auto-classifies observation_type via quick local inference.
 */

import { createHash } from 'crypto';
import { embed } from '../services/embeddings';
import { chat } from '../services/inference';
import { ensureInferenceRunning } from '../services/engine';
import { openDb, dbExists, DB_PATH, withRetry } from './db';
import { thinkingSpinner } from '../feedback';
import { header, kv, brand, icon, footer } from '../format';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export async function remember(args: string[]): Promise<void> {
	const fact = args.join(' ');
	if (!fact) {
		console.error('Usage: tarx remember <fact>');
		console.error('  Store a fact or observation in TARX memory');
		process.exit(1);
	}

	header('Remember');

	// Ensure DB exists
	const dir = dirname(DB_PATH);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	const Database = require('better-sqlite3');
	const db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');

	db.exec(`
		CREATE TABLE IF NOT EXISTS memories (
			id TEXT PRIMARY KEY,
			content TEXT NOT NULL,
			observation_type TEXT,
			embedding BLOB,
			created_at TEXT DEFAULT (datetime('now')),
			deleted_at TEXT
		)
	`);

	const spin = thinkingSpinner('Remembering');

	// Auto-classify observation type
	let observationType = 'observation';
	try {
		const engineResult = await ensureInferenceRunning();
		if (!engineResult.error) {
			const typePrompt = `Classify this statement into ONE of these types: fact, preference, decision, observation, goal, warning, insight. Reply with only the type word, nothing else.\n\nStatement: "${fact}"`;
			const typeResult = await chat(typePrompt, { maxTokens: 10 });
			const cleaned = typeResult.trim().toLowerCase().replace(/[^a-z]/g, '');
			const validTypes = ['fact', 'preference', 'decision', 'observation', 'goal', 'warning', 'insight'];
			if (validTypes.includes(cleaned)) {
				observationType = cleaned;
			}
		}
	} catch {
		// Inference not available — use default type
	}

	// Generate embedding
	let vecBuf: Buffer | null = null;
	try {
		const vec = await embed(fact);
		vecBuf = Buffer.from(new Float32Array(vec).buffer);
	} catch {
		// Embedding server not available — store without embedding
	}

	// Insert memory
	const id = createHash('sha256').update(fact + Date.now()).digest('hex').slice(0, 32);

	withRetry(() => {
		db.prepare(`
			INSERT INTO memories (id, content, observation_type, embedding)
			VALUES (?, ?, ?, ?)
		`).run(id, fact, observationType, vecBuf);
	});

	db.close();

	spin.stop('Remembered');

	kv('Type', observationType, 'ok');
	kv('Content', fact.length > 60 ? fact.slice(0, 57) + '...' : fact);
	kv('ID', id.slice(0, 8));
	if (!vecBuf) {
		console.log(`  ${icon.warning} ${brand.yellow('Stored without embedding (embedding server offline)')}`);
	}

	footer('local');
}
