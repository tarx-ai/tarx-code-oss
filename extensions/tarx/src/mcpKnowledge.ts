/*---------------------------------------------------------------------------------------------
 *  MCP Knowledge Database Integration
 *
 *  Queries the MCP server's SQLite database (memory.db) for knowledge embeddings
 *  to include uploaded files in RAG context.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Database path - must match MCP server
const DB_PATH = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

// ============================================================================
// DATABASE CONNECTION POOLING (Performance optimization)
// Reuses sql.js WASM instance and database connection across calls
// ============================================================================

interface SqlJsDatabase {
	exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
	prepare(sql: string): SqlJsStatement;
	run(sql: string, params?: unknown[]): void;
	export(): Uint8Array;
	close(): void;
}

interface SqlJsStatement {
	bind(params?: unknown[]): void;
	step(): boolean;
	getAsObject(): Record<string, unknown>;
	free(): void;
}

interface SqlJsStatic {
	Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
}

// Singleton instances - initialized once, reused across all calls
let sqlJsInstance: SqlJsStatic | null = null;
let dbInstance: SqlJsDatabase | null = null;
let dbLastModified: number = 0;

/**
 * Get or create the cached database connection
 * Only reinitializes if the database file has been modified
 *
 * Performance: ~10ms (cached) vs ~250ms (uncached)
 */
async function getDatabase(): Promise<SqlJsDatabase | null> {
	if (!fs.existsSync(DB_PATH)) {
		return null;
	}

	// Check if database file has been modified
	const stats = fs.statSync(DB_PATH);
	const currentModified = stats.mtimeMs;

	// If we have a cached instance and file hasn't changed, reuse it
	if (dbInstance && currentModified === dbLastModified) {
		return dbInstance;
	}

	try {
		// Initialize sql.js WASM once
		if (!sqlJsInstance) {
			console.log('[TARX-MCP] Initializing sql.js (one-time)');
			const initSqlJs = require('sql.js');
			sqlJsInstance = await initSqlJs() as SqlJsStatic;
		}

		// Close previous instance if file changed
		if (dbInstance) {
			try {
				dbInstance.close();
			} catch {
				// Ignore close errors
			}
		}

		// Load database from file
		const fileBuffer = fs.readFileSync(DB_PATH);
		dbInstance = new sqlJsInstance.Database(fileBuffer);
		dbLastModified = currentModified;

		console.log('[TARX-MCP] Database loaded (cached for subsequent calls)');
		return dbInstance;

	} catch (error) {
		console.error('[TARX-MCP] Failed to initialize database:', error);
		return null;
	}
}

/**
 * Save database changes back to file
 * Call after any write operations
 */
function saveDatabase(): void {
	if (!dbInstance) return;

	try {
		const data = dbInstance.export();
		const buffer = Buffer.from(data);
		fs.writeFileSync(DB_PATH, buffer);
		// Update last modified time to match
		const stats = fs.statSync(DB_PATH);
		dbLastModified = stats.mtimeMs;
	} catch (error) {
		console.error('[TARX-MCP] Failed to save database:', error);
	}
}

/**
 * Close the cached database connection
 * Call on extension deactivate to free resources
 */
export function closeMCPDatabase(): void {
	if (dbInstance) {
		try {
			dbInstance.close();
			console.log('[TARX-MCP] Database connection closed');
		} catch {
			// Ignore close errors
		}
		dbInstance = null;
	}
	sqlJsInstance = null;
	dbLastModified = 0;
}

// ============================================================================
// KNOWLEDGE SEARCH
// ============================================================================

