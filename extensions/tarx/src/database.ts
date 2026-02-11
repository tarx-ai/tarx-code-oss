/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * SQLite Database Schema for TARX Workbench
 *
 * Tables:
 * - projects: Workspace/folder projects
 * - project_files: Files within a project
 * - file_embeddings: Vector embeddings for RAG
 * - conversations: Chat history
 * - conversation_turns: Individual messages
 */

export interface Project {
	id: string;
	name: string;
	root: string;
	type: string | null;
	createdAt: number;
	isActive: boolean;
}

export interface ProjectFile {
	id: string;
	projectId: string;
	filePath: string;
	fileSize: number;
	mimeType: string | null;
	isBinary: boolean;
	lastIndexed: number | null;
}

export interface FileEmbedding {
	id: string;
	fileId: string;
	chunkIndex: number;
	content: string;
	embedding: Float32Array;
	createdAt: number;
}

export interface Conversation {
	id: string;
	projectId: string | null;
	title: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface ConversationTurn {
	id: string;
	conversationId: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	fileRefs: string[]; // JSON array of file paths
	artifacts: string | null; // JSON array of code artifacts
	createdAt: number;
}

/**
 * SQL Schema Definition
 */
export const SCHEMA_SQL = `
-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root TEXT NOT NULL UNIQUE,
    type TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    is_active INTEGER NOT NULL DEFAULT 0
);

-- Project files table
CREATE TABLE IF NOT EXISTS project_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    mime_type TEXT,
    is_binary INTEGER NOT NULL DEFAULT 0,
    last_indexed INTEGER,
    UNIQUE(project_id, file_path)
);

-- File embeddings table (for RAG)
CREATE TABLE IF NOT EXISTS file_embeddings (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    UNIQUE(file_id, chunk_index)
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    title TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Conversation turns table
CREATE TABLE IF NOT EXISTS conversation_turns (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    file_refs TEXT DEFAULT '[]',
    artifacts TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_file_embeddings_file ON file_embeddings(file_id);
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_conversation_turns_conversation ON conversation_turns(conversation_id);
`;

/**
 * Generate a UUID v4
 */
export function generateId(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

/**
 * Detect project type from root directory
 */
export function detectProjectType(rootPath: string): string | null {
	const indicators: Record<string, string> = {
		'package.json': 'javascript',
		'tsconfig.json': 'typescript',
		'pyproject.toml': 'python',
		'Cargo.toml': 'rust',
		'go.mod': 'go',
		'pom.xml': 'java',
		'build.gradle': 'java',
		'Gemfile': 'ruby',
		'composer.json': 'php',
		'.csproj': 'csharp',
		'CMakeLists.txt': 'cpp',
		'Makefile': 'make',
	};

	for (const [file, type] of Object.entries(indicators)) {
		if (fs.existsSync(path.join(rootPath, file))) {
			return type;
		}
	}

	// Check for common directory patterns
	if (fs.existsSync(path.join(rootPath, 'src')) ||
		fs.existsSync(path.join(rootPath, 'lib'))) {
		return 'generic';
	}

	return null;
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	const mimeTypes: Record<string, string> = {
		'.ts': 'text/typescript',
		'.tsx': 'text/typescript-jsx',
		'.js': 'text/javascript',
		'.jsx': 'text/javascript-jsx',
		'.json': 'application/json',
		'.md': 'text/markdown',
		'.py': 'text/x-python',
		'.rs': 'text/x-rust',
		'.go': 'text/x-go',
		'.java': 'text/x-java',
		'.c': 'text/x-c',
		'.cpp': 'text/x-c++',
		'.h': 'text/x-c',
		'.hpp': 'text/x-c++',
		'.css': 'text/css',
		'.scss': 'text/x-scss',
		'.html': 'text/html',
		'.xml': 'application/xml',
		'.yaml': 'text/yaml',
		'.yml': 'text/yaml',
		'.toml': 'text/x-toml',
		'.sql': 'text/x-sql',
		'.sh': 'text/x-shellscript',
		'.bash': 'text/x-shellscript',
		'.rb': 'text/x-ruby',
		'.php': 'text/x-php',
		'.swift': 'text/x-swift',
		'.kt': 'text/x-kotlin',
		'.scala': 'text/x-scala',
		'.vue': 'text/x-vue',
		'.svelte': 'text/x-svelte',
	};

	return mimeTypes[ext] || 'text/plain';
}

/**
 * Check if file is binary based on extension
 */
export function isBinaryFile(filePath: string): boolean {
	const ext = path.extname(filePath).toLowerCase();
	const binaryExtensions = new Set([
		'.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
		'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
		'.zip', '.tar', '.gz', '.rar', '.7z',
		'.exe', '.dll', '.so', '.dylib',
		'.mp3', '.mp4', '.wav', '.avi', '.mov',
		'.ttf', '.otf', '.woff', '.woff2', '.eot',
		'.db', '.sqlite', '.sqlite3',
		'.bin', '.dat', '.o', '.a',
		'.pyc', '.pyo', '.class',
		'.lock', // package lock files are often huge
	]);

	return binaryExtensions.has(ext);
}

/**
 * Directories to skip during indexing
 */
export const IGNORED_DIRECTORIES = new Set([
	'node_modules',
	'.git',
	'.svn',
	'.hg',
	'__pycache__',
	'.pytest_cache',
	'.mypy_cache',
	'.tox',
	'venv',
	'.venv',
	'env',
	'.env',
	'target', // Rust/Java
	'build',
	'dist',
	'out',
	'.next',
	'.nuxt',
	'.output',
	'.cache',
	'.parcel-cache',
	'coverage',
	'.nyc_output',
	'.gradle',
	'.idea',
	'.vscode', // May want to index .vscode/settings.json though
	'.vs',
	'vendor',
	'Pods',
	'DerivedData',
]);

/**
 * Files to skip during indexing
 */
export const IGNORED_FILES = new Set([
	'.DS_Store',
	'Thumbs.db',
	'.gitignore',
	'.gitattributes',
	'.editorconfig',
	'.prettierrc',
	'.eslintcache',
	'package-lock.json',
	'yarn.lock',
	'pnpm-lock.yaml',
	'composer.lock',
	'Gemfile.lock',
	'Cargo.lock',
	'poetry.lock',
]);

/**
 * Database operations interface
 * Note: Actual SQLite implementation would use better-sqlite3 or sql.js
 * For VS Code extension, we use a simple file-based JSON store as fallback
 */
export interface DatabaseOperations {
	// Projects
	createProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project>;
	getProject(id: string): Promise<Project | null>;
	getProjectByRoot(root: string): Promise<Project | null>;
	listProjects(): Promise<Project[]>;
	setActiveProject(id: string): Promise<void>;
	deleteProject(id: string): Promise<void>;

	// Files
	addProjectFile(file: Omit<ProjectFile, 'id'>): Promise<ProjectFile>;
	getProjectFiles(projectId: string): Promise<ProjectFile[]>;
	updateFileIndexed(fileId: string, timestamp: number): Promise<void>;
	deleteProjectFiles(projectId: string): Promise<void>;

	// Embeddings
	addEmbedding(embedding: Omit<FileEmbedding, 'id' | 'createdAt'>): Promise<void>;
	getFileEmbeddings(fileId: string): Promise<FileEmbedding[]>;
	searchEmbeddings(projectId: string, queryEmbedding: Float32Array, limit?: number): Promise<Array<{ content: string; filePath: string; similarity: number }>>;
	deleteFileEmbeddings(fileId: string): Promise<void>;

	// Conversations
	createConversation(projectId: string | null): Promise<Conversation>;
	updateConversationTitle(id: string, title: string): Promise<void>;
	addConversationTurn(turn: Omit<ConversationTurn, 'id' | 'createdAt'>): Promise<ConversationTurn>;
	getConversationTurns(conversationId: string): Promise<ConversationTurn[]>;
	getRecentConversation(projectId: string | null): Promise<Conversation | null>;
	getRecentTurns(projectId: string | null, limit?: number): Promise<ConversationTurn[]>;
	getRecentConversations(projectId: string | null, limit?: number): Promise<Conversation[]>;

	// Raw database access (for advanced queries like sessions table)
	getDb(): unknown;
	ensureDbReady(): Promise<unknown>;
}

/**
 * Simple JSON-based database for development/fallback
 * Production should use better-sqlite3 or sql.js
 */
export class JsonDatabase implements DatabaseOperations {
	private data: {
		projects: Project[];
		files: ProjectFile[];
		embeddings: FileEmbedding[];
		conversations: Conversation[];
		turns: ConversationTurn[];
	};
	private dbPath: string;

	constructor(storagePath: string) {
		// Validate storage path - reject root-level paths like /mock
		if (this.isInvalidStoragePath(storagePath)) {
			const os = require('os');
			const fallbackPath = path.join(os.tmpdir(), 'tarx-storage');
			console.warn(`[TARX] Invalid storage path "${storagePath}", using fallback: ${fallbackPath}`);
			this.dbPath = path.join(fallbackPath, 'tarx-db.json');
		} else {
			this.dbPath = path.join(storagePath, 'tarx-db.json');
		}
		this.data = this.load();
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

	private load(): typeof this.data {
		try {
			if (fs.existsSync(this.dbPath)) {
				const content = fs.readFileSync(this.dbPath, 'utf-8');
				return JSON.parse(content);
			}
		} catch (e) {
			console.error('[TARX] Failed to load database:', e);
		}
		return {
			projects: [],
			files: [],
			embeddings: [],
			conversations: [],
			turns: []
		};
	}

	private save(): void {
		try {
			const dir = path.dirname(this.dbPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
		} catch (e) {
			console.error('[TARX] Failed to save database:', e);
		}
	}

	// Raw database access (JsonDatabase doesn't have a raw DB, return null)
	getDb(): unknown {
		return null;
	}

	// Ensure database ready (JsonDatabase is always ready)
	async ensureDbReady(): Promise<unknown> {
		return null;
	}

	// Projects
	async createProject(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
		const newProject: Project = {
			...project,
			id: generateId(),
			createdAt: Date.now()
		};
		this.data.projects.push(newProject);
		this.save();
		return newProject;
	}

	async getProject(id: string): Promise<Project | null> {
		return this.data.projects.find(p => p.id === id) || null;
	}

	async getProjectByRoot(root: string): Promise<Project | null> {
		return this.data.projects.find(p => p.root === root) || null;
	}

	async listProjects(): Promise<Project[]> {
		return this.data.projects;
	}

	async setActiveProject(id: string): Promise<void> {
		this.data.projects.forEach(p => p.isActive = p.id === id);
		this.save();
	}

	async deleteProject(id: string): Promise<void> {
		this.data.projects = this.data.projects.filter(p => p.id !== id);
		this.data.files = this.data.files.filter(f => f.projectId !== id);
		// Also clean up embeddings for those files
		const fileIds = new Set(this.data.files.filter(f => f.projectId === id).map(f => f.id));
		this.data.embeddings = this.data.embeddings.filter(e => !fileIds.has(e.fileId));
		this.save();
	}

	// Files
	async addProjectFile(file: Omit<ProjectFile, 'id'>): Promise<ProjectFile> {
		const existing = this.data.files.find(
			f => f.projectId === file.projectId && f.filePath === file.filePath
		);
		if (existing) {
			Object.assign(existing, file);
			this.save();
			return existing;
		}

		const newFile: ProjectFile = {
			...file,
			id: generateId()
		};
		this.data.files.push(newFile);
		this.save();
		return newFile;
	}

	async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
		return this.data.files.filter(f => f.projectId === projectId);
	}

	async updateFileIndexed(fileId: string, timestamp: number): Promise<void> {
		const file = this.data.files.find(f => f.id === fileId);
		if (file) {
			file.lastIndexed = timestamp;
			this.save();
		}
	}

	async deleteProjectFiles(projectId: string): Promise<void> {
		const fileIds = new Set(this.data.files.filter(f => f.projectId === projectId).map(f => f.id));
		this.data.files = this.data.files.filter(f => f.projectId !== projectId);
		this.data.embeddings = this.data.embeddings.filter(e => !fileIds.has(e.fileId));
		this.save();
	}

	// Embeddings
	async addEmbedding(embedding: Omit<FileEmbedding, 'id' | 'createdAt'>): Promise<void> {
		// Delete existing embedding for this chunk
		this.data.embeddings = this.data.embeddings.filter(
			e => !(e.fileId === embedding.fileId && e.chunkIndex === embedding.chunkIndex)
		);

		const newEmbedding: FileEmbedding = {
			...embedding,
			id: generateId(),
			createdAt: Date.now()
		};
		this.data.embeddings.push(newEmbedding);
		// Don't save on every embedding - batch save later
	}

	async getFileEmbeddings(fileId: string): Promise<FileEmbedding[]> {
		return this.data.embeddings.filter(e => e.fileId === fileId);
	}

	async searchEmbeddings(
		projectId: string,
		queryEmbedding: Float32Array,
		limit: number = 10
	): Promise<Array<{ content: string; filePath: string; similarity: number }>> {
		// Get all file IDs for this project
		const fileMap = new Map<string, string>();
		for (const file of this.data.files) {
			if (file.projectId === projectId) {
				fileMap.set(file.id, file.filePath);
			}
		}

		// Calculate cosine similarity for each embedding
		const results: Array<{ content: string; filePath: string; similarity: number }> = [];

		for (const embedding of this.data.embeddings) {
			const filePath = fileMap.get(embedding.fileId);
			if (!filePath) continue;

			const similarity = cosineSimilarity(queryEmbedding, embedding.embedding);
			results.push({
				content: embedding.content,
				filePath,
				similarity
			});
		}

		// Sort by similarity and return top results
		return results
			.sort((a, b) => b.similarity - a.similarity)
			.slice(0, limit);
	}

	async deleteFileEmbeddings(fileId: string): Promise<void> {
		this.data.embeddings = this.data.embeddings.filter(e => e.fileId !== fileId);
		this.save();
	}

	// Conversations
	async createConversation(projectId: string | null): Promise<Conversation> {
		const conversation: Conversation = {
			id: generateId(),
			projectId,
			title: null,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		this.data.conversations.push(conversation);
		this.save();
		return conversation;
	}

	async updateConversationTitle(id: string, title: string): Promise<void> {
		const conv = this.data.conversations.find(c => c.id === id);
		if (conv) {
			conv.title = title;
			conv.updatedAt = Date.now();
			this.save();
		}
	}

	async addConversationTurn(turn: Omit<ConversationTurn, 'id' | 'createdAt'>): Promise<ConversationTurn> {
		const newTurn: ConversationTurn = {
			...turn,
			id: generateId(),
			createdAt: Date.now()
		};
		this.data.turns.push(newTurn);

		// Update conversation timestamp
		const conv = this.data.conversations.find(c => c.id === turn.conversationId);
		if (conv) {
			conv.updatedAt = Date.now();
		}

		this.save();
		return newTurn;
	}

	async getConversationTurns(conversationId: string): Promise<ConversationTurn[]> {
		return this.data.turns
			.filter(t => t.conversationId === conversationId)
			.sort((a, b) => a.createdAt - b.createdAt);
	}

	async getRecentConversation(projectId: string | null): Promise<Conversation | null> {
		// Get most recent conversation - all if no project, filtered if project active
		const filtered = projectId === null
			? this.data.conversations
			: this.data.conversations.filter(c => c.projectId === projectId);
		const conversations = filtered.sort((a, b) => b.updatedAt - a.updatedAt);
		return conversations[0] || null;
	}

	async getRecentTurns(projectId: string | null, limit: number = 10): Promise<ConversationTurn[]> {
		// Get conversations - all if no project, filtered if project active
		const filtered = projectId === null
			? this.data.conversations
			: this.data.conversations.filter(c => c.projectId === projectId);
		const conversations = filtered.sort((a, b) => b.updatedAt - a.updatedAt);

		if (conversations.length === 0) {
			return [];
		}

		// Collect turns from recent conversations until we have enough
		const turns: ConversationTurn[] = [];
		for (const conv of conversations) {
			const convTurns = this.data.turns
				.filter(t => t.conversationId === conv.id)
				.sort((a, b) => b.createdAt - a.createdAt);

			for (const turn of convTurns) {
				turns.push(turn);
				if (turns.length >= limit) {
					break;
				}
			}

			if (turns.length >= limit) {
				break;
			}
		}

		// Return in chronological order (oldest first)
		return turns.reverse();
	}

	async getRecentConversations(projectId: string | null, limit: number = 5): Promise<Conversation[]> {
		// If no project is active (projectId is null), show ALL conversations
		// If a project is active, filter to that project's conversations
		const filtered = projectId === null
			? this.data.conversations
			: this.data.conversations.filter(c => c.projectId === projectId);

		return filtered
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, limit);
	}

	// Batch save for embeddings
	flush(): void {
		this.save();
	}
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
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
