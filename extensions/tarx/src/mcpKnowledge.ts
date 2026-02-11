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