interface KnowledgeChunk {
	content: string;
	title: string;
	similarity: number;
	sourceId: string | null;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	const len = Math.min(a.length, b.length);
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < len; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
	return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Search MCP knowledge embeddings for relevant content
 * Uses cached sql.js connection for fast queries (~10ms vs ~250ms uncached)
 */
export async function searchMCPKnowledge(
	spaceId: string | null,
	queryEmbedding: Float32Array,
	limit: number = 5
): Promise<KnowledgeChunk[]> {
	const db = await getDatabase();
	if (!db) {
		return [];
	}

	try {
		// Query knowledge embeddings
		let query = 'SELECT source_id, title, content, embedding FROM knowledge_embeddings';
		const params: string[] = [];

		if (spaceId) {
			query += ' WHERE space_id = ?';
			params.push(spaceId);
		}

		const stmt = db.prepare(query);
		if (params.length > 0) {
			stmt.bind(params);
		}

		const results: KnowledgeChunk[] = [];

		while (stmt.step()) {
			const row = stmt.getAsObject() as {
				source_id: string | null;
				title: string;
				content: string;
				embedding: Uint8Array;
			};

			// Convert embedding blob to Float32Array
			const embeddingBuffer = row.embedding;
			const storedEmbedding = new Float32Array(
				embeddingBuffer.buffer,
				embeddingBuffer.byteOffset,
				embeddingBuffer.byteLength / 4
			);

			// Calculate similarity
			const similarity = cosineSimilarity(queryEmbedding, storedEmbedding);

			results.push({
				content: row.content,
				title: row.title,
				similarity,
				sourceId: row.source_id
			});
		}

		stmt.free();
		// Don't close db - keep it cached for next query

		// Sort by similarity and return top results
		return results
			.sort((a, b) => b.similarity - a.similarity)
			.slice(0, limit);

	} catch (error) {
		console.error('[TARX] Failed to search MCP knowledge:', error);
		return [];
	}
}

/**
 * Get count of knowledge embeddings in MCP database
 */
export async function getMCPKnowledgeCount(spaceId?: string): Promise<number> {
	const db = await getDatabase();
	if (!db) {
		return 0;
	}

	try {
		let query = 'SELECT COUNT(*) as count FROM knowledge_embeddings';
		if (spaceId) {
			query += ' WHERE space_id = ?';
		}

		const result = db.exec(query, spaceId ? [spaceId] : undefined);
		return result[0]?.values[0]?.[0] as number || 0;

	} catch (error) {
		console.error('[TARX] Failed to get MCP knowledge count:', error);
		return 0;
	}
}

/**
 * List available spaces in MCP database
 */
export async function listMCPSpaces(): Promise<Array<{ id: string; name: string; emoji: string; description: string | null; message_count: number; created_at: number }>> {
	const db = await getDatabase();
	if (!db) {
		return [];
	}

	try {
		const result = db.exec('SELECT id, name, emoji, description, message_count, created_at FROM spaces WHERE deleted_at IS NULL ORDER BY last_accessed_at DESC');

		if (!result[0]?.values) {
			return [];
		}

		return (result[0].values as (string | number | null)[][]).map((row) => ({
			id: row[0] as string,
			name: row[1] as string,
			emoji: row[2] as string || '📁',
			description: row[3] as string | null,
			message_count: row[4] as number || 0,
			created_at: row[5] as number
		}));

	} catch (error) {
		console.error('[TARX] Failed to list MCP spaces:', error);
		return [];
	}
}

// ============================================================================
// PROJECT/SPACE MANAGEMENT
// ============================================================================

export interface MCPSpace {
	id: string;
	name: string;
	description: string | null;
	emoji: string;
	created_at: number;
	updated_at: number;
	last_accessed_at: number;
	message_count: number;
	total_tokens: number;
}

/**
 * Get a single space by ID
 */
export async function getMCPSpace(spaceId: string): Promise<MCPSpace | null> {
	const db = await getDatabase();
	if (!db) {
		return null;
	}

	try {
		const stmt = db.prepare('SELECT id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens FROM spaces WHERE id = ? AND deleted_at IS NULL');
		stmt.bind([spaceId]);

		let space: MCPSpace | null = null;
		if (stmt.step()) {
			const row = stmt.getAsObject() as Record<string, unknown>;
			space = {
				id: row.id as string,
				name: row.name as string,
				description: row.description as string | null,
				emoji: row.emoji as string || '📁',
				created_at: row.created_at as number,
				updated_at: row.updated_at as number,
				last_accessed_at: row.last_accessed_at as number,
				message_count: row.message_count as number || 0,
				total_tokens: row.total_tokens as number || 0
			};
		}

		stmt.free();
		return space;
	} catch (error) {
		console.error('[TARX] Failed to get MCP space:', error);
		return null;
	}
}

/**
 * Create a new space/project
 */
export async function createMCPSpace(name: string, description?: string, emoji?: string): Promise<MCPSpace | null> {
	const db = await getDatabase();
	if (!db) {
		console.error('[TARX] MCP database not found');
		return null;
	}

	try {
		const id = generateUUID();
		const now = Date.now();
		const emojiValue = emoji || '📁';

		db.run(
			'INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)',
			[id, name, description || null, emojiValue, now, now, now]
		);

		// Save changes to file
		saveDatabase();

		return {
			id,
			name,
			description: description || null,
			emoji: emojiValue,
			created_at: now,
			updated_at: now,
			last_accessed_at: now,
			message_count: 0,
			total_tokens: 0
		};
	} catch (error) {
		console.error('[TARX] Failed to create MCP space:', error);
		return null;
	}
}

/**
 * Rename a space/project
 */
export async function renameMCPSpace(spaceId: string, newName: string): Promise<MCPSpace | null> {
	const db = await getDatabase();
	if (!db) {
		return null;
	}

	try {
		const now = Date.now();
		db.run('UPDATE spaces SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [newName, now, spaceId]);

		// Save changes to file
		saveDatabase();

		// Return updated space
		return getMCPSpace(spaceId);
	} catch (error) {
		console.error('[TARX] Failed to rename MCP space:', error);
		return null;
	}
}

/**
 * Soft delete a space/project
 */
export async function deleteMCPSpace(spaceId: string): Promise<boolean> {
	const db = await getDatabase();
	if (!db) {
		return false;
	}

	try {
		const now = Date.now();
		db.run('UPDATE spaces SET deleted_at = ? WHERE id = ?', [now, spaceId]);

		// Save changes to file
		saveDatabase();

		return true;
	} catch (error) {
		console.error('[TARX] Failed to delete MCP space:', error);
		return false;
	}
}

// ============================================================================
// SESSION/CONVERSATION MANAGEMENT
// ============================================================================

export interface MCPSession {
	id: string;
	space_id: string;
	title: string | null;
	created_at: number;
	updated_at: number;
	message_count: number;
}

/**
 * Create a new session/conversation in a space
 */
export async function createMCPSession(spaceId: string, title?: string): Promise<MCPSession | null> {
	const db = await getDatabase();
	if (!db) {
		return null;
	}

	try {
		const id = generateUUID();
		const now = Date.now();
		const sessionTitle = title || `Chat ${new Date().toLocaleString()}`;

		db.run(
			'INSERT INTO sessions (id, space_id, title, created_at, updated_at, message_count, total_tokens) VALUES (?, ?, ?, ?, ?, 0, 0)',
			[id, spaceId, sessionTitle, now, now]
		);

		// Update space last_accessed_at
		db.run('UPDATE spaces SET last_accessed_at = ? WHERE id = ?', [now, spaceId]);

		// Save changes to file
		saveDatabase();

		return {
			id,
			space_id: spaceId,
			title: sessionTitle,
			created_at: now,
			updated_at: now,
			message_count: 0
		};
	} catch (error) {
		console.error('[TARX] Failed to create MCP session:', error);
		return null;
	}
}

/**
 * List sessions in a space
 */
export async function listMCPSessions(spaceId: string): Promise<MCPSession[]> {
	const db = await getDatabase();
	if (!db) {
		return [];
	}

	try {
		const result = db.exec(
			'SELECT id, space_id, title, created_at, updated_at, message_count FROM sessions WHERE space_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC',
			[spaceId]
		);

		if (!result[0]?.values) {
			return [];
		}

		return (result[0].values as (string | number | null)[][]).map((row) => ({
			id: row[0] as string,
			space_id: row[1] as string,
			title: row[2] as string | null,
			created_at: row[3] as number,
			updated_at: row[4] as number,
			message_count: row[5] as number || 0
		}));
	} catch (error) {
		console.error('[TARX] Failed to list MCP sessions:', error);
		return [];
	}
}

// ============================================================================
// EMBEDDING STORAGE
// ============================================================================

/**
 * Store embeddings for an uploaded file using sql.js (handles binary BLOBs properly)
 */
export async function storeMCPEmbeddings(
	fileId: string,
	filename: string,
	chunks: Array<{ content: string; index: number }>,
	embeddings: Float32Array[]
): Promise<number> {
	const db = await getDatabase();
	if (!db) {
		console.error('[TARX-MCP] Cannot store embeddings: database not available');
		return 0;
	}

	try {
		const now = Math.floor(Date.now() / 1000);
		let stored = 0;

		for (let i = 0; i < chunks.length && i < embeddings.length; i++) {
			const chunkId = `chunk_${fileId}_${i}`;
			const chunk = chunks[i];
			const embedding = embeddings[i];

			// Convert Float32Array to Uint8Array for BLOB storage
			const embeddingBlob = new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength);

			// Match actual knowledge_embeddings schema in memory.db
			db.run(
				`INSERT OR REPLACE INTO knowledge_embeddings
				(id, content, embedding, source, source_type, source_id, title, space_id,
				 model, original_dimensions, stored_dimensions, created_at, updated_at)
				VALUES (?, ?, ?, ?, 'file', ?, ?, NULL, 'nomic-embed-text-v1.5', 768, 768, ?, ?)`,
				[
					chunkId,
					chunk.content,
					embeddingBlob,
					filename,
					fileId,
					filename,
					now,
					now
				]
			);
			stored++;
		}

		// Save changes to file
		saveDatabase();
		console.log(`[TARX-MCP] Stored ${stored} embeddings for ${filename}`);
		return stored;

	} catch (error) {
		console.error('[TARX-MCP] Failed to store embeddings:', error);
		return 0;
	}
}

// ============================================================================
// MESSAGE STORAGE (for import pipelines)
// ============================================================================

/**
 * Store a message in a session (used by ChatGPT importer)
 */
export async function addMCPMessage(
	sessionId: string,
	role: 'user' | 'assistant' | 'system',
	content: string,
	createdAt?: number,
	model?: string
): Promise<boolean> {
	const db = await getDatabase();
	if (!db) {
		return false;
	}

	try {
		const id = generateUUID();
		const now = createdAt || Date.now();

		db.run(
			'INSERT INTO messages (id, session_id, role, content, created_at, model) VALUES (?, ?, ?, ?, ?, ?)',
			[id, sessionId, role, content, now, model || null]
		);

		// Update session message count and timestamp
		db.run(
			'UPDATE sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ?',
			[now, sessionId]
		);

		return true;
	} catch (error) {
		console.error('[TARX-MCP] Failed to store message:', error);
		return false;
	}
}

/**
 * Save pending database changes to disk.
 * Exposed for bulk import operations that batch writes before saving.
 */
export function flushMCPDatabase(): void {
	saveDatabase();
}

// ============================================================================
// EMBEDDING GENERATION (for import pipelines)
// ============================================================================

const EMBEDDING_URL = 'http://localhost:11437/v1/embeddings';

/**
 * Generate an embedding vector via the local nomic-embed server.
 * Returns null if the server is unreachable or fails.
 */
export async function generateMCPEmbedding(text: string): Promise<Float32Array | null> {
	try {
		const response = await fetch(EMBEDDING_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ input: text, model: 'nomic-embed' })
		});

		if (!response.ok) {
			return null;
		}

		const data = await response.json() as { data: Array<{ embedding: number[] }> };
		if (!data.data?.[0]?.embedding) {
			return null;
		}

		return new Float32Array(data.data[0].embedding);
	} catch {
		return null;
	}
}

