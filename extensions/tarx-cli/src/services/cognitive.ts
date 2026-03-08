/**
 * TARX Cognitive Engine — HTTP server on port 11438
 *
 * Brain layer that observes sessions, computes cognitive state
 * (focus depth, decision fatigue, context readiness), and feeds TarxTicker.
 *
 * Runs inside the daemon process alongside inference (11435),
 * mesh (11436), and embeddings (11437).
 */

import * as http from 'http';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import { embed, embedQuery } from './embeddings';

const PORT = 11438;
const DB_PATH = path.join(
	os.homedir(),
	'Library',
	'Application Support',
	'tarx',
	'memory.db'
);

let server: http.Server | null = null;
let db: Database.Database | null = null;

// ── Schema ──

function ensureSchema(): void {
	if (!db) return;

	db.exec(`
		CREATE TABLE IF NOT EXISTS cognitive_conversations (
			id TEXT PRIMARY KEY,
			title TEXT,
			summary TEXT,
			key_decisions TEXT,
			topics TEXT,
			full_text TEXT,
			source TEXT,
			duration_seconds INTEGER,
			created_at INTEGER
		);
		CREATE INDEX IF NOT EXISTS idx_cog_conv_created
			ON cognitive_conversations(created_at);
		CREATE INDEX IF NOT EXISTS idx_cog_conv_source
			ON cognitive_conversations(source);
	`);

	// Ensure memories table exists (shared with tarx-core, but cognitive engine
	// may start first — idempotent CREATE IF NOT EXISTS)
	db.exec(`
		CREATE TABLE IF NOT EXISTS memories (
			id TEXT PRIMARY KEY,
			content TEXT NOT NULL,
			embedding BLOB,
			source TEXT DEFAULT 'claude',
			source_id TEXT,
			importance REAL DEFAULT 0.5,
			access_count INTEGER DEFAULT 0,
			last_accessed_at INTEGER,
			created_at INTEGER NOT NULL,
			deleted_at INTEGER,
			title TEXT,
			observation_type TEXT,
			narrative TEXT,
			facts TEXT,
			concepts TEXT,
			files_read TEXT,
			files_modified TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
	`);

	// Ensure spaces + sessions tables exist (shared with tarx-core)
	db.exec(`
		CREATE TABLE IF NOT EXISTS spaces (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT,
			created_at INTEGER NOT NULL,
			last_accessed_at INTEGER,
			deleted_at INTEGER
		);
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			space_id TEXT NOT NULL,
			title TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			message_count INTEGER DEFAULT 0,
			total_tokens INTEGER DEFAULT 0,
			model TEXT,
			deleted_at INTEGER,
			FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
		);
		CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
	`);
}

// ── Helpers ──

function now(): number {
	return Math.floor(Date.now() / 1000);
}

function jsonParse<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function chunkText(text: string, size = 512, overlap = 128): string[] {
	const chunks: string[] = [];
	let offset = 0;
	while (offset < text.length) {
		chunks.push(text.slice(offset, offset + size));
		offset += size - overlap;
	}
	return chunks;
}

function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = '';
		req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
		req.on('end', () => resolve(body));
		req.on('error', reject);
	});
}

function sendJSON(res: http.ServerResponse, status: number, data: unknown): void {
	const body = JSON.stringify(data);
	res.writeHead(status, {
		'Content-Type': 'application/json',
		'Content-Length': Buffer.byteLength(body),
		'Access-Control-Allow-Origin': '*'
	});
	res.end(body);
}

// ── Cognitive Scoring ──

interface CognitiveState {
	focus_depth: 'deep' | 'moderate' | 'scattered' | 'unknown';
	decision_fatigue: 'low' | 'medium' | 'high';
	context_readiness: 'primed' | 'loading' | 'cold';
	cognitive_score: number;
	recommended_style: 'concise' | 'structured' | 'restorative' | 'collaborative';
	window: {
		start: number;
		end: number;
		session_count: number;
		total_decisions: number;
		distinct_topics: number;
	};
}

