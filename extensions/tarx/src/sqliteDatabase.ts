/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * SQLite Database Implementation for TARX
 *
 * Uses better-sqlite3 for synchronous, fast local database operations.
 * Includes vec0 extension for vector similarity search.
 *
 * Philosophy: NO CLOUD. All data stays local.
 */

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import {
	DatabaseOperations,
	Project,
	ProjectFile,
	FileEmbedding,
	Conversation,
	ConversationTurn,
	SCHEMA_SQL,
	generateId
} from './database';

// Legacy interface for compatibility - no longer used with sqlite3 CLI
interface Database {
	exec(sql: string): void;
	prepare(sql: string): Statement;
	close(): void;
	pragma(directive: string): unknown;
}

interface Statement {
	run(...params: unknown[]): RunResult;
	get(...params: unknown[]): unknown;
	all(...params: unknown[]): unknown[];
}

interface RunResult {
	changes: number;
	lastInsertRowid: number | bigint;
}

/**
 * Additional schema for SQLite-specific features
 */
const SQLITE_EXTENSIONS_SQL = `
-- User preferences (learned patterns)
CREATE TABLE IF NOT EXISTS user_preferences (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('explicit', 'inferred', 'corrected')),
    confidence REAL NOT NULL DEFAULT 0.5,
    examples TEXT DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    UNIQUE(project_id, key)
);

-- Global preferences (cross-project)
CREATE TABLE IF NOT EXISTS global_preferences (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('explicit', 'inferred', 'corrected')),
    confidence REAL NOT NULL DEFAULT 0.5,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Skills registry (self-extending commands)
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    trigger_type TEXT NOT NULL CHECK(trigger_type IN ('command', 'pattern', 'semantic')),
    trigger_value TEXT NOT NULL,
    impl_type TEXT NOT NULL CHECK(impl_type IN ('prompt', 'code', 'workflow')),
    impl_content TEXT NOT NULL,
    created_by TEXT NOT NULL CHECK(created_by IN ('system', 'user', 'ai')),
    validated INTEGER NOT NULL DEFAULT 0,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Mesh nodes (for tarx-supercomputer)
CREATE TABLE IF NOT EXISTS mesh_nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    capabilities TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL CHECK(status IN ('online', 'offline', 'busy')),
    last_seen INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    trust_level TEXT NOT NULL CHECK(trust_level IN ('owner', 'trusted', 'untrusted')) DEFAULT 'untrusted',
    public_key TEXT,
    UNIQUE(host, port)
);

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_user_preferences_project ON user_preferences(project_id);
CREATE INDEX IF NOT EXISTS idx_skills_trigger ON skills(trigger_type, trigger_value);
CREATE INDEX IF NOT EXISTS idx_mesh_nodes_status ON mesh_nodes(status);
`;

/**
 * SQLite-based database implementation
 *
 * This replaces the JSON-based fallback with proper database operations.
 * All data stored locally in ~/.tarx/tarx.db
 */
export class SqliteDatabase implements DatabaseOperations {
	private dbPath: string;
	private initialized: boolean = false;

	constructor(storagePath: string) {
		// Validate storage path - reject invalid/mock paths to prevent EACCES errors
		if (this.isInvalidStoragePath(storagePath)) {
			const os = require('os');
			const fallbackPath = path.join(os.homedir(), 'Library/Application Support/tarx');
			console.warn(`[TARX-DB] Invalid storage path "${storagePath}", using fallback: ${fallbackPath}`);
			this.dbPath = path.join(fallbackPath, 'memory.db');
		} else {
			this.dbPath = path.join(storagePath, 'memory.db');
		}
	}

	/**
	 * Check if storage path is invalid (too shallow or mock path)
	 */
	private isInvalidStoragePath(storagePath: string): boolean {
		if (!storagePath) {
			return true;
		}
		const normalized = path.normalize(storagePath);
		const parts = normalized.split(path.sep).filter(Boolean);
		// Reject paths with fewer than 2 parts (e.g., /mock has only 1 part)
		if (parts.length < 2) {
			return true;
		}
		// Reject known test/mock paths
		if (normalized.startsWith('/mock') || normalized.startsWith('/test')) {
			return true;
		}
		return false;
	}

