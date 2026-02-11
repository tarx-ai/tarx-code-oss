/**
 * TARX Consolidated Patch - Limitation Fixes
 * Generated from deep audit findings
 *
 * @file extensions/tarx/src/limit-patch.ts
 *
 * Contains fixes for:
 * 1. Diff application (parseUnifiedDiff, applyDiff)
 * 2. Atomic file writes with backup (atomicWrite)
 * 3. Safe exec with standardized timeout (safeExecSync, safeExecAsync)
 * 4. Path validation for traversal protection (validatePath)
 * 5. Multi-file transaction support (FileTransaction)
 * 6. Enhanced artifact applier (applyArtifactSafe)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, exec, ExecSyncOptions, ExecOptions } from 'child_process';

// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_EXEC_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024; // 10MB
const BACKUP_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================
// PATH VALIDATION
// ============================================

export interface PathValidationResult {
	valid: boolean;
	resolvedPath: string;
	error?: string;
}

/**
 * Validates a file path against traversal attacks
 * @param filePath - The path to validate
 * @param rootDir - The root directory that paths must stay within
 * @returns Validation result with resolved path or error
 */
export function validatePath(filePath: string, rootDir: string): PathValidationResult {
	try {
		const resolvedRoot = path.resolve(rootDir);
		const resolvedPath = path.resolve(rootDir, filePath);

		// Check for path traversal
		if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
			return {
				valid: false,
				resolvedPath: '',
				error: `Path traversal blocked: ${filePath} escapes root ${rootDir}`
			};
		}

		// Check for null bytes (injection attempt)
		if (filePath.includes('\0') || resolvedPath.includes('\0')) {
			return {
				valid: false,
				resolvedPath: '',
				error: 'Null byte injection detected'
			};
		}

		return {
			valid: true,
			resolvedPath
		};
	} catch (error) {
		return {
			valid: false,
			resolvedPath: '',
			error: error instanceof Error ? error.message : 'Path validation failed'
		};
	}
}

// ============================================
// ATOMIC FILE WRITE
// ============================================

export interface AtomicWriteOptions {
	backup?: boolean;
	createDirs?: boolean;
	mode?: number;
	encoding?: BufferEncoding;
}

export interface AtomicWriteResult {
	success: boolean;
	backupPath?: string;
	error?: string;
}

/**
 * Atomically write content to a file with optional backup
 * Uses write-to-temp-then-rename pattern for crash safety
 */
