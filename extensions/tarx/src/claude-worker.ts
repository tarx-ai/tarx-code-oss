/**
 * TARX Claude Work Queue Processor
 * Polls ~/TARX/claude-work-queue.txt for tasks
 *
 * @file extensions/tarx/src/claude-worker.ts
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ========================================
// CONFIGURATION
// ========================================

const POLL_INTERVAL_MS = 30000; // 30 seconds
const WORK_QUEUE_PATH = path.join(os.homedir(), 'TARX', 'claude-work-queue.txt');
const WORKER_LOG_PATH = path.join(os.homedir(), 'TARX', 'claude-worker.log');

// ========================================
// WORKER STATE
// ========================================

let workerInterval: NodeJS.Timeout | null = null;
let lastFileSize = 0;
let lastProcessedTime = Date.now();
let isProcessing = false;

// ========================================
// LOGGING
// ========================================

function logWorker(message: string): void {
	const timestamp = new Date().toISOString();
	const logEntry = `[${timestamp}] [Claude Worker] ${message}\n`;

	console.log(`[TARX Worker] ${message}`);

	try {
		fs.appendFileSync(WORKER_LOG_PATH, logEntry);
	} catch (e) {
		// Silent fail
	}
}

// ========================================
// TASK PROCESSING
// ========================================

interface WorkTask {
	id: string;
	type: 'audit' | 'generate' | 'improve' | 'sync' | 'unknown';
	description: string;
	timestamp: number;
}

function parseTaskFromContent(content: string): WorkTask | null {
	const lines = content.trim().split('\n').filter(l => l.trim());
	if (lines.length === 0) return null;

	// Get the last unprocessed task (lines not starting with [DONE] or [Claude Worker])
	const unprocessedLines = lines.filter(l =>
		!l.startsWith('[DONE]') &&
		!l.startsWith('[Claude Worker]') &&
		!l.startsWith('[PROCESSED]')
	);

	if (unprocessedLines.length === 0) return null;

	const taskLine = unprocessedLines[unprocessedLines.length - 1];

	// Detect task type
	let type: WorkTask['type'] = 'unknown';
	const lowerTask = taskLine.toLowerCase();

	if (lowerTask.includes('audit')) type = 'audit';
	else if (lowerTask.includes('generate')) type = 'generate';
	else if (lowerTask.includes('improve') || lowerTask.includes('enhance')) type = 'improve';
	else if (lowerTask.includes('sync') || lowerTask.includes('database')) type = 'sync';

	return {
		id: `task-${Date.now()}`,
		type,
		description: taskLine,
		timestamp: Date.now()
	};
}

async function processTask(task: WorkTask): Promise<string> {
	logWorker(`Processing task: ${task.type} - "${task.description}"`);

	switch (task.type) {
		case 'audit':
			return await auditCode(task.description);
		case 'generate':
			return await generateCode(task.description);
		case 'improve':
			return await suggestImprovements(task.description);
		case 'sync':
			return await checkDatabaseSync(task.description);
		default:
			return `Task acknowledged: "${task.description}"\nType: ${task.type}\nStatus: Queued for manual review`;
	}
}

// ========================================
// TASK HANDLERS
// ========================================

async function auditCode(description: string): Promise<string> {
	const results: string[] = [];
	const tarxSrcPath = path.join(os.homedir(), 'Desktop', 'tarx-code-oss', 'extensions', 'tarx', 'src');

	// Check for common issues
	const filesToCheck = [
		'extension.ts',
		'sqliteDatabase.ts',
		'tarxClient.ts',
		'chatContext.ts'
	];

	for (const file of filesToCheck) {
		const filePath = path.join(tarxSrcPath, file);
		if (fs.existsSync(filePath)) {
			const content = fs.readFileSync(filePath, 'utf8');
			const issues = auditFileContent(file, content);
			if (issues.length > 0) {
				results.push(`\n## ${file}\n${issues.join('\n')}`);
			}
		}
	}

	if (results.length === 0) {
		return 'Audit complete: No critical issues found.';
	}

	return `# Code Audit Results\n${results.join('\n')}`;
}

function auditFileContent(filename: string, content: string): string[] {
	const issues: string[] = [];

	// Check for unsafe patterns
	if (content.includes('eval(')) {
		issues.push('- ⚠️ Contains eval() - potential security risk');
	}
	if (content.includes('execSync') && !content.includes('timeout')) {
		issues.push('- ⚠️ execSync without timeout - could hang');
	}
	if (content.includes('.replace(/\'/g') && content.includes('sql')) {
		issues.push('- 📝 SQL string escaping detected - consider parameterized queries');
	}
	if (content.includes('catch (') && content.includes('// Silent')) {
		issues.push('- 📝 Silent catch blocks - consider logging errors');
	}

	// Check for missing error handling
	const asyncFunctions = content.match(/async\s+\w+\s*\([^)]*\)/g) || [];
	const tryBlocks = (content.match(/try\s*{/g) || []).length;
	if (asyncFunctions.length > tryBlocks + 2) {
		issues.push(`- 📝 ${asyncFunctions.length} async functions but only ${tryBlocks} try blocks`);
	}

	return issues;
}

async function generateCode(description: string): Promise<string> {
	// Parse what type of code to generate
	const lowerDesc = description.toLowerCase();

	if (lowerDesc.includes('file write') || lowerDesc.includes('safe write')) {
		return generateSafeFileWrite();
	}
	if (lowerDesc.includes('rag') || lowerDesc.includes('chunk')) {
		return generateRagChunking();
	}
	if (lowerDesc.includes('exec') || lowerDesc.includes('execution')) {
		return generateSafeExec();
	}

	return `Code generation requested: "${description}"\nPlease specify: file-write, rag-chunking, or safe-exec`;
}

function generateSafeFileWrite(): string {
	return `
\`\`\`typescript:extensions/tarx/src/utils/safeFileWrite.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Safely write content to a file with backup and validation
 */
