/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
	DatabaseOperations,
	Project,
	ProjectFile,
	IGNORED_DIRECTORIES,
	IGNORED_FILES,
	isBinaryFile,
	getMimeType,
	generateId,
	detectProjectType
} from './database';
import { RagClient, chunkCode, chunkText } from './ragClient';

/**
 * Indexing progress information
 */
export interface IndexingProgress {
	projectId: string;
	status: 'idle' | 'scanning' | 'indexing' | 'embedding' | 'complete' | 'error';
	filesScanned: number;
	totalFiles: number;
	filesIndexed: number;
	currentFile: string | null;
	error: string | null;
}

/**
 * Background file indexer for RAG
 */
export class ProjectIndexer {
	private db: DatabaseOperations;
	private ragClient: RagClient;
	private progress: Map<string, IndexingProgress> = new Map();
	private activeIndexing: Map<string, boolean> = new Map();
	private progressEmitter = new vscode.EventEmitter<IndexingProgress>();

	public readonly onProgress = this.progressEmitter.event;

	constructor(db: DatabaseOperations, ragClient: RagClient) {
		this.db = db;
		this.ragClient = ragClient;
	}

	/**
	 * Get current indexing progress for a project
	 */
	getProgress(projectId: string): IndexingProgress | null {
		return this.progress.get(projectId) || null;
	}

	/**
	 * Create or get a project for the given workspace folder
	 */
	async ensureProject(folderUri: vscode.Uri): Promise<Project> {
		const rootPath = folderUri.fsPath;

		// Check if project already exists
		let project = await this.db.getProjectByRoot(rootPath);
		if (project) {
			await this.db.setActiveProject(project.id);
			return project;
		}

		// Create new project
		const name = path.basename(rootPath);
		const type = detectProjectType(rootPath);

		project = await this.db.createProject({
			name,
			root: rootPath,
			type,
			isActive: true
		});

		console.log(`[TARX] Created project: ${project.name} (${project.type || 'unknown'})`);
		return project;
	}

	/**
	 * Start background indexing for a project
	 */
	async startIndexing(project: Project): Promise<void> {
		if (this.activeIndexing.get(project.id)) {
			console.log(`[TARX] Indexing already in progress for ${project.name}`);
			return;
		}

		this.activeIndexing.set(project.id, true);

		const progress: IndexingProgress = {
			projectId: project.id,
			status: 'scanning',
			filesScanned: 0,
			totalFiles: 0,
			filesIndexed: 0,
			currentFile: null,
			error: null
		};
		this.progress.set(project.id, progress);
		this.progressEmitter.fire(progress);

		try {
			// Phase 1: Scan files
			console.log(`[TARX] Scanning files in ${project.root}`);
			const files = await this.scanDirectory(project.root, project.id);
			progress.totalFiles = files.length;
			progress.status = 'indexing';
			this.progressEmitter.fire({ ...progress });

			// Phase 2: Index files (add to database)
			for (const file of files) {
				if (!this.activeIndexing.get(project.id)) {
					console.log(`[TARX] Indexing cancelled for ${project.name}`);
					break;
				}

				progress.currentFile = file.filePath;
				progress.filesScanned++;
				this.progressEmitter.fire({ ...progress });

				await this.db.addProjectFile(file);
			}

			// Phase 3: Generate embeddings
			progress.status = 'embedding';
			this.progressEmitter.fire({ ...progress });

			const projectFiles = await this.db.getProjectFiles(project.id);
			const ragHealthy = (await this.ragClient.checkHealth()).healthy;

			if (ragHealthy) {
				for (const file of projectFiles) {
					if (!this.activeIndexing.get(project.id)) break;
					if (file.isBinary) continue;

					progress.currentFile = file.filePath;
					this.progressEmitter.fire({ ...progress });

					try {
						await this.embedFile(project.root, file);
						progress.filesIndexed++;
						await this.db.updateFileIndexed(file.id, Date.now());
					} catch (e) {
						console.warn(`[TARX] Failed to embed ${file.filePath}:`, e);
					}
				}
			} else {
				console.warn('[TARX] RAG server not available, skipping embeddings');
			}

			progress.status = 'complete';
			progress.currentFile = null;
			this.progressEmitter.fire({ ...progress });

			console.log(`[TARX] Indexing complete: ${progress.filesIndexed}/${progress.totalFiles} files`);
		} catch (e) {
			const error = e instanceof Error ? e.message : 'Unknown error';
			progress.status = 'error';
			progress.error = error;
			this.progressEmitter.fire({ ...progress });
			console.error(`[TARX] Indexing error:`, e);
		} finally {
			this.activeIndexing.delete(project.id);
		}
	}

	/**
	 * Stop indexing for a project
	 */
	stopIndexing(projectId: string): void {
		this.activeIndexing.delete(projectId);
		const progress = this.progress.get(projectId);
		if (progress) {
			progress.status = 'idle';
			this.progressEmitter.fire({ ...progress });
		}
	}