export function atomicWrite(
	filePath: string,
	content: string | Buffer,
	options: AtomicWriteOptions = {}
): AtomicWriteResult {
	const {
		backup = true,
		createDirs = true,
		mode = 0o644,
		encoding = 'utf8'
	} = options;

	const resolvedPath = path.resolve(filePath);
	const dir = path.dirname(resolvedPath);
	const timestamp = Date.now();
	const tempPath = `${resolvedPath}.tmp.${timestamp}`;
	let backupPath: string | undefined;

	try {
		// Create directories if needed
		if (createDirs && !fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		// Backup existing file
		if (backup && fs.existsSync(resolvedPath)) {
			backupPath = `${resolvedPath}.backup.${timestamp}`;
			fs.copyFileSync(resolvedPath, backupPath);
		}

		// Write to temp file
		if (typeof content === 'string') {
			fs.writeFileSync(tempPath, content, { encoding, mode });
		} else {
			fs.writeFileSync(tempPath, content, { mode });
		}

		// Atomic rename
		fs.renameSync(tempPath, resolvedPath);

		return { success: true, backupPath };
	} catch (error) {
		// Cleanup temp file if it exists
		try {
			if (fs.existsSync(tempPath)) {
				fs.unlinkSync(tempPath);
			}
		} catch {
			// Ignore cleanup errors
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : 'Atomic write failed'
		};
	}
}

/**
 * Clean up old backup files beyond retention period
 */
export function cleanupBackups(directory: string, pattern = /\.backup\.\d+$/): number {
	let cleaned = 0;
	const now = Date.now();

	try {
		const files = fs.readdirSync(directory);
		for (const file of files) {
			if (pattern.test(file)) {
				const filePath = path.join(directory, file);
				const stats = fs.statSync(filePath);
				if (now - stats.mtimeMs > BACKUP_RETENTION_MS) {
					fs.unlinkSync(filePath);
					cleaned++;
				}
			}
		}
	} catch {
		// Ignore errors during cleanup
	}

	return cleaned;
}

// ============================================
// SAFE EXEC
// ============================================

export interface SafeExecSyncOptions {
	timeout?: number;
	maxBuffer?: number;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	encoding?: BufferEncoding;
	shell?: string;
}

export interface SafeExecSyncResult {
	success: boolean;
	output: string;
	error?: string;
	timedOut?: boolean;
}

/**
 * Safe synchronous command execution with standardized timeout
 */
export function safeExecSync(
	command: string,
	options: SafeExecSyncOptions = {}
): SafeExecSyncResult {
	const {
		timeout = DEFAULT_EXEC_TIMEOUT,
		maxBuffer = DEFAULT_MAX_BUFFER,
		cwd = process.cwd(),
		env = process.env,
		encoding = 'utf8',
		shell
	} = options;

	const execOptions: ExecSyncOptions = {
		timeout,
		maxBuffer,
		cwd,
		env,
		encoding,
		stdio: ['pipe', 'pipe', 'pipe'],
		windowsHide: true
	};

	if (shell) {
		execOptions.shell = shell;
	}

	try {
		const output = execSync(command, execOptions);
		return {
			success: true,
			output: output.toString()
		};
	} catch (error: unknown) {
		const execError = error as { killed?: boolean; signal?: string; stderr?: Buffer; message?: string };
		const timedOut = execError.killed === true || execError.signal === 'SIGTERM';

		return {
			success: false,
			output: execError.stderr?.toString() || '',
			error: execError.message || 'Command execution failed',
			timedOut
		};
	}
}

export interface SafeExecAsyncOptions extends SafeExecSyncOptions {
	onStdout?: (data: string) => void;
	onStderr?: (data: string) => void;
}

export interface SafeExecAsyncResult {
	success: boolean;
	stdout: string;
	stderr: string;
	exitCode: number;
	timedOut: boolean;
}

/**
 * Safe asynchronous command execution with standardized timeout
 */
export function safeExecAsync(
	command: string,
	options: SafeExecAsyncOptions = {}
): Promise<SafeExecAsyncResult> {
	const {
		timeout = DEFAULT_EXEC_TIMEOUT,
		maxBuffer = DEFAULT_MAX_BUFFER,
		cwd = process.cwd(),
		env = process.env,
		shell,
		onStdout,
		onStderr
	} = options;

	return new Promise((resolve) => {
		const execOptions: ExecOptions = {
			timeout,
			maxBuffer,
			cwd,
			env,
			windowsHide: true
		};

		if (shell) {
			execOptions.shell = shell;
		}

		const child = exec(command, execOptions, (error, stdout, stderr) => {
			const execError = error as { killed?: boolean; code?: number } | null;
			resolve({
				success: !error,
				stdout: stdout?.toString() || '',
				stderr: stderr?.toString() || '',
				exitCode: execError?.code ?? 0,
				timedOut: execError?.killed ?? false
			});
		});

		if (onStdout && child.stdout) {
			child.stdout.on('data', (data) => onStdout(data.toString()));
		}
		if (onStderr && child.stderr) {
			child.stderr.on('data', (data) => onStderr(data.toString()));
		}
	});
}

// ============================================
// DIFF APPLICATION
// ============================================

export interface DiffHunk {
	oldStart: number;
	oldCount: number;
	newStart: number;
	newCount: number;
	lines: string[];
}

export interface ParsedDiff {
	oldFile: string;
	newFile: string;
	hunks: DiffHunk[];
}

/**
 * Parse a unified diff format string into structured data
 */
export function parseUnifiedDiff(diffText: string): ParsedDiff[] {
	const diffs: ParsedDiff[] = [];
	const lines = diffText.split('\n');
	let currentDiff: ParsedDiff | null = null;
	let currentHunk: DiffHunk | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// File headers
		if (line.startsWith('--- ')) {
			if (currentDiff) {
				if (currentHunk) {
					currentDiff.hunks.push(currentHunk);
				}
				diffs.push(currentDiff);
			}
			currentDiff = {
				oldFile: line.slice(4).split('\t')[0],
				newFile: '',
				hunks: []
			};
			currentHunk = null;
		} else if (line.startsWith('+++ ') && currentDiff) {
			currentDiff.newFile = line.slice(4).split('\t')[0];
		}
		// Hunk header
		else if (line.startsWith('@@') && currentDiff) {
			if (currentHunk) {
				currentDiff.hunks.push(currentHunk);
			}

			const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
			if (match) {
				currentHunk = {
					oldStart: parseInt(match[1], 10),
					oldCount: parseInt(match[2] || '1', 10),
					newStart: parseInt(match[3], 10),
					newCount: parseInt(match[4] || '1', 10),
					lines: []
				};
			}
		}
		// Hunk content
		else if (currentHunk && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-') || line === '')) {
			currentHunk.lines.push(line);
		}
	}

	// Push final diff and hunk
	if (currentDiff) {
		if (currentHunk) {
			currentDiff.hunks.push(currentHunk);
		}
		diffs.push(currentDiff);
	}

	return diffs;
}