function computeCognitiveState(): CognitiveState {
	if (!db) {
		return defaultCognitiveState();
	}

	const nowSec = now();
	const twoHoursAgo = nowSec - 7200;
	const thirtyMinAgo = nowSec - 1800;

	// Pull conversations from the 2h window
	const rows = db.prepare(`
		SELECT topics, key_decisions, duration_seconds, created_at
		FROM cognitive_conversations
		WHERE created_at >= ?
		ORDER BY created_at DESC
	`).all(twoHoursAgo) as Array<{
		topics: string | null;
		key_decisions: string | null;
		duration_seconds: number | null;
		created_at: number;
	}>;

	if (rows.length === 0) {
		return defaultCognitiveState();
	}

	// Collect all distinct topics and total decisions
	const topicSet = new Set<string>();
	let totalDecisions = 0;
	let totalMessages = 0;

	for (const row of rows) {
		const topics = jsonParse<string[]>(row.topics, []);
		for (const t of topics) topicSet.add(t.toLowerCase());

		const decisions = jsonParse<string[]>(row.key_decisions, []);
		totalDecisions += decisions.length;

		// Estimate message depth from duration (rough: 1 msg per 30s)
		totalMessages += Math.max(1, Math.floor((row.duration_seconds || 60) / 30));
	}

	const sessionCount = rows.length;
	const distinctTopics = topicSet.size;

	// Context switch rate = distinct topics / total sessions
	const contextSwitchRate = sessionCount > 0 ? distinctTopics / sessionCount : 0;

	// Focus depth
	let focusDepth: CognitiveState['focus_depth'];
	const avgDepth = totalMessages / Math.max(1, sessionCount);
	if (contextSwitchRate < 0.3 && avgDepth > 20) {
		focusDepth = 'deep';
	} else if (contextSwitchRate <= 0.6) {
		focusDepth = 'moderate';
	} else {
		focusDepth = 'scattered';
	}

	// Decision fatigue
	let decisionFatigue: CognitiveState['decision_fatigue'];
	if (totalDecisions < 3) {
		decisionFatigue = 'low';
	} else if (totalDecisions <= 8) {
		decisionFatigue = 'medium';
	} else {
		decisionFatigue = 'high';
	}

	// Context readiness
	const recentRows = rows.filter(r => r.created_at >= thirtyMinAgo);
	let contextReadiness: CognitiveState['context_readiness'];
	if (recentRows.length > 0) {
		contextReadiness = 'primed';
	} else if (rows.length > 0) {
		contextReadiness = 'loading';
	} else {
		contextReadiness = 'cold';
	}

	// Recommended style
	let recommendedStyle: CognitiveState['recommended_style'];
	if (decisionFatigue === 'high') {
		recommendedStyle = 'restorative';
	} else if (focusDepth === 'scattered') {
		recommendedStyle = 'structured';
	} else if (focusDepth === 'deep' && decisionFatigue === 'low') {
		recommendedStyle = 'concise';
	} else {
		recommendedStyle = 'collaborative';
	}

	// Cognitive score = 100 - (switch_rate * 30) - (decision_vel_norm * 20) + (depth_bonus * 10)
	const decisionVelNorm = Math.min(totalDecisions / 10, 1);
	const depthBonus = focusDepth === 'deep' ? 1 : focusDepth === 'moderate' ? 0.5 : 0;
	const cognitiveScore = Math.round(
		Math.max(0, Math.min(100,
			100 - (contextSwitchRate * 30) - (decisionVelNorm * 20) + (depthBonus * 10)
		))
	);

	return {
		focus_depth: focusDepth,
		decision_fatigue: decisionFatigue,
		context_readiness: contextReadiness,
		cognitive_score: cognitiveScore,
		recommended_style: recommendedStyle,
		window: {
			start: twoHoursAgo,
			end: nowSec,
			session_count: sessionCount,
			total_decisions: totalDecisions,
			distinct_topics: distinctTopics
		}
	};
}

function defaultCognitiveState(): CognitiveState {
	const nowSec = now();
	return {
		focus_depth: 'unknown',
		decision_fatigue: 'low',
		context_readiness: 'cold',
		cognitive_score: 100,
		recommended_style: 'collaborative',
		window: {
			start: nowSec - 7200,
			end: nowSec,
			session_count: 0,
			total_decisions: 0,
			distinct_topics: 0
		}
	};
}

// ── Activity ──

interface ActivityEntry {
	id: string;
	title: string | null;
	summary: string | null;
	source: string | null;
	topics: string[];
	decision_count: number;
	duration_seconds: number | null;
	created_at: number;
	relative: string;
}