	/**
	 * Scan directory recursively for indexable files
	 */
	private async scanDirectory(
		dirPath: string,
		projectId: string,
		relativePath: string = ''
	): Promise<Omit<ProjectFile, 'id'>[]> {
		const files: Omit<ProjectFile, 'id'>[] = [];

		try {
			const entries = fs.readdirSync(dirPath, { withFileTypes: true });

			for (const entry of entries) {
				const entryName = entry.name;
				const fullPath = path.join(dirPath, entryName);
				const relPath = relativePath ? `${relativePath}/${entryName}` : entryName;

				if (entry.isDirectory()) {
					// Skip ignored directories
					if (IGNORED_DIRECTORIES.has(entryName)) {
						continue;
					}

					// Recurse into subdirectory
					const subFiles = await this.scanDirectory(fullPath, projectId, relPath);
					files.push(...subFiles);
				} else if (entry.isFile()) {
					// Skip ignored files
					if (IGNORED_FILES.has(entryName)) {
						continue;
					}

					// Skip very large files (>1MB)
					const stats = fs.statSync(fullPath);
					if (stats.size > 1024 * 1024) {
						continue;
					}

					const binary = isBinaryFile(entryName);
					const mimeType = getMimeType(entryName);

					files.push({
						projectId,
						filePath: relPath,
						fileSize: stats.size,
						mimeType,
						isBinary: binary,
						lastIndexed: null
					});
				}
			}
		} catch (e) {
			console.warn(`[TARX] Failed to scan directory ${dirPath}:`, e);
		}

		return files;
	}

	/**
	 * Generate embeddings for a file
	 */
	private async embedFile(projectRoot: string, file: ProjectFile): Promise<void> {
		if (file.isBinary) return;

		const fullPath = path.join(projectRoot, file.filePath);
		let content: string;

		try {
			content = fs.readFileSync(fullPath, 'utf-8');
		} catch (e) {
			console.warn(`[TARX] Cannot read file ${file.filePath}:`, e);
			return;
		}

		// Skip empty files
		if (!content.trim()) return;

		// Chunk the file
		const language = file.mimeType || 'text/plain';
		const isCode = language.startsWith('text/') &&
			(language.includes('script') || language.includes('typescript') ||
				language.includes('python') || language.includes('rust') ||
				language.includes('go') || language.includes('java'));

		const chunks = isCode
			? chunkCode(content, language, 512, 128)
			: chunkText(content, 512, 128);

		if (chunks.length === 0) return;

		// Delete existing embeddings for this file
		await this.db.deleteFileEmbeddings(file.id);

		// Generate embeddings in batches
		const batchSize = 10;
		for (let i = 0; i < chunks.length; i += batchSize) {
			const batch = chunks.slice(i, i + batchSize);
			const texts = batch.map(c => c.content);

			try {
				const embeddings = await this.ragClient.embedBatch(texts);

				for (let j = 0; j < batch.length; j++) {
					await this.db.addEmbedding({
						fileId: file.id,
						chunkIndex: batch[j].index,
						content: batch[j].content,
						embedding: embeddings[j]
					});
				}
			} catch (e) {
				console.warn(`[TARX] Failed to embed batch for ${file.filePath}:`, e);
			}
		}
	}

	/**
	 * Re-index a single file (for incremental updates)
	 */
	async reindexFile(project: Project, relativePath: string): Promise<void> {
		const fullPath = path.join(project.root, relativePath);

		// Check if file exists and is indexable
		if (!fs.existsSync(fullPath)) {
			// File was deleted, remove from database
			const projectFiles = await this.db.getProjectFiles(project.id);
			const file = projectFiles.find(f => f.filePath === relativePath);
			if (file) {
				await this.db.deleteFileEmbeddings(file.id);
			}
			return;
		}

		const stats = fs.statSync(fullPath);
		if (stats.size > 1024 * 1024) return; // Skip large files

		const binary = isBinaryFile(relativePath);
		const mimeType = getMimeType(relativePath);

		// Add or update file record
		const file = await this.db.addProjectFile({
			projectId: project.id,
			filePath: relativePath,
			fileSize: stats.size,
			mimeType,
			isBinary: binary,
			lastIndexed: null
		});

		// Re-embed if RAG is available
		const ragHealthy = (await this.ragClient.checkHealth()).healthy;
		if (ragHealthy && !binary) {
			try {
				await this.embedFile(project.root, file);
				await this.db.updateFileIndexed(file.id, Date.now());
			} catch (e) {
				console.warn(`[TARX] Failed to re-index ${relativePath}:`, e);
			}
		}
	}

	dispose(): void {
		this.progressEmitter.dispose();
		this.activeIndexing.clear();
	}
}

/**
 * Create a file watcher for incremental indexing
 */
export function createFileWatcher(
	projectRoot: string,
	onFileChange: (relativePath: string, type: 'create' | 'change' | 'delete') => void
): vscode.Disposable {
	const pattern = new vscode.RelativePattern(projectRoot, '**/*');
	const watcher = vscode.workspace.createFileSystemWatcher(pattern);

	const handleFile = (uri: vscode.Uri, type: 'create' | 'change' | 'delete') => {
		const relativePath = path.relative(projectRoot, uri.fsPath);

		// Skip ignored directories and files
		const parts = relativePath.split(path.sep);
		if (parts.some(part => IGNORED_DIRECTORIES.has(part))) return;
		if (IGNORED_FILES.has(path.basename(relativePath))) return;

		onFileChange(relativePath, type);
	};

	watcher.onDidCreate(uri => handleFile(uri, 'create'));
	watcher.onDidChange(uri => handleFile(uri, 'change'));
	watcher.onDidDelete(uri => handleFile(uri, 'delete'));

	return watcher;
}