	/**
	 * Initialize the database connection
	 * Called lazily on first operation - uses sqlite3 CLI to avoid better-sqlite3 version mismatch
	 */
	private async ensureInitialized(): Promise<void> {
		if (this.initialized) return;

		try {
			// Ensure directory exists
			const dir = path.dirname(this.dbPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			// Use sqlite3 CLI to initialize database
			// Enable WAL mode and foreign keys
			this.execSQL('PRAGMA journal_mode = WAL;');
			this.execSQL('PRAGMA foreign_keys = ON;');

			// Initialize schema
			this.execSQL(SCHEMA_SQL);
			this.execSQL(SQLITE_EXTENSIONS_SQL);

			this.initialized = true;
			console.log('[TARX-DB] SQLite database initialized at:', this.dbPath);
		} catch (e) {
			console.error('[TARX-DB] Failed to initialize SQLite:', e);
			throw e;
		}
	}

	/**
	 * Execute SQL using sqlite3 CLI
	 */
	private execSQL(sql: string): void {
		execSync(`sqlite3 "${this.dbPath}"`, {
			encoding: 'utf8',
			input: sql
		});
	}

	/**
	 * Query database and return JSON result using sqlite3 CLI
	 */
	private queryJSON<T>(sql: string): T[] {
		try {
			const result = execSync(`sqlite3 "${this.dbPath}" -json`, {
				encoding: 'utf8',
				input: sql
			});
			return result.trim() ? JSON.parse(result) : [];
		} catch {
			return [];
		}
	}

	/**
	 * Query for a single row
	 */
	private queryOne<T>(sql: string): T | null {
		const results = this.queryJSON<T>(sql);
		return results.length > 0 ? results[0] : null;
	}

	/**
	 * Get the raw database instance (for advanced operations)
	 * Note: Returns null - CLI approach doesn't use Database instance
	 * @deprecated Use CLI methods instead
	 */
	getDb(): Database | null {
		return null;
	}

	/**
	 * Ensure database is ready and return instance
	 * Note: Returns null - CLI approach doesn't use Database instance
	 * @deprecated Use CLI methods instead
	 */
	async ensureDbReady(): Promise<Database | null> {
		await this.ensureInitialized();
		return null;
	}

	// ========================================
	// Projects
	// ========================================

	async createProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
		await this.ensureInitialized();

		const id = generateId();
		const createdAt = Date.now();
		const name = project.name.replace(/'/g, "''");
		const root = project.root.replace(/'/g, "''");
		const type = project.type ? project.type.replace(/'/g, "''") : null;

		this.execSQL(`
			INSERT INTO projects (id, name, root, type, created_at, is_active)
			VALUES ('${id}', '${name}', '${root}', ${type ? `'${type}'` : 'NULL'}, ${createdAt}, ${project.isActive ? 1 : 0});
		`);

		return { ...project, id, createdAt };
	}

	async getProject(id: string): Promise<Project | null> {
		await this.ensureInitialized();

		const row = this.queryOne<ProjectRow>(`SELECT * FROM projects WHERE id = '${id.replace(/'/g, "''")}';`);
		return row ? this.rowToProject(row) : null;
	}

	async getProjectByRoot(root: string): Promise<Project | null> {
		await this.ensureInitialized();

		const row = this.queryOne<ProjectRow>(`SELECT * FROM projects WHERE root = '${root.replace(/'/g, "''")}';`);
		return row ? this.rowToProject(row) : null;
	}

	async listProjects(): Promise<Project[]> {
		await this.ensureInitialized();

		const rows = this.queryJSON<ProjectRow>('SELECT * FROM projects ORDER BY created_at DESC;');
		return rows.map(row => this.rowToProject(row));
	}

	async setActiveProject(id: string): Promise<void> {
		await this.ensureInitialized();

		this.execSQL(`UPDATE projects SET is_active = 0;`);
		this.execSQL(`UPDATE projects SET is_active = 1 WHERE id = '${id.replace(/'/g, "''")}';`);
	}

	async deleteProject(id: string): Promise<void> {
		await this.ensureInitialized();

		// Cascading delete handles files and embeddings
		this.execSQL(`DELETE FROM projects WHERE id = '${id.replace(/'/g, "''")}';`);
	}

	// ========================================
	// Files
	// ========================================

	async addProjectFile(file: Omit<ProjectFile, 'id'>): Promise<ProjectFile> {
		await this.ensureInitialized();

		const projectId = file.projectId.replace(/'/g, "''");
		const filePath = file.filePath.replace(/'/g, "''");
		const mimeType = file.mimeType ? file.mimeType.replace(/'/g, "''") : null;

		// Check if file already exists (upsert)
		const existing = this.queryOne<{ id: string }>(`
			SELECT id FROM project_files WHERE project_id = '${projectId}' AND file_path = '${filePath}';
		`);

		if (existing) {
			this.execSQL(`
				UPDATE project_files
				SET file_size = ${file.fileSize}, mime_type = ${mimeType ? `'${mimeType}'` : 'NULL'}, is_binary = ${file.isBinary ? 1 : 0}, last_indexed = ${file.lastIndexed || 'NULL'}
				WHERE id = '${existing.id}';
			`);

			return { ...file, id: existing.id };
		}

		const id = generateId();
		this.execSQL(`
			INSERT INTO project_files (id, project_id, file_path, file_size, mime_type, is_binary, last_indexed)
			VALUES ('${id}', '${projectId}', '${filePath}', ${file.fileSize}, ${mimeType ? `'${mimeType}'` : 'NULL'}, ${file.isBinary ? 1 : 0}, ${file.lastIndexed || 'NULL'});
		`);

		return { ...file, id };
	}

	async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
		await this.ensureInitialized();

		const rows = this.queryJSON<ProjectFileRow>(`
			SELECT * FROM project_files WHERE project_id = '${projectId.replace(/'/g, "''")}' ORDER BY file_path;
		`);

		return rows.map(row => this.rowToProjectFile(row));
	}

	async updateFileIndexed(fileId: string, timestamp: number): Promise<void> {
		await this.ensureInitialized();

		this.execSQL(`UPDATE project_files SET last_indexed = ${timestamp} WHERE id = '${fileId.replace(/'/g, "''")}';`);
	}

	async deleteProjectFiles(projectId: string): Promise<void> {
		await this.ensureInitialized();

		// Cascading delete handles embeddings
		this.execSQL(`DELETE FROM project_files WHERE project_id = '${projectId.replace(/'/g, "''")}';`);
	}

	// ========================================
	// Embeddings
	// ========================================

	async addEmbedding(embedding: Omit<FileEmbedding, 'id' | 'createdAt'>): Promise<void> {
		await this.ensureInitialized();

		const fileId = embedding.fileId.replace(/'/g, "''");
		const content = embedding.content.replace(/'/g, "''");

		// Delete existing embedding for this chunk (upsert)
		this.execSQL(`DELETE FROM file_embeddings WHERE file_id = '${fileId}' AND chunk_index = ${embedding.chunkIndex};`);

		const id = generateId();
		const createdAt = Date.now();

		// Store embedding as base64 for CLI compatibility
		const embeddingBase64 = Buffer.from(embedding.embedding.buffer).toString('base64');

		this.execSQL(`
			INSERT INTO file_embeddings (id, file_id, chunk_index, content, embedding, created_at)
			VALUES ('${id}', '${fileId}', ${embedding.chunkIndex}, '${content}', '${embeddingBase64}', ${createdAt});
		`);
	}

	async getFileEmbeddings(fileId: string): Promise<FileEmbedding[]> {
		await this.ensureInitialized();

		const rows = this.queryJSON<EmbeddingRowCLI>(`
			SELECT * FROM file_embeddings WHERE file_id = '${fileId.replace(/'/g, "''")}' ORDER BY chunk_index;
		`);

		return rows.map(row => this.rowToEmbeddingCLI(row));
	}

	async searchEmbeddings(
		projectId: string,
		queryEmbedding: Float32Array,
		limit: number = 10
	): Promise<Array<{ content: string; filePath: string; similarity: number }>> {
		await this.ensureInitialized();

		// Get all embeddings for this project
		const rows = this.queryJSON<{ content: string; embedding: string; file_path: string }>(`
			SELECT fe.content, fe.embedding, pf.file_path
			FROM file_embeddings fe
			JOIN project_files pf ON pf.id = fe.file_id
			WHERE pf.project_id = '${projectId.replace(/'/g, "''")}';
		`);

		// Calculate cosine similarity for each embedding
		const results = rows.map(row => {
			// Decode base64 embedding
			const embeddingBuffer = Buffer.from(row.embedding, 'base64');
			const embedding = new Float32Array(embeddingBuffer.buffer, embeddingBuffer.byteOffset, embeddingBuffer.byteLength / 4);
			const similarity = this.cosineSimilarity(queryEmbedding, embedding);
			return {
				content: row.content,
				filePath: row.file_path,
				similarity
			};
		});

		// Sort by similarity and return top results
		return results
			.sort((a, b) => b.similarity - a.similarity)
			.slice(0, limit);
	}

	async deleteFileEmbeddings(fileId: string): Promise<void> {
		await this.ensureInitialized();

		this.execSQL(`DELETE FROM file_embeddings WHERE file_id = '${fileId.replace(/'/g, "''")}';`);
	}

	// ========================================
	// Conversations
	// ========================================

	async createConversation(projectId: string | null): Promise<Conversation> {
		await this.ensureInitialized();

		const id = generateId();
		const now = Date.now();
		const escapedProjectId = projectId ? projectId.replace(/'/g, "''") : null;

		// Create native conversation
		this.execSQL(`
			INSERT INTO conversations (id, project_id, title, created_at, updated_at)
			VALUES ('${id}', ${escapedProjectId ? `'${escapedProjectId}'` : 'NULL'}, NULL, ${now}, ${now});
		`);

		// DUAL-SAVE: Also create matching MCP session for MCP queries
		try {
			// Ensure default TARX Chat space exists
			const defaultSpace = this.queryJSON<any>(`SELECT id FROM spaces WHERE name = 'TARX Chat' LIMIT 1;`);
			let spaceId = defaultSpace[0]?.id;
			if (!spaceId) {
				spaceId = generateId();
				this.execSQL(`
					INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count)
					VALUES ('${spaceId}', 'TARX Chat', 'Native @tarx conversations', '💬', ${now}, ${now}, ${now}, 0);
				`);
				console.log('[SqliteDB] Created default TARX Chat space');
			}

			// Create session in MCP sessions table (use same ID as conversation)
			this.execSQL(`
				INSERT INTO sessions (id, space_id, title, created_at, updated_at, message_count, model)
				VALUES ('${id}', '${spaceId}', 'TARX Conversation', ${now}, ${now}, 0, 'qwen');
			`);
			console.log('[SqliteDB] Created MCP session for new conversation:', id);
		} catch (e) {
			console.warn('[SqliteDB] MCP session creation failed (non-critical):', e);
		}

		return { id, projectId, title: null, createdAt: now, updatedAt: now };
	}

	async updateConversationTitle(id: string, title: string): Promise<void> {
		await this.ensureInitialized();

		const escapedId = id.replace(/'/g, "''");
		const escapedTitle = title.replace(/'/g, "''");
		const now = Date.now();

		// Update native conversation
		this.execSQL(`UPDATE conversations SET title = '${escapedTitle}', updated_at = ${now} WHERE id = '${escapedId}';`);

		// DUAL-SAVE: Also update MCP session title
		try {
			this.execSQL(`UPDATE sessions SET title = '${escapedTitle}', updated_at = ${now} WHERE id = '${escapedId}';`);
		} catch (e) {
			// Non-critical - MCP session may not exist
		}
	}

	async addConversationTurn(turn: Omit<ConversationTurn, 'id' | 'createdAt'>): Promise<ConversationTurn> {
		await this.ensureInitialized();

		const id = generateId();
		const createdAt = Date.now();

		const conversationId = turn.conversationId.replace(/'/g, "''");
		const role = turn.role.replace(/'/g, "''");
		const content = turn.content.replace(/'/g, "''");
		const fileRefs = JSON.stringify(turn.fileRefs).replace(/'/g, "''");
		const artifacts = turn.artifacts ? turn.artifacts.replace(/'/g, "''") : null;

		// Save to native conversation_turns table
		this.execSQL(`
			INSERT INTO conversation_turns (id, conversation_id, role, content, file_refs, artifacts, created_at)
			VALUES ('${id}', '${conversationId}', '${role}', '${content}', '${fileRefs}', ${artifacts ? `'${artifacts}'` : 'NULL'}, ${createdAt});
		`);

		// Update conversation timestamp
		this.execSQL(`UPDATE conversations SET updated_at = ${createdAt} WHERE id = '${conversationId}';`);

		// DUAL-SAVE: Also save to MCP messages table for MCP session queries
		// This ensures messages appear in both native history AND MCP queries (tarx_list_sessions, etc.)
		try {
			// Ensure MCP session exists (use conversation_id as session_id)
			const sessionExists = this.queryJSON<any>(`SELECT id FROM sessions WHERE id = '${conversationId}' LIMIT 1;`);
			if (sessionExists.length === 0) {
				// Create a default space if needed
				const defaultSpace = this.queryJSON<any>(`SELECT id FROM spaces WHERE name = 'TARX Chat' LIMIT 1;`);
				let spaceId = defaultSpace[0]?.id;
				if (!spaceId) {
					spaceId = generateId();
					this.execSQL(`
						INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count)
						VALUES ('${spaceId}', 'TARX Chat', 'Native @tarx conversations', '💬', ${createdAt}, ${createdAt}, ${createdAt}, 0);
					`);
					console.log('[SqliteDB] Created default TARX Chat space');
				}
				// Create session in MCP sessions table
				this.execSQL(`
					INSERT INTO sessions (id, space_id, title, created_at, updated_at, message_count, model)
					VALUES ('${conversationId}', '${spaceId}', 'TARX Conversation', ${createdAt}, ${createdAt}, 0, 'qwen');
				`);
				console.log('[SqliteDB] Created MCP session for conversation:', conversationId);
			}

			// Insert message into MCP messages table
			const msgId = 'msg-' + id; // Prefix to avoid ID collision
			this.execSQL(`
				INSERT INTO messages (id, session_id, role, content, created_at, model)
				VALUES ('${msgId}', '${conversationId}', '${role}', '${content}', ${createdAt}, 'qwen');
			`);

			// Update session message count and timestamp
			this.execSQL(`UPDATE sessions SET message_count = message_count + 1, updated_at = ${createdAt} WHERE id = '${conversationId}';`);
			this.execSQL(`UPDATE spaces SET message_count = message_count + 1, updated_at = ${createdAt}, last_accessed_at = ${createdAt} WHERE id IN (SELECT space_id FROM sessions WHERE id = '${conversationId}');`);

			console.log(`[SqliteDB] Dual-saved message to MCP: ${role} (${content.substring(0, 50)}...)`);
		} catch (e) {
			// Log but don't fail - native save already succeeded
			console.warn('[SqliteDB] MCP dual-save failed (non-critical):', e);
		}

		return { ...turn, id, createdAt };
	}

	async getConversationTurns(conversationId: string): Promise<ConversationTurn[]> {
		await this.ensureInitialized();

		const escapedId = conversationId.replace(/'/g, "''");
		const rows = this.queryJSON<ConversationTurnRow>(`
			SELECT * FROM conversation_turns WHERE conversation_id = '${escapedId}' ORDER BY created_at ASC;
		`);

		return rows.map(row => this.rowToTurn(row));
	}

	async getRecentConversation(projectId: string | null): Promise<Conversation | null> {
		await this.ensureInitialized();

		const row = projectId
			? this.queryOne<ConversationRow>(`
				SELECT * FROM conversations WHERE project_id = '${projectId.replace(/'/g, "''")}' ORDER BY updated_at DESC LIMIT 1;
			`)
			: this.queryOne<ConversationRow>(`
				SELECT * FROM conversations WHERE project_id IS NULL ORDER BY updated_at DESC LIMIT 1;
			`);

		return row ? this.rowToConversation(row) : null;
	}

	async getRecentTurns(projectId: string | null, limit: number = 10): Promise<ConversationTurn[]> {
		await this.ensureInitialized();

		const rows = projectId
			? this.queryJSON<ConversationTurnRow>(`
				SELECT ct.* FROM conversation_turns ct
				JOIN conversations c ON c.id = ct.conversation_id
				WHERE c.project_id = '${projectId.replace(/'/g, "''")}'
				ORDER BY ct.created_at DESC
				LIMIT ${limit};
			`)
			: this.queryJSON<ConversationTurnRow>(`
				SELECT ct.* FROM conversation_turns ct
				JOIN conversations c ON c.id = ct.conversation_id
				WHERE c.project_id IS NULL
				ORDER BY ct.created_at DESC
				LIMIT ${limit};
			`);

		// Return in chronological order (oldest first)
		return rows.map(row => this.rowToTurn(row)).reverse();
	}

	async getRecentConversations(projectId: string | null, limit: number = 5): Promise<Conversation[]> {
		console.log('[TARX-DB] getRecentConversations called with projectId:', projectId, 'limit:', limit);
		await this.ensureInitialized();

		console.log('[TARX-DB] Database initialized, querying conversations...');
		const rows = projectId
			? this.queryJSON<ConversationRow>(`
				SELECT * FROM conversations WHERE project_id = '${projectId.replace(/'/g, "''")}' ORDER BY updated_at DESC LIMIT ${limit};
			`)
			: this.queryJSON<ConversationRow>(`
				SELECT * FROM conversations WHERE project_id IS NULL ORDER BY updated_at DESC LIMIT ${limit};
			`);

		console.log('[TARX-DB] Found', rows.length, 'conversations');
		return rows.map(row => this.rowToConversation(row));
	}

	// ========================================
	// Utilities
	// ========================================

	/**
	 * Calculate cosine similarity between two vectors
	 */
	private cosineSimilarity(a: Float32Array, b: Float32Array): number {
		if (a.length !== b.length) return 0;

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
		return magnitude === 0 ? 0 : dotProduct / magnitude;
	}

	/**
	 * Flush is a no-op for SQLite (auto-commits)
	 */
	flush(): void {
		// No-op - SQLite auto-commits
	}

	/**
	 * Close the database connection
	 * Note: CLI approach doesn't maintain persistent connection, just reset state
	 */
	close(): void {
		this.initialized = false;
	}

	// ========================================
	// Row Converters
	// ========================================

	private rowToProject(row: ProjectRow): Project {
		return {
			id: row.id,
			name: row.name,
			root: row.root,
			type: row.type,
			createdAt: row.created_at,
			isActive: row.is_active === 1
		};
	}

	private rowToProjectFile(row: ProjectFileRow): ProjectFile {
		return {
			id: row.id,
			projectId: row.project_id,
			filePath: row.file_path,
			fileSize: row.file_size,
			mimeType: row.mime_type,
			isBinary: row.is_binary === 1,
			lastIndexed: row.last_indexed
		};
	}

	private rowToEmbedding(row: EmbeddingRow): FileEmbedding {
		return {
			id: row.id,
			fileId: row.file_id,
			chunkIndex: row.chunk_index,
			content: row.content,
			embedding: new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4),
			createdAt: row.created_at
		};
	}

	private rowToEmbeddingCLI(row: EmbeddingRowCLI): FileEmbedding {
		// Decode base64 embedding back to Float32Array
		const embeddingBuffer = Buffer.from(row.embedding, 'base64');
		const embedding = new Float32Array(embeddingBuffer.buffer, embeddingBuffer.byteOffset, embeddingBuffer.byteLength / 4);

		return {
			id: row.id,
			fileId: row.file_id,
			chunkIndex: row.chunk_index,
			content: row.content,
			embedding,
			createdAt: row.created_at
		};
	}

	private rowToConversation(row: ConversationRow): Conversation {
		return {
			id: row.id,
			projectId: row.project_id,
			title: row.title,
			createdAt: row.created_at,
			updatedAt: row.updated_at
		};
	}

	private rowToTurn(row: ConversationTurnRow): ConversationTurn {
		return {
			id: row.id,
			conversationId: row.conversation_id,
			role: row.role as 'user' | 'assistant' | 'system',
			content: row.content,
			fileRefs: JSON.parse(row.file_refs || '[]'),
			artifacts: row.artifacts,
			createdAt: row.created_at
		};
	}
}

// ========================================
// Row Types
// ========================================

interface ProjectRow {
	id: string;
	name: string;
	root: string;
	type: string | null;
	created_at: number;
	is_active: number;
}

interface ProjectFileRow {
	id: string;
	project_id: string;
	file_path: string;
	file_size: number;
	mime_type: string | null;
	is_binary: number;
	last_indexed: number | null;
}

interface EmbeddingRow {
	id: string;
	file_id: string;
	chunk_index: number;
	content: string;
	embedding: Buffer;
	created_at: number;
}

// For CLI-based queries where embedding comes back as base64 string
interface EmbeddingRowCLI {
	id: string;
	file_id: string;
	chunk_index: number;
	content: string;
	embedding: string;  // base64 encoded
	created_at: number;
}

interface ConversationRow {
	id: string;
	project_id: string | null;
	title: string | null;
	created_at: number;
	updated_at: number;
}

interface ConversationTurnRow {
	id: string;
	conversation_id: string;
	role: string;
	content: string;
	file_refs: string;
	artifacts: string | null;
	created_at: number;
}
