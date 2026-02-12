/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { join, extname, basename, dirname } from '../../../base/common/path.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';

export const ITarxFileWatcherService = createDecorator<ITarxFileWatcherService>('tarxFileWatcherService');

export type TarxFileChangeType = 'create' | 'change' | 'delete';

export interface TarxFileChange {
	type: TarxFileChangeType;
	path: string;
	filename: string;
	extension: string;
	timestamp: Date;
}

export interface TarxFileWatcherOptions {
	/**
	 * Directories to watch
	 */
	directories: string[];

	/**
	 * File extensions to index (e.g., ['.ts', '.js', '.md'])
	 * If empty, indexes all text files
	 */
	indexExtensions?: string[];

	/**
	 * Patterns to ignore (glob-like)
	 */
	ignorePatterns?: string[];

	/**
	 * Debounce delay in ms for batching changes
	 */
	debounceMs?: number;
}

export interface ITarxFileWatcherService {
	readonly _serviceBrand: undefined;

	readonly onDidFileChange: Event<TarxFileChange>;
	readonly onDidSuggestGitignore: Event<{ envPath: string; gitignorePath: string }>;
	readonly onDidSuggestAction: Event<{ path: string; suggestion: string; action: () => void }>;

	/**
	 * Start watching directories
	 * Requires Tier 2+ permissions
	 */
	start(options: TarxFileWatcherOptions): void;

	/**
	 * Stop all file watching
	 */
	stop(): void;

	/**
	 * Add a directory to watch
	 */
	addDirectory(directory: string): void;

	/**
	 * Remove a directory from watch
	 */
	removeDirectory(directory: string): void;

	/**
	 * Get list of watched directories
	 */
	getWatchedDirectories(): string[];

	/**
	 * Check if watching is active
	 */
	isWatching(): boolean;

	/**
	 * Get statistics
	 */
	getStats(): { filesIndexed: number; changesProcessed: number; errors: number };
}

/**
 * TARX File Watcher Service
 *
 * Watches directories for file changes and:
 * - Auto-indexes new/changed files into RAG
 * - Detects .env files and suggests gitignore
 * - Detects large files and suggests compression
 * - Batches changes for efficiency
 */
export class TarxFileWatcherService extends Disposable implements ITarxFileWatcherService {
	declare readonly _serviceBrand: undefined;

	private watchers: Map<string, fs.FSWatcher> = new Map();
	private options: TarxFileWatcherOptions | null = null;
	private changeBuffer: TarxFileChange[] = [];
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private stats = { filesIndexed: 0, changesProcessed: 0, errors: 0 };

	private readonly _onDidFileChange = this._register(new Emitter<TarxFileChange>());
	readonly onDidFileChange: Event<TarxFileChange> = this._onDidFileChange.event;

	private readonly _onDidSuggestGitignore = this._register(new Emitter<{ envPath: string; gitignorePath: string }>());
	readonly onDidSuggestGitignore: Event<{ envPath: string; gitignorePath: string }> = this._onDidSuggestGitignore.event;

	private readonly _onDidSuggestAction = this._register(new Emitter<{ path: string; suggestion: string; action: () => void }>());
	readonly onDidSuggestAction: Event<{ path: string; suggestion: string; action: () => void }> = this._onDidSuggestAction.event;

	// Default patterns to ignore
	private readonly defaultIgnorePatterns = [
		'node_modules',
		'.git',
		'.svn',
		'.hg',
		'__pycache__',
		'.pytest_cache',
		'.mypy_cache',
		'dist',
		'build',
		'out',
		'.next',
		'.nuxt',
		'.cache',
		'coverage',
		'.nyc_output',
		'*.log',
		'*.lock',
		'package-lock.json',
		'yarn.lock',
		'pnpm-lock.yaml'
	];