function getRecentActivity(): ActivityEntry[] {
	if (!db) return [];

	const oneDayAgo = now() - 86400;

	const rows = db.prepare(`
		SELECT id, title, summary, source, topics, key_decisions,
		       duration_seconds, created_at
		FROM cognitive_conversations
		WHERE created_at >= ?
		ORDER BY created_at DESC
		LIMIT 50
	`).all(oneDayAgo) as Array<{
		id: string;
		title: string | null;
		summary: string | null;
		source: string | null;
		topics: string | null;
		key_decisions: string | null;
		duration_seconds: number | null;
		created_at: number;
	}>;

	const nowSec = now();
	return rows.map(r => {
		const ageSec = nowSec - r.created_at;
		let relative: string;
		if (ageSec < 60) {
			relative = 'just now';
		} else if (ageSec < 3600) {
			relative = `${Math.floor(ageSec / 60)}m ago`;
		} else {
			relative = `${Math.floor(ageSec / 3600)}h ago`;
		}

		return {
			id: r.id,
			title: r.title,
			summary: r.summary,
			source: r.source,
			topics: jsonParse<string[]>(r.topics, []),
			decision_count: jsonParse<string[]>(r.key_decisions, []).length,
			duration_seconds: r.duration_seconds,
			created_at: r.created_at,
			relative
		};
	});
}

