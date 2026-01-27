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

// Type definitions for better-sqlite3 (will be properly typed when package is installed)
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
	private db: Database | null = null;
	private dbPath: string;
	private initialized: boolean = false;

	constructor(storagePath: string) {
		this.dbPath = path.join(storagePath, 'tarx.db');
	}

	/**
	 * Initialize the database connection
	 * Called lazily on first operation
	 */
	private async ensureInitialized(): Promise<void> {
		if (this.initialized) return;

		try {
			// Ensure directory exists
			const dir = path.dirname(this.dbPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			// Dynamic import of better-sqlite3
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const Database = require('better-sqlite3');
			this.db = new Database(this.dbPath) as Database;

			// Enable WAL mode for better concurrent access
			this.db.pragma('journal_mode = WAL');

			// Enable foreign keys
			this.db.pragma('foreign_keys = ON');

			// Initialize schema
			this.db.exec(SCHEMA_SQL);
			this.db.exec(SQLITE_EXTENSIONS_SQL);

			// Try to load vec0 extension for vector search
			// Falls back to manual cosine similarity if not available
			try {
				// vec0 extension path varies by platform
				// this.db.loadExtension('vec0');
				console.log('[TARX-DB] vec0 extension not loaded (using fallback cosine similarity)');
			} catch {
				console.log('[TARX-DB] vec0 extension not available, using manual vector search');
			}

			this.initialized = true;
			console.log('[TARX-DB] SQLite database initialized at:', this.dbPath);
		} catch (e) {
			console.error('[TARX-DB] Failed to initialize SQLite, falling back to JSON:', e);
			throw e;
		}
	}

	/**
	 * Get the raw database instance (for advanced operations)
	 */
	getDb(): Database | null {
		return this.db;
	}

	// ========================================
	// Projects
	// ========================================

	async createProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		const id = generateId();
		const createdAt = Date.now();

		this.db.prepare(`
			INSERT INTO projects (id, name, root, type, created_at, is_active)
			VALUES (?, ?, ?, ?, ?, ?)
		`).run(id, project.name, project.root, project.type, createdAt, project.isActive ? 1 : 0);

		return { ...project, id, createdAt };
	}

	async getProject(id: string): Promise<Project | null> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
		return row ? this.rowToProject(row) : null;
	}

	async getProjectByRoot(root: string): Promise<Project | null> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		const row = this.db.prepare('SELECT * FROM projects WHERE root = ?').get(root) as ProjectRow | undefined;
		return row ? this.rowToProject(row) : null;
	}

	async listProjects(): Promise<Project[]> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		const rows = this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[];
		return rows.map(row => this.rowToProject(row));
	}

	async setActiveProject(id: string): Promise<void> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		this.db.prepare('UPDATE projects SET is_active = 0').run();
		this.db.prepare('UPDATE projects SET is_active = 1 WHERE id = ?').run(id);
	}

	async deleteProject(id: string): Promise<void> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		// Cascading delete handles files and embeddings
		this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
	}

	// ========================================
	// Files
	// ========================================

	async addProjectFile(file: Omit<ProjectFile, 'id'>): Promise<ProjectFile> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		// Check if file already exists (upsert)
		const existing = this.db.prepare(`
			SELECT id FROM project_files WHERE project_id = ? AND file_path = ?
		`).get(file.projectId, file.filePath) as { id: string } | undefined;

		if (existing) {
			this.db.prepare(`
				UPDATE project_files
				SET file_size = ?, mime_type = ?, is_binary = ?, last_indexed = ?
				WHERE id = ?
			`).run(file.fileSize, file.mimeType, file.isBinary ? 1 : 0, file.lastIndexed, existing.id);

			return { ...file, id: existing.id };
		}

		const id = generateId();
		this.db.prepare(`
			INSERT INTO project_files (id, project_id, file_path, file_size, mime_type, is_binary, last_indexed)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(id, file.projectId, file.filePath, file.fileSize, file.mimeType, file.isBinary ? 1 : 0, file.lastIndexed);

		return { ...file, id };
	}

	async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		const rows = this.db.prepare(`
			SELECT * FROM project_files WHERE project_id = ? ORDER BY file_path
		`).all(projectId) as ProjectFileRow[];

		return rows.map(row => this.rowToProjectFile(row));
	}

	async updateFileIndexed(fileId: string, timestamp: number): Promise<void> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		this.db.prepare('UPDATE project_files SET last_indexed = ? WHERE id = ?').run(timestamp, fileId);
	}

	async deleteProjectFiles(projectId: string): Promise<void> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		// Cascading delete handles embeddings
		this.db.prepare('DELETE FROM project_files WHERE project_id = ?').run(projectId);
	}

	// ========================================
	// Embeddings
	// ========================================

	async addEmbedding(embedding: Omit<FileEmbedding, 'id' | 'createdAt'>): Promise<void> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		// Delete existing embedding for this chunk (upsert)
		this.db.prepare(`
			DELETE FROM file_embeddings WHERE file_id = ? AND chunk_index = ?
		`).run(embedding.fileId, embedding.chunkIndex);

		const id = generateId();
		const createdAt = Date.now();

		// Store embedding as binary blob
		const embeddingBuffer = Buffer.from(embedding.embedding.buffer);

		this.db.prepare(`
			INSERT INTO file_embeddings (id, file_id, chunk_index, content, embedding, created_at)
			VALUES (?, ?, ?, ?, ?, ?)
		`).run(id, embedding.fileId, embedding.chunkIndex, embedding.content, embeddingBuffer, createdAt);
	}

	async getFileEmbeddings(fileId: string): Promise<FileEmbedding[]> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		const rows = this.db.prepare(`
			SELECT * FROM file_embeddings WHERE file_id = ? ORDER BY chunk_index
		`).all(fileId) as EmbeddingRow[];

		return rows.map(row => this.rowToEmbedding(row));
	}

	async searchEmbeddings(
		projectId: string,
		queryEmbedding: Float32Array,
		limit: number = 10
	): Promise<Array<{ content: string; filePath: string; similarity: number }>> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		// Get all embeddings for this project
		const rows = this.db.prepare(`
			SELECT fe.content, fe.embedding, pf.file_path
			FROM file_embeddings fe
			JOIN project_files pf ON pf.id = fe.file_id
			WHERE pf.project_id = ?
		`).all(projectId) as Array<{ content: string; embedding: Buffer; file_path: string }>;

		// Calculate cosine similarity for each embedding
		const results = rows.map(row => {
			const embedding = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
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
		if (!this.db) throw new Error('Database not initialized');

		this.db.prepare('DELETE FROM file_embeddings WHERE file_id = ?').run(fileId);
	}

	// ========================================
	// Conversations
	// ========================================

	async createConversation(projectId: string | null): Promise<Conversation> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		const id = generateId();
		const now = Date.now();

		this.db.prepare(`
			INSERT INTO conversations (id, project_id, title, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)
		`).run(id, projectId, null, now, now);

		return { id, projectId, title: null, createdAt: now, updatedAt: now };
	}

	async updateConversationTitle(id: string, title: string): Promise<void> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		this.db.prepare(`
			UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?
		`).run(title, Date.now(), id);
	}

	async addConversationTurn(turn: Omit<ConversationTurn, 'id' | 'createdAt'>): Promise<ConversationTurn> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		const id = generateId();
		const createdAt = Date.now();

		this.db.prepare(`
			INSERT INTO conversation_turns (id, conversation_id, role, content, file_refs, artifacts, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(id, turn.conversationId, turn.role, turn.content, JSON.stringify(turn.fileRefs), turn.artifacts, createdAt);

		// Update conversation timestamp
		this.db.prepare(`
			UPDATE conversations SET updated_at = ? WHERE id = ?
		`).run(createdAt, turn.conversationId);

		return { ...turn, id, createdAt };
	}

	async getConversationTurns(conversationId: string): Promise<ConversationTurn[]> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		const rows = this.db.prepare(`
			SELECT * FROM conversation_turns WHERE conversation_id = ? ORDER BY created_at ASC
		`).all(conversationId) as ConversationTurnRow[];

		return rows.map(row => this.rowToTurn(row));
	}

	async getRecentConversation(projectId: string | null): Promise<Conversation | null> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		const row = projectId
			? this.db.prepare(`
				SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1
			`).get(projectId) as ConversationRow | undefined
			: this.db.prepare(`
				SELECT * FROM conversations WHERE project_id IS NULL ORDER BY updated_at DESC LIMIT 1
			`).get() as ConversationRow | undefined;

		return row ? this.rowToConversation(row) : null;
	}

	async getRecentTurns(projectId: string | null, limit: number = 10): Promise<ConversationTurn[]> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		const rows = projectId
			? this.db.prepare(`
				SELECT ct.* FROM conversation_turns ct
				JOIN conversations c ON c.id = ct.conversation_id
				WHERE c.project_id = ?
				ORDER BY ct.created_at DESC
				LIMIT ?
			`).all(projectId, limit) as ConversationTurnRow[]
			: this.db.prepare(`
				SELECT ct.* FROM conversation_turns ct
				JOIN conversations c ON c.id = ct.conversation_id
				WHERE c.project_id IS NULL
				ORDER BY ct.created_at DESC
				LIMIT ?
			`).all(limit) as ConversationTurnRow[];

		// Return in chronological order (oldest first)
		return rows.map(row => this.rowToTurn(row)).reverse();
	}

	async getRecentConversations(projectId: string | null, limit: number = 5): Promise<Conversation[]> {
		await this.ensureInitialized();
		if (!this.db) throw new Error('Database not initialized');

		const rows = projectId
			? this.db.prepare(`
				SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?
			`).all(projectId, limit) as ConversationRow[]
			: this.db.prepare(`
				SELECT * FROM conversations WHERE project_id IS NULL ORDER BY updated_at DESC LIMIT ?
			`).all(limit) as ConversationRow[];

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
	 */
	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
			this.initialized = false;
		}
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