/**
 * Store a single knowledge embedding with metadata.
 * Used by import pipelines that generate embeddings themselves.
 */
export async function storeMCPKnowledgeChunk(
	spaceId: string,
	sourceId: string,
	title: string,
	content: string,
	embedding: Float32Array,
	sourceType: string = 'file'
): Promise<boolean> {
	const db = await getDatabase();
	if (!db) {
		return false;
	}

	try {
		const id = generateUUID();
		const now = Date.now();

		// Convert Float32Array to Uint8Array for BLOB storage
		const embeddingBlob = new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength);

		db.run(
			`INSERT OR REPLACE INTO knowledge_embeddings
			(id, space_id, source_type, source_id, title, content, embedding,
			 model, original_dimensions, stored_dimensions, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, 'nomic-embed-text-v1.5', 768, 768, ?, ?)`,
			[id, spaceId, sourceType, sourceId, title, content, embeddingBlob, now, now]
		);

		return true;
	} catch (error) {
		console.error('[TARX-MCP] Failed to store knowledge chunk:', error);
		return false;
	}
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

/**
 * Get database stats
 */
export async function getMCPDatabaseStats(): Promise<{
	spaces: number;
	sessions: number;
	messages: number;
	files: number;
	knowledge_embeddings: number;
} | null> {
	const db = await getDatabase();
	if (!db) {
		return null;
	}

	try {
		const spaces = db.exec('SELECT COUNT(*) FROM spaces WHERE deleted_at IS NULL')[0]?.values[0]?.[0] as number || 0;
		const sessions = db.exec('SELECT COUNT(*) FROM sessions WHERE deleted_at IS NULL')[0]?.values[0]?.[0] as number || 0;
		const messages = db.exec('SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL')[0]?.values[0]?.[0] as number || 0;
		const files = db.exec('SELECT COUNT(*) FROM files WHERE deleted_at IS NULL')[0]?.values[0]?.[0] as number || 0;

		let knowledge_embeddings = 0;
		try {
			knowledge_embeddings = db.exec('SELECT COUNT(*) FROM knowledge_embeddings')[0]?.values[0]?.[0] as number || 0;
		} catch {
			// Table might not exist
		}

		return { spaces, sessions, messages, files, knowledge_embeddings };
	} catch (error) {
		console.error('[TARX] Failed to get MCP database stats:', error);
		return null;
	}
}