export interface ApplyDiffResult {
	success: boolean;
	content?: string;
	error?: string;
	appliedHunks: number;
	failedHunks: number;
}

/**
 * Apply a parsed diff to file content
 * @param originalContent - The original file content
 * @param diff - The parsed diff to apply
 * @param fuzz - Number of lines of context that can be missing (default 0)
 */
export function applyDiff(
	originalContent: string,
	diff: ParsedDiff,
	fuzz: number = 0
): ApplyDiffResult {
	const lines = originalContent.split('\n');
	let appliedHunks = 0;
	let failedHunks = 0;

	// Apply hunks in reverse order to preserve line numbers
	const sortedHunks = [...diff.hunks].sort((a, b) => b.oldStart - a.oldStart);

	for (const hunk of sortedHunks) {
		const result = applyHunk(lines, hunk, fuzz);
		if (result.success) {
			appliedHunks++;
		} else {
			failedHunks++;
		}
	}

	if (failedHunks > 0 && appliedHunks === 0) {
		return {
			success: false,
			error: `All ${failedHunks} hunks failed to apply`,
			appliedHunks,
			failedHunks
		};
	}

	return {
		success: true,
		content: lines.join('\n'),
		appliedHunks,
		failedHunks
	};
}

function applyHunk(lines: string[], hunk: DiffHunk, fuzz: number): { success: boolean } {
	// Find the context to locate where to apply
	const contextLines: string[] = [];
	const removals: string[] = [];
	const additions: string[] = [];

	for (const line of hunk.lines) {
		if (line.startsWith(' ')) {
			contextLines.push(line.slice(1));
		} else if (line.startsWith('-')) {
			removals.push(line.slice(1));
		} else if (line.startsWith('+')) {
			additions.push(line.slice(1));
		}
	}

	// Try to find the exact position (with fuzz factor)
	let startLine = hunk.oldStart - 1; // Convert to 0-indexed
	let found = false;

	for (let offset = 0; offset <= fuzz && !found; offset++) {
		for (const dir of [0, -1, 1]) {
			const tryLine = startLine + (offset * dir);
			if (tryLine >= 0 && tryLine < lines.length) {
				if (matchesContext(lines, tryLine, contextLines, removals)) {
					startLine = tryLine;
					found = true;
					break;
				}
			}
		}
	}

	if (!found) {
		return { success: false };
	}

	// Apply the hunk
	const toRemove = removals.length + contextLines.length;
	const newLines = [...contextLines.slice(0, contextLines.length), ...additions];

	// Actually apply by processing hunk lines in order
	let readIndex = startLine;
	const result: string[] = [];

	for (const line of hunk.lines) {
		if (line.startsWith(' ')) {
			// Context line - copy from original
			result.push(lines[readIndex++]);
		} else if (line.startsWith('-')) {
			// Removal - skip in original
			readIndex++;
		} else if (line.startsWith('+')) {
			// Addition - add new line
			result.push(line.slice(1));
		}
	}

	// Replace the range in the original
	lines.splice(startLine, readIndex - startLine, ...result);

	return { success: true };
}