	// Extensions that can be indexed
	private readonly indexableExtensions = [
		'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
		'.py', '.pyi',
		'.rs',
		'.go',
		'.java', '.kt', '.scala',
		'.c', '.cpp', '.h', '.hpp',
		'.cs',
		'.rb',
		'.php',
		'.swift',
		'.md', '.mdx', '.markdown',
		'.txt', '.text',
		'.json', '.jsonc',
		'.yaml', '.yml',
		'.toml',
		'.xml',
		'.html', '.htm',
		'.css', '.scss', '.sass', '.less',
		'.sql',
		'.sh', '.bash', '.zsh',
		'.dockerfile', '.containerfile',
		'.env', '.env.local', '.env.development', '.env.production'
	];

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.logService.info('[TARX FileWatcher] Service initialized');
	}

	start(options: TarxFileWatcherOptions): void {
		this.stop(); // Stop any existing watchers

		this.options = {
			...options,
			debounceMs: options.debounceMs ?? 500,
			ignorePatterns: [...this.defaultIgnorePatterns, ...(options.ignorePatterns || [])],
			indexExtensions: options.indexExtensions || this.indexableExtensions
		};

		for (const directory of options.directories) {
			this.addDirectory(directory);
		}

		this.logService.info(`[TARX FileWatcher] Started watching ${options.directories.length} directories`);
	}

	stop(): void {
		for (const [directory, watcher] of this.watchers) {
			watcher.close();
			this.logService.trace(`[TARX FileWatcher] Stopped watching: ${directory}`);
		}
		this.watchers.clear();

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		this.changeBuffer = [];
		this.logService.info('[TARX FileWatcher] Stopped all watchers');
	}

	addDirectory(directory: string): void {
		if (this.watchers.has(directory)) {
			this.logService.warn(`[TARX FileWatcher] Already watching: ${directory}`);
			return;
		}

		if (!fs.existsSync(directory)) {
			this.logService.warn(`[TARX FileWatcher] Directory does not exist: ${directory}`);
			return;
		}

		try {
			const watcher = fs.watch(directory, { recursive: true }, (eventType, filename) => {
				if (!filename) {
					return;
				}
				this.handleFileEvent(eventType, directory, filename);
			});

			watcher.on('error', (error) => {
				this.logService.error(`[TARX FileWatcher] Error in ${directory}: ${error}`);
				this.stats.errors++;
			});

			this.watchers.set(directory, watcher);
			this.logService.info(`[TARX FileWatcher] Now watching: ${directory}`);
		} catch (error) {
			this.logService.error(`[TARX FileWatcher] Failed to watch ${directory}: ${error}`);
			this.stats.errors++;
		}
	}

	removeDirectory(directory: string): void {
		const watcher = this.watchers.get(directory);
		if (watcher) {
			watcher.close();
			this.watchers.delete(directory);
			this.logService.info(`[TARX FileWatcher] Stopped watching: ${directory}`);
		}
	}

	getWatchedDirectories(): string[] {
		return Array.from(this.watchers.keys());
	}

	isWatching(): boolean {
		return this.watchers.size > 0;
	}

	getStats(): { filesIndexed: number; changesProcessed: number; errors: number } {
		return { ...this.stats };
	}

	private handleFileEvent(eventType: string, directory: string, filename: string): void {
		const fullPath = join(directory, filename);
		const extension = extname(filename).toLowerCase();
		const basename = basename(filename);

		// Check if should ignore
		if (this.shouldIgnore(fullPath, basename)) {
			return;
		}

		// Determine change type
		let type: TarxFileChangeType;
		if (eventType === 'rename') {
			type = fs.existsSync(fullPath) ? 'create' : 'delete';
		} else {
			type = 'change';
		}

		const change: TarxFileChange = {
			type,
			path: fullPath,
			filename: basename,
			extension,
			timestamp: new Date()
		};

		// Buffer the change
		this.changeBuffer.push(change);

		// Debounce processing
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.processBufferedChanges();
		}, this.options?.debounceMs || 500);
	}

	private processBufferedChanges(): void {
		const changes = [...this.changeBuffer];
		this.changeBuffer = [];

		// Deduplicate by path (keep latest)
		const uniqueChanges = new Map<string, TarxFileChange>();
		for (const change of changes) {
			uniqueChanges.set(change.path, change);
		}

		for (const change of uniqueChanges.values()) {
			this.processChange(change);
		}
	}

	private processChange(change: TarxFileChange): void {
		this.stats.changesProcessed++;
		this.logService.trace(`[TARX FileWatcher] ${change.type}: ${change.path}`);

		// Emit change event
		this._onDidFileChange.fire(change);

		// Process based on type and extension
		if (change.type !== 'delete') {
			this.checkForProactiveSuggestions(change);
		}

		// Index if applicable
		if (this.shouldIndex(change)) {
			this.indexFile(change);
		}
	}

	private shouldIgnore(fullPath: string, fileName: string): boolean {
		if (!this.options) {
			return true;
		}

		// Check ignore patterns
		for (const pattern of this.options.ignorePatterns!) {
			if (pattern.startsWith('*')) {
				// Extension pattern
				if (fileName.endsWith(pattern.slice(1))) {
					return true;
				}
			} else {
				// Directory/file pattern
				if (fullPath.includes(`/${pattern}/`) || fullPath.includes(`\\${pattern}\\`) || fileName === pattern) {
					return true;
				}
			}
		}

		return false;
	}

	private shouldIndex(change: TarxFileChange): boolean {
		if (!this.options) {
			return false;
		}
		if (change.type === 'delete') {
			return false;
		}

		return this.options.indexExtensions!.includes(change.extension.toLowerCase());
	}

	private checkForProactiveSuggestions(change: TarxFileChange): void {
		const basename = change.filename.toLowerCase();

		// Check for .env files
		if (basename === '.env' || basename.startsWith('.env.')) {
			this.checkGitignoreForEnv(change);
		}

		// Check for large files
		this.checkLargeFile(change);
	}

	private checkGitignoreForEnv(change: TarxFileChange): void {
		const directory = dirname(change.path);
		const gitignorePath = join(directory, '.gitignore');

		// Look for .gitignore in current dir or parent dirs
		let searchDir = directory;
		let foundGitignore: string | null = null;

		for (let i = 0; i < 5; i++) { // Search up to 5 levels
			const candidate = join(searchDir, '.gitignore');
			if (fs.existsSync(candidate)) {
				foundGitignore = candidate;
				break;
			}

			const parent = dirname(searchDir);
			if (parent === searchDir) {
				break;
			}
			searchDir = parent;
		}

		if (foundGitignore) {
			try {
				const content = fs.readFileSync(foundGitignore, 'utf8');
				const envPattern = change.filename;

				// Check if .env is already ignored
				const lines = content.split('\n').map(l => l.trim());
				const isIgnored = lines.some(line =>
					line === '.env' ||
					line === '.env*' ||
					line === envPattern ||
					line === `/${envPattern}`
				);

				if (!isIgnored) {
					this.logService.info(`[TARX FileWatcher] Suggesting gitignore for: ${change.path}`);
					this._onDidSuggestGitignore.fire({
						envPath: change.path,
						gitignorePath: foundGitignore
					});

					this._onDidSuggestAction.fire({
						path: change.path,
						suggestion: `Add ${change.filename} to .gitignore to protect your secrets?`,
						action: () => this.addToGitignore(foundGitignore!, change.filename)
					});
				}
			} catch (error) {
				this.logService.warn(`[TARX FileWatcher] Failed to read gitignore: ${error}`);
			}
		}
	}

	private checkLargeFile(change: TarxFileChange): void {
		const tenMB = 10 * 1024 * 1024;

		try {
			const stats = fs.statSync(change.path);
			if (stats.size > tenMB) {
				const sizeDisplay = this.formatSize(stats.size);
				this.logService.info(`[TARX FileWatcher] Large file detected: ${change.path} (${sizeDisplay})`);

				this._onDidSuggestAction.fire({
					path: change.path,
					suggestion: `${change.filename} is ${sizeDisplay}. Would you like to compress it?`,
					action: () => { /* Compression would be handled elsewhere */ }
				});
			}
		} catch (error) {
			// File might not exist anymore
		}
	}

	private addToGitignore(gitignorePath: string, pattern: string): void {
		try {
			let content = fs.readFileSync(gitignorePath, 'utf8');

			// Add newline if needed
			if (!content.endsWith('\n')) {
				content += '\n';
			}

			// Add pattern with comment
			content += `\n# Added by TARX - ${new Date().toISOString()}\n${pattern}\n`;

			fs.writeFileSync(gitignorePath, content, 'utf8');
			this.logService.info(`[TARX FileWatcher] Added ${pattern} to ${gitignorePath}`);
		} catch (error) {
			this.logService.error(`[TARX FileWatcher] Failed to update gitignore: ${error}`);
		}
	}

	private async indexFile(change: TarxFileChange): Promise<void> {
		// This would integrate with the RAG indexing pipeline
		// For now, just track the stats
		this.stats.filesIndexed++;
		this.logService.trace(`[TARX FileWatcher] Would index: ${change.path}`);

		// In a full implementation:
		// 1. Read file content
		// 2. Chunk into segments
		// 3. Generate embeddings via port 11437
		// 4. Store in TARX database
	}

	private formatSize(bytes: number): string {
		if (bytes >= 1_000_000_000) {
			return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
		} else if (bytes >= 1_000_000) {
			return `${(bytes / 1_000_000).toFixed(1)} MB`;
		} else if (bytes >= 1_000) {
			return `${(bytes / 1_000).toFixed(1)} KB`;
		}
		return `${bytes} bytes`;
	}

	override dispose(): void {
		this.stop();
		super.dispose();
	}
}