// ============================================================================
// INVITE CODE VALIDATION (extension-side)
// ============================================================================

export interface InviteCodeResult {
	valid: boolean;
	tier: string;
	metadata: string | null;
}

/**
 * Validate an invite code against the MCP database (memory.db).
 * Returns validation result with metadata (contains profile JSON).
 */
export async function validateMCPInviteCode(code: string): Promise<InviteCodeResult> {
	const db = await getDatabase();
	if (!db) {
		// Database unavailable — accept well-formed codes offline
		const isWellFormed = /^TARX-[A-Z]+-\d{4}$/.test(code.toUpperCase().trim());
		return { valid: isWellFormed, tier: 'beta', metadata: null };
	}

	try {
		const stmt = db.prepare('SELECT code, tier, max_uses, use_count, metadata FROM invite_codes WHERE code = ?');
		stmt.bind([code]);

		if (stmt.step()) {
			const row = stmt.getAsObject() as {
				code: string;
				tier: string;
				max_uses: number;
				use_count: number;
				metadata: string | null;
			};
			stmt.free();

			if (row.use_count >= row.max_uses) {
				return { valid: false, tier: row.tier, metadata: null };
			}

			return { valid: true, tier: row.tier, metadata: row.metadata as string | null };
		}

		stmt.free();
		return { valid: false, tier: '', metadata: null };
	} catch (error) {
		console.error('[TARX] Failed to validate invite code:', error);
		return { valid: false, tier: '', metadata: null };
	}
}