function matchesContext(
	lines: string[],
	startLine: number,
	contextLines: string[],
	removals: string[]
): boolean {
	const allExpected = [...contextLines, ...removals];
	let lineIndex = startLine;

	for (const expected of allExpected) {
		if (lineIndex >= lines.length) return false;
		if (lines[lineIndex].trim() !== expected.trim()) return false;
		lineIndex++;
	}

	return true;
}

// ============================================
// FILE TRANSACTION
// ============================================

export interface FileOperation {
	type: 'write' | 'delete' | 'rename';
	path: string;
	content?: string;
	newPath?: string; // For rename operations
}

export interface TransactionResult {
	success: boolean;
	completedOps: number;
	error?: string;
	rollbackPerformed: boolean;
}

/**
 * Multi-file atomic transaction support
 * All operations succeed or all are rolled back
 */
export class FileTransaction {
	private operations: FileOperation[] = [];
	private backups: Map<string, string> = new Map();
	private createdFiles: Set<string> = new Set();
	private rootDir: string;

	constructor(rootDir: string) {
		this.rootDir = path.resolve(rootDir);
	}

	/**
	 * Add a write operation to the transaction
	 */
	write(filePath: string, content: string): this {
		const validation = validatePath(filePath, this.rootDir);
		if (!validation.valid) {
			throw new Error(validation.error);
		}
		this.operations.push({
			type: 'write',
			path: validation.resolvedPath,
			content
		});
		return this;
	}

	/**
	 * Add a delete operation to the transaction
	 */
	delete(filePath: string): this {
		const validation = validatePath(filePath, this.rootDir);
		if (!validation.valid) {
			throw new Error(validation.error);
		}
		this.operations.push({
			type: 'delete',
			path: validation.resolvedPath
		});
		return this;
	}

	/**
	 * Add a rename operation to the transaction
	 */
	rename(oldPath: string, newPath: string): this {
		const oldValidation = validatePath(oldPath, this.rootDir);
		const newValidation = validatePath(newPath, this.rootDir);

		if (!oldValidation.valid) throw new Error(oldValidation.error);
		if (!newValidation.valid) throw new Error(newValidation.error);

		this.operations.push({
			type: 'rename',
			path: oldValidation.resolvedPath,
			newPath: newValidation.resolvedPath
		});
		return this;
	}

	/**
	 * Execute all operations atomically
	 */
	commit(): TransactionResult {
		let completedOps = 0;

		try {
			// Phase 1: Backup all affected files
			for (const op of this.operations) {
				if (fs.existsSync(op.path)) {
					const backup = fs.readFileSync(op.path, 'utf8');
					this.backups.set(op.path, backup);
				}
				if (op.type === 'rename' && op.newPath && fs.existsSync(op.newPath)) {
					const backup = fs.readFileSync(op.newPath, 'utf8');
					this.backups.set(op.newPath, backup);
				}
			}

			// Phase 2: Execute operations
			for (const op of this.operations) {
				switch (op.type) {
					case 'write':
						const dir = path.dirname(op.path);
						if (!fs.existsSync(dir)) {
							fs.mkdirSync(dir, { recursive: true });
						}
						if (!this.backups.has(op.path)) {
							this.createdFiles.add(op.path);
						}
						fs.writeFileSync(op.path, op.content!, 'utf8');
						break;

					case 'delete':
						if (fs.existsSync(op.path)) {
							fs.unlinkSync(op.path);
						}
						break;

					case 'rename':
						if (op.newPath) {
							const newDir = path.dirname(op.newPath);
							if (!fs.existsSync(newDir)) {
								fs.mkdirSync(newDir, { recursive: true });
							}
							fs.renameSync(op.path, op.newPath);
						}
						break;
				}
				completedOps++;
			}

			return {
				success: true,
				completedOps,
				rollbackPerformed: false
			};

		} catch (error) {
			// Rollback all changes
			const rollbackResult = this.rollback();

			return {
				success: false,
				completedOps,
				error: error instanceof Error ? error.message : 'Transaction failed',
				rollbackPerformed: rollbackResult
			};
		}
	}