// ── Request Handler ──

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
	// CORS preflight
	if (req.method === 'OPTIONS') {
		res.writeHead(204, {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		});
		res.end();
		return;
	}

	const url = req.url || '/';

	try {
		// GET /health
		if (req.method === 'GET' && url === '/health') {
			sendJSON(res, 200, { status: 'ok', service: 'cognitive-engine', port: PORT });
			return;
		}

		// GET /v1/cognitive/state
		if (req.method === 'GET' && url === '/v1/cognitive/state') {
			const state = computeCognitiveState();
			sendJSON(res, 200, state);
			return;
		}

		// GET /v1/activity/recent
		if (req.method === 'GET' && url === '/v1/activity/recent') {
			const activity = getRecentActivity();
			sendJSON(res, 200, { activity, count: activity.length });
			return;
		}

		// POST /v1/conversations
		if (req.method === 'POST' && url === '/v1/conversations') {
			const rawBody = await readBody(req);
			let payload: {
				title?: string;
				summary?: string;
				key_decisions?: string[];
				topics?: string[];
				full_text?: string;
				source?: string;
				duration_seconds?: number;
			};
			try {
				payload = JSON.parse(rawBody);
			} catch {
				sendJSON(res, 400, { error: 'Invalid JSON' });
				return;
			}

			if (!db) {
				sendJSON(res, 503, { error: 'Database not available' });
				return;
			}

			const id = crypto.randomUUID();
			const createdAt = now();

			db.prepare(`
				INSERT INTO cognitive_conversations
					(id, title, summary, key_decisions, topics, full_text, source, duration_seconds, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).run(
				id,
				payload.title || null,
				payload.summary || null,
				JSON.stringify(payload.key_decisions || []),
				JSON.stringify(payload.topics || []),
				payload.full_text || null,
				payload.source || 'unknown',
				payload.duration_seconds || null,
				createdAt
			);

			// Async: chunk + embed full_text to RAG (fire-and-forget)
			if (payload.full_text && payload.full_text.length > 0) {
				embedConversation(id, payload.title || 'untitled', payload.full_text).catch(() => {
					// Embedding failure is non-fatal
				});
			}

			sendJSON(res, 201, { id, created_at: createdAt });
			return;
		}

		// POST /v1/memory
		if (req.method === 'POST' && url === '/v1/memory') {
			const rawBody = await readBody(req);
			let payload: { key: string; value: string; tags?: string[]; ttl_days?: number };
			try {
				payload = JSON.parse(rawBody);
			} catch {
				sendJSON(res, 400, { error: 'Invalid JSON' });
				return;
			}
			if (!payload.key || !payload.value) {
				sendJSON(res, 400, { error: 'key and value are required' });
				return;
			}
			if (!db) {
				sendJSON(res, 503, { error: 'Database not available' });
				return;
			}
			const id = crypto.randomUUID();
			const createdAt = now();
			const tagsJson = JSON.stringify(payload.tags || []);

			// Store in memories table
			db.prepare(`
				INSERT INTO memories (id, content, source, importance, created_at, title)
				VALUES (?, ?, 'mcp', 0.5, ?, ?)
			`).run(id, payload.value, createdAt, payload.key);

			// Async: embed for semantic search (fire-and-forget)
			embed(`${payload.key}: ${payload.value}`).then(vector => {
				if (db) {
					db.prepare(`UPDATE memories SET embedding = ? WHERE id = ?`)
						.run(Buffer.from(new Float32Array(vector).buffer), id);
				}
			}).catch(() => { /* embedding failure is non-fatal */ });

			sendJSON(res, 201, { stored: true, key: payload.key, id, tags: payload.tags || [] });
			return;
		}

		// POST /v1/memory/search
		if (req.method === 'POST' && url === '/v1/memory/search') {
			const rawBody = await readBody(req);
			let payload: { query: string; limit?: number; tags?: string[] };
			try {
				payload = JSON.parse(rawBody);
			} catch {
				sendJSON(res, 400, { error: 'Invalid JSON' });
				return;
			}
			if (!payload.query) {
				sendJSON(res, 400, { error: 'query is required' });
				return;
			}
			if (!db) {
				sendJSON(res, 503, { error: 'Database not available' });
				return;
			}

			const limit = payload.limit || 10;

			try {
				// Embed query for semantic search
				const queryVector = await embedQuery(payload.query);
				const queryBuf = new Float32Array(queryVector);

				// Get all memories with embeddings
				const rows = db.prepare(`
					SELECT id, title, content, embedding, created_at
					FROM memories
					WHERE embedding IS NOT NULL AND deleted_at IS NULL
					ORDER BY created_at DESC
					LIMIT 200
				`).all() as Array<{ id: string; title: string | null; content: string; embedding: Buffer; created_at: number }>;

				// Compute cosine similarity
				const scored = rows.map(row => {
					const emb = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
					let dot = 0, normA = 0, normB = 0;
					for (let i = 0; i < Math.min(emb.length, queryBuf.length); i++) {
						dot += emb[i] * queryBuf[i];
						normA += emb[i] * emb[i];
						normB += queryBuf[i] * queryBuf[i];
					}
					const similarity = normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
					return {
						key: row.title || row.id,
						value: row.content,
						relevance: Math.round(similarity * 1000) / 1000,
						created_at: row.created_at,
					};
				});

				scored.sort((a, b) => b.relevance - a.relevance);
				sendJSON(res, 200, { results: scored.slice(0, limit) });
			} catch {
				// Embedding server down — fallback to text search
				const rows = db.prepare(`
					SELECT id, title, content, created_at
					FROM memories
					WHERE deleted_at IS NULL AND (content LIKE ? OR title LIKE ?)
					ORDER BY created_at DESC
					LIMIT ?
				`).all(`%${payload.query}%`, `%${payload.query}%`, limit) as Array<{ id: string; title: string | null; content: string; created_at: number }>;

				sendJSON(res, 200, {
					results: rows.map(r => ({
						key: r.title || r.id,
						value: r.content,
						relevance: 0.5,
						created_at: r.created_at,
					})),
					note: 'text_search_fallback',
				});
			}
			return;
		}

		// GET /v1/sessions — list sessions
		if (req.method === 'GET' && url === '/v1/sessions') {
			if (!db) {
				sendJSON(res, 503, { error: 'Database not available' });
				return;
			}
			const rows = db.prepare(`
				SELECT id, title, created_at, updated_at, message_count
				FROM sessions
				WHERE deleted_at IS NULL
				ORDER BY updated_at DESC
				LIMIT 50
			`).all() as Array<{ id: string; title: string | null; created_at: number; updated_at: number; message_count: number }>;

			sendJSON(res, 200, {
				sessions: rows.map(r => ({
					session_id: r.id,
					name: r.title || r.id,
					last_active: r.updated_at,
					messages_count: r.message_count,
				})),
			});
			return;
		}

		// POST /v1/sessions — create session
		if (req.method === 'POST' && url === '/v1/sessions') {
			const rawBody = await readBody(req);
			let payload: { name?: string };
			try {
				payload = JSON.parse(rawBody);
			} catch {
				payload = {};
			}
			if (!db) {
				sendJSON(res, 503, { error: 'Database not available' });
				return;
			}
			const id = crypto.randomUUID();
			const createdAt = now();
			const name = payload.name || `session-${createdAt}`;

			// Sessions require a space_id — create or use default space
			let spaceId: string;
			const defaultSpace = db.prepare(`SELECT id FROM spaces WHERE deleted_at IS NULL ORDER BY last_accessed_at DESC LIMIT 1`).get() as { id: string } | undefined;
			if (defaultSpace) {
				spaceId = defaultSpace.id;
			} else {
				spaceId = crypto.randomUUID();
				db.prepare(`INSERT INTO spaces (id, name, created_at, last_accessed_at) VALUES (?, 'Default', ?, ?)`).run(spaceId, createdAt, createdAt);
			}

			db.prepare(`
				INSERT INTO sessions (id, space_id, title, created_at, updated_at, message_count)
				VALUES (?, ?, ?, ?, ?, 0)
			`).run(id, spaceId, name, createdAt, createdAt);

			sendJSON(res, 201, { session_id: id, name, created_at: createdAt });
			return;
		}

		// GET /v1/sessions/:id — resume/get session
		if (req.method === 'GET' && url.startsWith('/v1/sessions/') && url.split('/').length === 4) {
			const sessionId = url.split('/')[3];
			if (!db) {
				sendJSON(res, 503, { error: 'Database not available' });
				return;
			}
			const row = db.prepare(`
				SELECT id, title, created_at, updated_at, message_count
				FROM sessions WHERE id = ? AND deleted_at IS NULL
			`).get(sessionId) as { id: string; title: string | null; created_at: number; updated_at: number; message_count: number } | undefined;

			if (!row) {
				sendJSON(res, 404, { error: 'session_not_found', session_id: sessionId });
				return;
			}
			sendJSON(res, 200, {
				session_id: row.id,
				name: row.title || row.id,
				messages_count: row.message_count,
				last_active: row.updated_at,
			});
			return;
		}

		// DELETE /v1/sessions/:id — close session
		if (req.method === 'DELETE' && url.startsWith('/v1/sessions/') && url.split('/').length === 4) {
			const sessionId = url.split('/')[3];
			if (!db) {
				sendJSON(res, 503, { error: 'Database not available' });
				return;
			}
			db.prepare(`UPDATE sessions SET deleted_at = ? WHERE id = ?`).run(now(), sessionId);
			sendJSON(res, 200, { closed: true, session_id: sessionId });
			return;
		}

		// GET /v1/version
		if (req.method === 'GET' && url === '/v1/version') {
			sendJSON(res, 200, {
				version: '1.0.0',
				service: 'tarx-daemon',
				build_date: '2026-03-08',
				platform: process.platform,
				arch: process.arch,
				node: process.version,
			});
			return;
		}

		// 404
		sendJSON(res, 404, { error: 'Not found' });
	} catch (err: any) {
		sendJSON(res, 500, { error: err.message || 'Internal error' });
	}
}

// ── RAG Embedding ──

async function embedConversation(id: string, title: string, fullText: string): Promise<void> {
	const chunks = chunkText(fullText);

	for (let i = 0; i < chunks.length; i++) {
		const text = `${title}: ${chunks[i]}`;
		try {
			const vector = await embed(text);

			if (db) {
				// Write to knowledge_embeddings (the search-active table)
				db.prepare(`
					INSERT OR REPLACE INTO knowledge_embeddings
						(id, content, embedding, source, created_at)
					VALUES (?, ?, ?, ?, ?)
				`).run(
					`cog-${id}-${i}`,
					text,
					Buffer.from(new Float32Array(vector).buffer),
					'cognitive',
					now()
				);
			}
		} catch {
			// Embedding server may be down — skip silently
		}
	}
}

// ── Lifecycle ──

export function startCognitiveEngine(): http.Server {
	// Open SQLite
	try {
		db = new Database(DB_PATH);
		db.pragma('journal_mode = WAL');
		db.pragma('busy_timeout = 5000');
		ensureSchema();
	} catch (err: any) {
		console.error(`[cognitive] DB open failed: ${err.message}`);
		// Continue without DB — health endpoint still works
	}

	server = http.createServer(handleRequest);
	server.listen(PORT, '127.0.0.1', () => {
		// Logged by daemon.ts after call returns
	});

	server.on('error', (err: any) => {
		if (err.code === 'EADDRINUSE') {
			console.error(`[cognitive] Port ${PORT} already in use — adopting external`);
		} else {
			console.error(`[cognitive] Server error: ${err.message}`);
		}
	});

	return server;
}

export function stopCognitiveEngine(): Promise<void> {
	return new Promise<void>((resolve) => {
		if (db) {
			try { db.close(); } catch {}
			db = null;
		}
		if (server) {
			server.close(() => {
				server = null;
				resolve();
			});
		} else {
			resolve();
		}
	});
}