/**
 * Redeem an invite code (increment use_count).
 */
export async function redeemMCPInviteCode(code: string, userId: string = 'default'): Promise<boolean> {
	const db = await getDatabase();
	if (!db) {
		return false;
	}

	try {
		const now = Date.now();
		db.run(
			'UPDATE invite_codes SET use_count = use_count + 1, redeemed_at = ?, redeemed_by = ? WHERE code = ? AND use_count < max_uses',
			[now, userId, code]
		);
		saveDatabase();
		return true;
	} catch (error) {
		console.error('[TARX] Failed to redeem invite code:', error);
		return false;
	}
}

// ============================================================================
// ONBOARDING STATE
// ============================================================================

export type OnboardingStep = 'welcome' | 'profile_confirm' | 'first_prompt' | 'complete';

export interface OnboardingState {
	user_id: string;
	invite_code: string | null;
	step: OnboardingStep;
	profile_confirmed: boolean;
	first_inference_at: number | null;
	import_source: string | null;
}

/**
 * Get the current onboarding state for a user.
 */
export async function getOnboardingState(userId: string = 'default'): Promise<OnboardingState | null> {
	const db = await getDatabase();
	if (!db) {
		return null;
	}

	try {
		const stmt = db.prepare('SELECT * FROM onboarding_state WHERE user_id = ?');
		stmt.bind([userId]);

		if (stmt.step()) {
			const row = stmt.getAsObject() as Record<string, unknown>;
			stmt.free();
			return {
				user_id: row.user_id as string,
				invite_code: row.invite_code as string | null,
				step: row.step as OnboardingStep,
				profile_confirmed: (row.profile_confirmed as number) === 1,
				first_inference_at: row.first_inference_at as number | null,
				import_source: row.import_source as string | null
			};
		}

		stmt.free();
		return null;
	} catch {
		return null;
	}
}