	/**
	 * Rollback all changes
	 */
	private rollback(): boolean {
		try {
			// Restore backups
			for (const [filePath, content] of this.backups) {
				fs.writeFileSync(filePath, content, 'utf8');
			}

			// Delete newly created files
			for (const filePath of this.createdFiles) {
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
			}

			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get the list of planned operations
	 */
	getOperations(): readonly FileOperation[] {
		return this.operations;
	}

	/**
	 * Clear all planned operations
	 */
	clear(): void {
		this.operations = [];
		this.backups.clear();
		this.createdFiles.clear();
	}
}

// ============================================
// ENHANCED ARTIFACT APPLIER
// ============================================

export interface Artifact {
	type: 'file' | 'diff';
	filePath: string;
	content: string;
	language?: string;
}

export interface ApplyArtifactResult {
	success: boolean;
	message: string;
	backupPath?: string;
}

/**
 * Safely apply an artifact (file or diff) with full validation and backup
 */
export async function applyArtifactSafe(
	artifact: Artifact,
	projectRoot: string
): Promise<ApplyArtifactResult> {
	// Validate path
	const validation = validatePath(artifact.filePath, projectRoot);
	if (!validation.valid) {
		return {
			success: false,
			message: validation.error || 'Path validation failed'
		};
	}

	const fullPath = validation.resolvedPath;

	try {
		if (artifact.type === 'diff') {
			// Apply diff
			if (!fs.existsSync(fullPath)) {
				return {
					success: false,
					message: `Cannot apply diff: file does not exist: ${artifact.filePath}`
				};
			}

			const originalContent = fs.readFileSync(fullPath, 'utf8');
			const diffs = parseUnifiedDiff(artifact.content);

			if (diffs.length === 0) {
				return {
					success: false,
					message: 'No valid diff hunks found in content'
				};
			}

			// Apply first diff (typically there's only one per artifact)
			const result = applyDiff(originalContent, diffs[0]);

			if (!result.success || !result.content) {
				return {
					success: false,
					message: result.error || 'Diff application failed'
				};
			}

			// Write with atomic backup
			const writeResult = atomicWrite(fullPath, result.content);
			if (!writeResult.success) {
				return {
					success: false,
					message: writeResult.error || 'Failed to write patched file'
				};
			}

			return {
				success: true,
				message: `Diff applied: ${result.appliedHunks} hunks succeeded, ${result.failedHunks} failed`,
				backupPath: writeResult.backupPath
			};

		} else {
			// Write new file
			const writeResult = atomicWrite(fullPath, artifact.content, {
				backup: fs.existsSync(fullPath),
				createDirs: true
			});

			if (!writeResult.success) {
				return {
					success: false,
					message: writeResult.error || 'Failed to write file'
				};
			}

			return {
				success: true,
				message: `File written: ${artifact.filePath}`,
				backupPath: writeResult.backupPath
			};
		}

	} catch (error) {
		return {
			success: false,
			message: error instanceof Error ? error.message : 'Unknown error applying artifact'
		};
	}
}

// ============================================
// EXPORTS SUMMARY
// ============================================

export default {
	// Path validation
	validatePath,

	// Atomic file operations
	atomicWrite,
	cleanupBackups,

	// Safe command execution
	safeExecSync,
	safeExecAsync,

	// Diff operations
	parseUnifiedDiff,
	applyDiff,

	// Transaction support
	FileTransaction,

	// High-level artifact handling
	applyArtifactSafe
};