export async function safeFileWrite(
	filePath: string,
	content: string,
	options: { backup?: boolean; createDirs?: boolean } = {}
): Promise<{ success: boolean; error?: string; backupPath?: string }> {
	const { backup = true, createDirs = true } = options;

	try {
		// Validate path
		const resolvedPath = path.resolve(filePath);
		if (resolvedPath.includes('..')) {
			return { success: false, error: 'Path traversal detected' };
		}

		// Create directories if needed
		if (createDirs) {
			const dir = path.dirname(resolvedPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
		}

		// Backup existing file
		let backupPath: string | undefined;
		if (backup && fs.existsSync(resolvedPath)) {
			backupPath = \`\${resolvedPath}.backup.\${Date.now()}\`;
			fs.copyFileSync(resolvedPath, backupPath);
		}

		// Write atomically using temp file
		const tempPath = \`\${resolvedPath}.tmp.\${Date.now()}\`;
		fs.writeFileSync(tempPath, content, 'utf8');
		fs.renameSync(tempPath, resolvedPath);

		return { success: true, backupPath };

	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}
\`\`\`
`;
}

function generateRagChunking(): string {
	return `
\`\`\`typescript:extensions/tarx/src/utils/ragChunking.ts
/**
 * RAG-optimized text chunking with overlap
 */
export interface ChunkOptions {
	maxTokens: number;
	overlapTokens: number;
	preserveCodeBlocks: boolean;
}

export function chunkText(
	text: string,
	options: ChunkOptions = { maxTokens: 512, overlapTokens: 64, preserveCodeBlocks: true }
): string[] {
	const { maxTokens, overlapTokens, preserveCodeBlocks } = options;
	const chunks: string[] = [];

	// Rough token estimation (4 chars per token)
	const charsPerChunk = maxTokens * 4;
	const overlapChars = overlapTokens * 4;

	if (preserveCodeBlocks) {
		// Split on code block boundaries first
		const parts = text.split(/(\\x60\\x60\\x60[\\s\\S]*?\\x60\\x60\\x60)/g);
		for (const part of parts) {
			if (part.startsWith('\\x60\\x60\\x60')) {
				// Keep code blocks intact if under limit
				if (part.length <= charsPerChunk * 2) {
					chunks.push(part);
					continue;
				}
			}
			// Chunk regular text
			chunks.push(...chunkPlainText(part, charsPerChunk, overlapChars));
		}
	} else {
		chunks.push(...chunkPlainText(text, charsPerChunk, overlapChars));
	}

	return chunks;
}

function chunkPlainText(text: string, maxChars: number, overlap: number): string[] {
	const chunks: string[] = [];
	let start = 0;

	while (start < text.length) {
		let end = Math.min(start + maxChars, text.length);

		// Try to break at sentence/paragraph boundary
		if (end < text.length) {
			const breakPoints = ['. ', '\\n\\n', '\\n', '. ', ', '];
			for (const bp of breakPoints) {
				const idx = text.lastIndexOf(bp, end);
				if (idx > start + maxChars / 2) {
					end = idx + bp.length;
					break;
				}
			}
		}

		chunks.push(text.slice(start, end).trim());
		start = end - overlap;
	}

	return chunks.filter(c => c.length > 0);
}
\`\`\`
`;
}

function generateSafeExec(): string {
	return `
\`\`\`typescript:extensions/tarx/src/utils/safeExec.ts
import { exec, ExecOptions } from 'child_process';

export interface SafeExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	timedOut: boolean;
}

/**
 * Execute command with timeout and resource limits
 */
export async function safeExec(
	command: string,
	options: {
		timeout?: number;
		maxBuffer?: number;
		cwd?: string;
		env?: NodeJS.ProcessEnv;
	} = {}
): Promise<SafeExecResult> {
	const {
		timeout = 30000,        // 30 seconds default
		maxBuffer = 1024 * 1024, // 1MB default
		cwd = process.cwd(),
		env = process.env
	} = options;

	return new Promise((resolve) => {
		const child = exec(command, {
			timeout,
			maxBuffer,
			cwd,
			env,
			windowsHide: true
		}, (error, stdout, stderr) => {
			resolve({
				stdout: stdout || '',
				stderr: stderr || '',
				exitCode: error?.code ?? 0,
				timedOut: error?.killed ?? false
			});
		});
	});
}
\`\`\`
`;
}

async function suggestImprovements(description: string): Promise<string> {
	return `# Improvement Suggestions for: ${description}

## Performance
- Consider lazy loading for sidebar providers
- Use debouncing for frequent operations
- Cache SQLite query results with TTL

## Reliability
- Add retry logic for database operations
- Implement graceful degradation when services unavailable
- Add health checks with exponential backoff

## UX
- Show loading states during async operations
- Add progress indicators for long tasks
- Provide clear error messages with recovery actions
`;
}

async function checkDatabaseSync(description: string): Promise<string> {
	const dbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

	if (!fs.existsSync(dbPath)) {
		return '❌ Database not found at ~/Library/Application Support/tarx/memory.db';
	}

	const stats = fs.statSync(dbPath);
	const lastModified = new Date(stats.mtime).toISOString();
	const sizeKB = Math.round(stats.size / 1024);

	return `# Database Status

- **Path**: ${dbPath}
- **Size**: ${sizeKB} KB
- **Last Modified**: ${lastModified}
- **Status**: Accessible
`;
}

// ========================================
// MAIN POLL FUNCTION
// ========================================

async function pollWorkQueue(): Promise<void> {
	if (isProcessing) {
		logWorker('Skipping poll - previous task still processing');
		return;
	}

	try {
		// Ensure directory exists
		const tarxDir = path.join(os.homedir(), 'TARX');
		if (!fs.existsSync(tarxDir)) {
			fs.mkdirSync(tarxDir, { recursive: true });
		}

		// Check if queue file exists
		if (!fs.existsSync(WORK_QUEUE_PATH)) {
			// Create with standing by message
			const standbyMsg = `[Claude Worker] Standing by. Last check: ${new Date().toISOString()}\n`;
			fs.writeFileSync(WORK_QUEUE_PATH, standbyMsg);
			logWorker('Created work queue file - standing by');
			return;
		}

		// Check for new content
		const stats = fs.statSync(WORK_QUEUE_PATH);
		if (stats.size === lastFileSize) {
			// No changes - update standing by status
			const content = fs.readFileSync(WORK_QUEUE_PATH, 'utf8');
			if (!content.includes('Standing by')) {
				return; // Has content, don't overwrite
			}
			const standbyMsg = `[Claude Worker] Standing by. Last check: ${new Date().toISOString()}\n`;
			fs.writeFileSync(WORK_QUEUE_PATH, standbyMsg);
			return;
		}

		lastFileSize = stats.size;

		// Read and parse content
		const content = fs.readFileSync(WORK_QUEUE_PATH, 'utf8');
		const task = parseTaskFromContent(content);

		if (!task) {
			logWorker('No new tasks found');
			return;
		}

		// Process task
		isProcessing = true;
		const result = await processTask(task);
		lastProcessedTime = Date.now();

		// Write result back
		const timestamp = new Date().toISOString();
		const response = `\n[PROCESSED ${timestamp}] Task: ${task.description}\n${result}\n[/PROCESSED]\n`;
		fs.appendFileSync(WORK_QUEUE_PATH, response);

		logWorker(`Task completed: ${task.type}`);

	} catch (error) {
		logWorker(`Poll error: ${error instanceof Error ? error.message : 'Unknown'}`);
	} finally {
		isProcessing = false;
	}
}

// ========================================
// PUBLIC API
// ========================================

export function startClaudeWorker(): void {
	if (workerInterval) {
		logWorker('Worker already running');
		return;
	}

	logWorker('Claude continuous worker online. Polling ~/TARX/claude-work-queue.txt every 30s.');

	// Initial poll
	pollWorkQueue();

	// Start interval
	workerInterval = setInterval(pollWorkQueue, POLL_INTERVAL_MS);
}

export function stopClaudeWorker(): void {
	if (workerInterval) {
		clearInterval(workerInterval);
		workerInterval = null;
		logWorker('Claude worker stopped');
	}
}

export function getWorkerStatus(): { running: boolean; lastProcessed: number } {
	return {
		running: workerInterval !== null,
		lastProcessed: lastProcessedTime
	};
}

// ========================================
// VS CODE COMMAND REGISTRATION
// ========================================

export function registerClaudeWorkerCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.startClaudeWorker', () => {
			startClaudeWorker();
			vscode.window.showInformationMessage('Claude Worker started - polling every 30s');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.stopClaudeWorker', () => {
			stopClaudeWorker();
			vscode.window.showInformationMessage('Claude Worker stopped');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.claudeWorkerStatus', () => {
			const status = getWorkerStatus();
			const lastTime = new Date(status.lastProcessed).toLocaleTimeString();
			vscode.window.showInformationMessage(
				`Claude Worker: ${status.running ? 'Running' : 'Stopped'} | Last task: ${lastTime}`
			);
		})
	);

	// Auto-start if configured
	const config = vscode.workspace.getConfiguration('tarx');
	if (config.get<boolean>('autoStartClaudeWorker', false)) {
		startClaudeWorker();
	}

	// Clean up on deactivation
	context.subscriptions.push({ dispose: () => stopClaudeWorker() });

	logWorker('Claude Worker commands registered');
}