/**
 * Create or update onboarding state.
 */
export async function updateOnboardingState(
	step: OnboardingStep,
	updates: {
		invite_code?: string;
		profile_confirmed?: boolean;
		import_source?: string;
	} = {},
	userId: string = 'default'
): Promise<void> {
	const db = await getDatabase();
	if (!db) {
		return;
	}

	try {
		const now = Date.now();
		const existing = await getOnboardingState(userId);

		if (existing) {
			db.run(
				`UPDATE onboarding_state SET step = ?, profile_confirmed = ?, invite_code = COALESCE(?, invite_code), import_source = COALESCE(?, import_source), updated_at = ? WHERE user_id = ?`,
				[step, updates.profile_confirmed ? 1 : 0, updates.invite_code || null, updates.import_source || null, now, userId]
			);
		} else {
			db.run(
				`INSERT INTO onboarding_state (user_id, invite_code, step, profile_confirmed, import_source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[userId, updates.invite_code || null, step, updates.profile_confirmed ? 1 : 0, updates.import_source || null, now, now]
			);
		}

		saveDatabase();
	} catch (error) {
		console.error('[TARX] Failed to update onboarding state:', error);
	}
}

// ============================================================================
// RAG SEEDING FROM PROFILE
// ============================================================================

/**
 * Embed user profile into RAG so TARX "knows" the user from first interaction.
 * Creates a knowledge embedding in a global/personal space.
 */
export async function seedRAGWithProfile(profileText: string): Promise<boolean> {
	const db = await getDatabase();
	if (!db) {
		return false;
	}

	try {
		const embedding = await generateMCPEmbedding(`search_document: ${profileText}`);
		if (!embedding) {
			console.error('[TARX] Failed to generate profile embedding — embedding server may be down');
			return false;
		}

		// Store in a "Personal" space, creating if needed
		let spaceId: string | null = null;
		const spacesResult = db.exec("SELECT id FROM spaces WHERE name = 'Personal' AND deleted_at IS NULL");
		if (spacesResult[0]?.values?.[0]?.[0]) {
			spaceId = spacesResult[0].values[0][0] as string;
		}

		if (!spaceId) {
			spaceId = generateUUID();
			const now = Date.now();
			db.run(
				'INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
				[spaceId, 'Personal', 'Your profile and preferences', '👤', now, now, now]
			);
		}

		const stored = await storeMCPKnowledgeChunk(
			spaceId,
			'user-profile',
			'User Profile',
			profileText,
			embedding,
			'note'
		);

		if (stored) {
			saveDatabase();
			console.log('[TARX] Profile embedded into RAG');
		}

		return stored;
	} catch (error) {
		console.error('[TARX] Failed to seed RAG with profile:', error);
		return false;
	}
}
